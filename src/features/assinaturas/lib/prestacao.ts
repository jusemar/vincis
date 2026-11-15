import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturaCompetencias, assinaturas } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { situacaoOperacionalDoPlano } from '../constants/contador-responsavel'
import {
  garantirComissaoRecorrenteSemDerrubar,
  type ResultadoDaComissaoRecorrente,
} from '@/features/parceiros/lib/comissao-recorrente'
import { coberturaDasCompetencias } from './pagamentos'

export type ResultadoDoCumprimento =
  | {
      ok: true
      /** O mês já estava cumprido: nada mudou nele agora. */
      jaEstavaCumprida: boolean
      comissao: ResultadoDaComissaoRecorrente
    }
  | { ok: false; motivo: 'competencia_inexistente' | 'competencia_cancelada' | 'pagamento_nao_confirmado' }

/**
 * Registra que um mês de assinatura foi prestado.
 *
 * ## Prestado, não pago
 *
 * É o outro lado do pagamento: pagar adiantado não cumpre mês nenhum, e cumprir
 * um mês não prova que ele foi pago. Mas a prestação só **começa** depois do
 * primeiro pagamento confirmado: plano `aguardando_pagamento` recusa
 * (`pagamento_nao_confirmado`).
 *
 * No plano **mensal**, cada mês só é cumprido com o próprio valor coberto por
 * pagamento `confirmado` — a renovação é paga mês a mês, e mês em aberto (ou em
 * atraso) não é prestado (`pagamento_nao_confirmado`). Semestral e anual foram
 * pagos adiantados na contratação e seguem a regra de antes. Fora isso, só move
 * o mês de `prevista`/`em_andamento` para `cumprida`. Mês cancelado não se
 * cumpre. Mês que já estava cumprido continua cumprido — repetir não reconfere
 * dinheiro nem desfaz nada.
 *
 * ## E então a comissão
 *
 * Depois de cumprido, pergunta se o mês já tem direito à comissão recorrente.
 * Se o pagamento ainda não chegou, a resposta é não — e a confirmação do
 * pagamento, quando vier, faz a mesma pergunta. Repetir o cumprimento de um mês
 * já cumprido não muda nada nele e só refaz a pergunta, que é idempotente.
 *
 * ## Quem chama
 *
 * Nenhuma tela ainda: a operação de prestação é fatia futura. Não é Server
 * Action nem rota — hoje, só o script de homologação e os testes.
 */
export async function cumprirCompetencia({
  competenciaId,
  autorId = null,
}: {
  competenciaId: string
  autorId?: string | null
}): Promise<ResultadoDoCumprimento> {
  return db.transaction(async (tx) => {
    const [competencia] = await tx
      .select({
        id: assinaturaCompetencias.id,
        assinaturaId: assinaturaCompetencias.assinaturaId,
        numero: assinaturaCompetencias.numero,
        status: assinaturaCompetencias.status,
        valorBaseCentavos: assinaturaCompetencias.valorBaseCentavos,
      })
      .from(assinaturaCompetencias)
      .where(eq(assinaturaCompetencias.id, competenciaId))
      .limit(1)
      .for('update')
    if (!competencia) return { ok: false as const, motivo: 'competencia_inexistente' as const }
    if (competencia.status === 'cancelada') {
      return { ok: false as const, motivo: 'competencia_cancelada' as const }
    }
    /*
      Prestação só depois do pagamento confirmado. Enquanto o plano espera o
      primeiro pagamento, o contador vê a contratação mas não começa a prestar
      — e o mês não pode ser dado como cumprido. A confirmação da Efí ativa o
      plano (`lib/pagamentos.ts`) e esta porta abre sozinha.
    */
    const [plano] = await tx
      .select({ status: assinaturas.status, periodicidade: assinaturas.periodicidade })
      .from(assinaturas)
      .where(eq(assinaturas.id, competencia.assinaturaId))
      .limit(1)
    if (!plano || situacaoOperacionalDoPlano(plano.status) === 'aguardando_pagamento') {
      return { ok: false as const, motivo: 'pagamento_nao_confirmado' as const }
    }

    const jaEstavaCumprida = competencia.status === 'cumprida'

    // Mensal: o mês precisa estar pago (confirmado) para ser dado como prestado.
    if (!jaEstavaCumprida && plano.periodicidade === 'mensal') {
      const cobertura = await coberturaDasCompetencias(tx, competencia.assinaturaId)
      if ((cobertura.get(competencia.id) ?? 0) < competencia.valorBaseCentavos) {
        return { ok: false as const, motivo: 'pagamento_nao_confirmado' as const }
      }
    }
    if (!jaEstavaCumprida) {
      const agora = new Date()
      await tx
        .update(assinaturaCompetencias)
        .set({ status: 'cumprida', cumpridaEm: agora, updatedAt: agora })
        .where(
          and(
            eq(assinaturaCompetencias.id, competencia.id),
            inArray(assinaturaCompetencias.status, ['prevista', 'em_andamento']),
          ),
        )

      const [contrato] = await tx
        .select({ clienteUsuarioId: assinaturas.clienteUsuarioId })
        .from(assinaturas)
        .where(eq(assinaturas.id, competencia.assinaturaId))
        .limit(1)
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.competenciaAssinaturaCumprida,
          entidade: 'assinatura_competencias',
          registroAfetado: competencia.id,
          autorId,
          usuarioId: contrato?.clienteUsuarioId ?? null,
          origem: 'sistema',
          metadados: {
            assinaturaId: competencia.assinaturaId,
            competencia: competencia.numero,
          },
        },
        tx,
      )
    }

    const comissao = await garantirComissaoRecorrenteSemDerrubar(tx, competencia.id)
    return { ok: true as const, jaEstavaCumprida, comissao }
  })
}
