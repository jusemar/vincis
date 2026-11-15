import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { oportunidadePagamentos, oportunidadePropostas, oportunidades } from '@/db/schema'
import { garantirAtendimentoDaOportunidade } from '@/features/atendimentos/lib/criar-atendimento-da-oportunidade'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import { avisarEmTempoReal } from '@/features/oportunidades/lib/difundir-oportunidade'
import type { AplicarEfeito } from '../types/efeito'
import { colunasDoRetrato, retratoDoContexto, type RetratoComissaoVincis } from './comissao-vincis'

/** O acordo fechado de uma oportunidade: proposta aceita + partes + valor. */
export type AcordoFechado = {
  oportunidadeId: string
  titulo: string
  clienteUsuarioId: string
  propostaId: string
  prestadorId: string
  valorAcordadoCentavos: number | null
  /** `avulsa` (pode ser paga pela Vincis) ou `recorrente` (direta, sem Pix). */
  natureza: string
}

/**
 * Proposta recorrente do contador Autônomo: cliente e contador negociam e
 * pagam diretamente. A Vincis não emite Pix, não cobra e não comissiona.
 */
export const MENSAGEM_ACORDO_RECORRENTE_DIRETO =
  'Este acordo é uma relação contábil recorrente: o pagamento é combinado diretamente com o contador, sem Pix da Vincis.'

export function acordoRecorrente(acordo: Pick<AcordoFechado, 'natureza'>): boolean {
  return acordo.natureza === 'recorrente'
}

/** Lê o acordo (proposta aceita). Sem proposta aceita, não há o que pagar. */
export async function buscarAcordo(
  executor: Pick<typeof db, 'select'>,
  oportunidadeId: string,
): Promise<AcordoFechado | null> {
  const [acordo] = await executor
    .select({
      oportunidadeId: oportunidades.id,
      titulo: oportunidades.titulo,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      propostaId: oportunidadePropostas.id,
      prestadorId: oportunidadePropostas.prestadorId,
      valorAcordadoCentavos: oportunidadePropostas.valorAcordadoCentavos,
      natureza: oportunidadePropostas.natureza,
    })
    .from(oportunidades)
    .innerJoin(oportunidadePropostas, eq(oportunidadePropostas.oportunidadeId, oportunidades.id))
    .where(and(eq(oportunidades.id, oportunidadeId), eq(oportunidadePropostas.status, 'aceita')))
    .limit(1)
  return acordo ?? null
}

/**
 * Grava o pagamento do acordo e abre o Atendimento — a fronteira única de
 * "existe acordo" para "existe Atendimento", agora compartilhada entre a
 * simulação (só na suíte) e o Pix real.
 *
 * `oportunidade_pagamentos_unico` e `atendimentos_oportunidade_unico` seguem
 * sendo as travas: chamadas repetidas convergem para o mesmo par.
 */
export async function efetivarAcordo(
  tx: TransacaoDb,
  acordo: AcordoFechado,
  pagamento: {
    valorCentavos: number
    status: string
    origem: string
    referencia: string
    /** Retrato da comissão Vincis congelado no Pix. Ausente na simulação. */
    comissaoVincis?: RetratoComissaoVincis | null
  },
) {
  // Defesa final: recorrente nunca vira pagamento na Vincis, venha de onde vier.
  if (acordoRecorrente(acordo)) throw new Error('Acordo recorrente não é pago pela Vincis.')

  const [criado] = await tx
    .insert(oportunidadePagamentos)
    .values({
      oportunidadeId: acordo.oportunidadeId,
      propostaId: acordo.propostaId,
      clienteUsuarioId: acordo.clienteUsuarioId,
      prestadorId: acordo.prestadorId,
      valorCentavos: pagamento.valorCentavos,
      status: pagamento.status,
      origem: pagamento.origem,
      referencia: pagamento.referencia,
      ...colunasDoRetrato(pagamento.comissaoVincis, pagamento.valorCentavos),
    })
    .onConflictDoNothing({ target: oportunidadePagamentos.oportunidadeId })
    .returning({
      id: oportunidadePagamentos.id,
      referencia: oportunidadePagamentos.referencia,
      valorCentavos: oportunidadePagamentos.valorCentavos,
      aprovadoEm: oportunidadePagamentos.aprovadoEm,
    })

  const registrado =
    criado ??
    (
      await tx
        .select({
          id: oportunidadePagamentos.id,
          referencia: oportunidadePagamentos.referencia,
          valorCentavos: oportunidadePagamentos.valorCentavos,
          aprovadoEm: oportunidadePagamentos.aprovadoEm,
        })
        .from(oportunidadePagamentos)
        .where(eq(oportunidadePagamentos.oportunidadeId, acordo.oportunidadeId))
        .limit(1)
    )[0]
  if (!registrado) throw new Error('Pagamento não encontrado após conflito de unicidade.')

  // Acordo "a combinar" ganha número só na primeira vez (simulação na suíte).
  if (criado && acordo.valorAcordadoCentavos === null) {
    await tx
      .update(oportunidadePropostas)
      .set({ valorAcordadoCentavos: pagamento.valorCentavos, updatedAt: new Date() })
      .where(
        and(
          eq(oportunidadePropostas.id, acordo.propostaId),
          isNull(oportunidadePropostas.valorAcordadoCentavos),
        ),
      )
  }

  const atendimento = await garantirAtendimentoDaOportunidade(tx, acordo.oportunidadeId)
  return { pagamento: registrado, atendimento, novo: Boolean(criado) }
}

/** Sino + tempo real do Profissional. Só na primeira efetivação. */
export async function avisarAcordoPago(
  acordo: AcordoFechado,
  atendimento: { id: string; protocolo: string },
  autorId: string,
) {
  await emitirNotificacoes(db, {
    destinatarios: [acordo.prestadorId],
    autorId,
    tipo: TIPOS_NOTIFICACAO.pagamentoAprovado,
    titulo: 'Pagamento aprovado · Atendimento criado',
    resumo: resumirTexto(`${atendimento.protocolo} · ${acordo.titulo}`, 200),
    recursoTipo: 'atendimento',
    recursoId: atendimento.id,
    atendimentoId: atendimento.id,
    protocolo: atendimento.protocolo,
    destino: { pagina: 'atendimentos', atendimento: atendimento.protocolo },
    chaveDedupe: `${TIPOS_NOTIFICACAO.pagamentoAprovado}:${acordo.oportunidadeId}`,
  })
  await avisarEmTempoReal({
    destinatarios: [acordo.prestadorId],
    titulo: 'Pagamento aprovado · Atendimento criado',
    oportunidadeId: acordo.oportunidadeId,
    autorId,
  })
}

/**
 * Efeito do Pix confirmado de um acordo de orçamento.
 *
 * O valor pago é o da cobrança, que foi emitida com o `valor_acordado` relido
 * do banco. Se o acordo já tinha sido pago por outra cobrança, o segundo Pix
 * não abre um segundo Atendimento: vira `conflito` (estorno manual).
 */
export const efetivarAcordoPago: AplicarEfeito = async (tx, cobranca) => {
  const acordo = await buscarAcordo(tx, cobranca.referenciaId)
  if (!acordo || acordo.clienteUsuarioId !== cobranca.clienteUsuarioId) {
    return { efeito: 'conflito', motivo: 'Acordo pago não está mais fechado.' }
  }
  if (acordoRecorrente(acordo)) {
    return { efeito: 'conflito', motivo: 'Acordo recorrente não é pago pela Vincis.' }
  }

  const efetivado = await efetivarAcordo(tx, acordo, {
    valorCentavos: cobranca.valorCentavos,
    status: 'aprovado',
    origem: 'efi',
    referencia: cobranca.txid,
    comissaoVincis: retratoDoContexto(cobranca.contexto),
  })

  if (!efetivado.novo && efetivado.pagamento.referencia !== cobranca.txid) {
    return { efeito: 'conflito', motivo: 'Acordo já pago por outra cobrança.' }
  }

  return {
    efeito: 'aplicado',
    referenciaId: efetivado.pagamento.id,
    atendimentoId: efetivado.atendimento.id,
    protocolo: efetivado.atendimento.protocolo,
    novo: efetivado.novo,
    aposConfirmar: async () => {
      await avisarAcordoPago(acordo, efetivado.atendimento, cobranca.clienteUsuarioId)
      revalidatePath('/cliente')
      revalidatePath('/admin')
    },
  }
}
