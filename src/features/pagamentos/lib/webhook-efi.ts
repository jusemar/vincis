import { and, asc, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cobrancasPix, efiWebhookEventos } from '@/db/schema'
import type { AvisoDePix } from '@/integracoes/efi/webhook'
import { sincronizarCobranca } from './cobrancas'

export type ResumoDoWebhook = {
  recebidos: number
  processados: number
  repetidos: number
  ignorados: number
  erros: number
}

async function anotar(identificador: string, situacao: string, detalhe?: string, cobrancaId?: string) {
  await db
    .update(efiWebhookEventos)
    .set({
      situacao,
      detalhe: detalhe?.slice(0, 300) ?? null,
      cobrancaId: cobrancaId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(efiWebhookEventos.identificadorEvento, identificador))
}

/**
 * Processa os avisos de Pix recebidos pelo webhook da Efí.
 *
 * ## O aviso é só um aviso
 *
 * Para cada Pix citado: registra o evento (único por `endToEndId`), acha a
 * cobrança pelo txid e **pergunta à Efí** se ela foi paga
 * (`sincronizarCobranca`, forçando a consulta). O valor, o horário e o próprio
 * `endToEndId` usados na confirmação são os da resposta autenticada da Efí, não
 * os do corpo recebido — um corpo forjado não confirma nada.
 *
 * ## Repetição
 *
 * A Efí reenvia avisos. O segundo `endToEndId` igual não grava evento novo e
 * não reprocessa: é contado como repetido. Mesmo que reprocessasse, a
 * confirmação é idempotente por trava de linha e índices únicos.
 */
export async function processarAvisosDePix(avisos: AvisoDePix[]): Promise<ResumoDoWebhook> {
  const resumo: ResumoDoWebhook = { recebidos: avisos.length, processados: 0, repetidos: 0, ignorados: 0, erros: 0 }

  for (const aviso of avisos) {
    const [novo] = await db
      .insert(efiWebhookEventos)
      .values({
        identificadorEvento: aviso.endToEndId,
        txid: aviso.txid,
        situacao: 'recebido',
        // Só o resumo do Pix — nada de cabeçalho, token ou dado do pagador.
        payload: { txid: aviso.txid, valor: aviso.valor ?? null, horario: aviso.horario ?? null },
      })
      .onConflictDoNothing({ target: efiWebhookEventos.identificadorEvento })
      .returning({ id: efiWebhookEventos.id })

    if (!novo) {
      resumo.repetidos += 1
      continue
    }

    const [cobranca] = await db
      .select({ id: cobrancasPix.id })
      .from(cobrancasPix)
      .where(eq(cobrancasPix.txid, aviso.txid))
      .limit(1)
    if (!cobranca) {
      await anotar(aviso.endToEndId, 'ignorado', 'txid desconhecido')
      resumo.ignorados += 1
      continue
    }

    try {
      const atual = await sincronizarCobranca(cobranca.id, { forcar: true })
      if (atual?.status === 'paga') {
        await anotar(aviso.endToEndId, 'processado', atual.efeito ?? undefined, cobranca.id)
        resumo.processados += 1
      } else {
        // A Efí não confirmou (ou não respondeu): o evento fica registrado e a
        // reconciliação volta a perguntar.
        await anotar(aviso.endToEndId, 'ignorado', `efi: ${atual?.status ?? 'sem resposta'}`, cobranca.id)
        resumo.ignorados += 1
      }
    } catch (erro) {
      await anotar(aviso.endToEndId, 'erro', erro instanceof Error ? erro.name : 'Erro', cobranca.id)
      resumo.erros += 1
    }
  }
  return resumo
}

const LIMITE_POR_EXECUCAO = 50

/**
 * A rede de segurança: cobranças vencidas ainda sem desfecho.
 *
 * Webhook perdido, Efí fora do ar na hora do aviso, deploy no meio do caminho:
 * para cada cobrança `aguardando_pagamento` com validade vencida, pergunta à
 * Efí. Paga → confirma pelo caminho de sempre; não paga → `expirada`.
 */
export async function reconciliarCobrancasPix(agora = new Date()) {
  const pendentes = await db
    .select({ id: cobrancasPix.id })
    .from(cobrancasPix)
    .where(
      and(
        inArray(cobrancasPix.status, ['aguardando_pagamento']),
        isNotNull(cobrancasPix.expiraEm),
        lte(cobrancasPix.expiraEm, agora),
      ),
    )
    .orderBy(asc(cobrancasPix.expiraEm))
    .limit(LIMITE_POR_EXECUCAO)

  let pagas = 0
  let encerradas = 0
  for (const { id } of pendentes) {
    const atual = await sincronizarCobranca(id, { forcar: true })
    if (atual?.status === 'paga') pagas += 1
    else if (atual && atual.status !== 'aguardando_pagamento') encerradas += 1
  }
  return { consultadas: pendentes.length, pagas, encerradas }
}
