'use server'

import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { cobrancasPix, oportunidadePagamentos } from '@/db/schema'
import { MENSAGEM_HONORARIOS_DIRETOS, prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { EXPIRACAO_PIX_SEGUNDOS } from '../constants/cobranca'
import { acordoRecorrente, buscarAcordo, MENSAGEM_ACORDO_RECORRENTE_DIRETO } from '../lib/acordo'
import { retratoComissaoVigente } from '../lib/comissao-vincis'
import { MENSAGEM_COMISSAO_PENDENTE } from '@/features/servicos/constants/comissao'
import { abrirCobrancaPix, paraDTO, sincronizarCobranca } from '../lib/cobrancas'
import type { CobrancaPixDTO } from '../types/cobranca'

const AcordoSchema = z.object({ oportunidadeId: z.string().uuid('Solicitação inválida.') })

export type ResultadoPixAcordo =
  | { situacao: 'cobranca'; cobranca: CobrancaPixDTO }
  | { situacao: 'pago'; protocolo: string | null }
  | { situacao: 'gerando' | 'indisponivel' | 'recusado' | 'sem_valor'; mensagem: string }

/**
 * Valida quem paga e qual acordo — a mesma porta das duas ações abaixo.
 *
 * Paga quem pediu: nem o Profissional, nem outro Cliente, nem quem só conhece o
 * id da solicitação. O valor é o acordado, do banco.
 */
async function acordoPagavel(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { recusa: { situacao: 'recusado', mensagem: 'Entre na sua conta para pagar.' } as const }

  const validacao = AcordoSchema.safeParse(entrada)
  if (!validacao.success) return { recusa: { situacao: 'recusado', mensagem: 'Solicitação inválida.' } as const }

  const acordo = await buscarAcordo(db, validacao.data.oportunidadeId)
  if (!acordo || acordo.clienteUsuarioId !== sessao.id) {
    return {
      recusa: {
        situacao: 'recusado',
        mensagem: 'Esta solicitação ainda não tem um acordo fechado para pagar.',
      } as const,
    }
  }
  return { sessao, acordo }
}

async function jaPago(oportunidadeId: string) {
  const [pago] = await db
    .select({ id: oportunidadePagamentos.id })
    .from(oportunidadePagamentos)
    .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId))
    .limit(1)
  return Boolean(pago)
}

/**
 * Emite (ou reaproveita) o Pix do acordo fechado.
 *
 * ## Sem valor, sem cobrança
 *
 * Acordo "a combinar" não é cobrado: na simulação o Cliente digitava o número,
 * mas com dinheiro real o Cliente não escolhe quanto paga. O Profissional
 * precisa definir o valor na proposta antes de haver Pix.
 */
export async function iniciarPagamentoDoAcordo(entrada: unknown): Promise<ResultadoPixAcordo> {
  const porta = await acordoPagavel(entrada)
  if (porta.recusa) return porta.recusa
  const { sessao, acordo } = porta

  if (acordoRecorrente(acordo)) return { situacao: 'indisponivel', mensagem: MENSAGEM_ACORDO_RECORRENTE_DIRETO }

  if (await jaPago(acordo.oportunidadeId)) return acompanhar(acordo.oportunidadeId, sessao.id)

  if (!acordo.valorAcordadoCentavos || acordo.valorAcordadoCentavos <= 0) {
    return {
      situacao: 'sem_valor',
      mensagem:
        'Este acordo ainda está com o valor a combinar. O profissional precisa definir o valor antes do pagamento.',
    }
  }

  // Serviço avulso pago pela Vincis: a comissão configurada é obrigatória e
  // fica congelada na cobrança (e depois no pagamento).
  // Advocacia não passa pela Vincis: a resposta é a de honorários, não a de comissão.
  if (await prestadorCobraDiretamente(db, acordo.prestadorId)) {
    return { situacao: 'indisponivel', mensagem: MENSAGEM_HONORARIOS_DIRETOS }
  }
  const comissaoVincis = await retratoComissaoVigente(acordo.valorAcordadoCentavos)
  if (!comissaoVincis) {
    console.warn('[ACORDO_SEM_COMISSAO]', { oportunidadeId: acordo.oportunidadeId })
    return { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE }
  }

  const aberta = await abrirCobrancaPix({
    finalidade: 'acordo',
    referenciaId: acordo.oportunidadeId,
    clienteUsuarioId: sessao.id,
    prestadorId: acordo.prestadorId,
    valorCentavos: acordo.valorAcordadoCentavos,
    descricao: `Vincis · ${acordo.titulo}`,
    contexto: { propostaId: acordo.propostaId, comissaoVincis },
    expiracaoSegundos: EXPIRACAO_PIX_SEGUNDOS.acordo,
  })
  if (aberta.situacao !== 'ok') {
    return {
      situacao: aberta.situacao === 'gerando' ? 'gerando' : 'indisponivel',
      mensagem: aberta.mensagem,
    }
  }
  if (aberta.cobranca.status === 'paga') return { situacao: 'pago', protocolo: aberta.cobranca.protocolo }
  return { situacao: 'cobranca', cobranca: aberta.cobranca }
}

/** A situação do Pix do acordo — o que a tela pergunta enquanto espera. */
export async function acompanharPagamentoDoAcordo(entrada: unknown): Promise<ResultadoPixAcordo> {
  const porta = await acordoPagavel(entrada)
  if (porta.recusa) return porta.recusa
  return acompanhar(porta.acordo.oportunidadeId, porta.sessao.id)
}

async function acompanhar(oportunidadeId: string, clienteId: string): Promise<ResultadoPixAcordo> {
  const [ultima] = await db
    .select()
    .from(cobrancasPix)
    .where(
      and(
        eq(cobrancasPix.finalidade, 'acordo'),
        eq(cobrancasPix.referenciaId, oportunidadeId),
        eq(cobrancasPix.clienteUsuarioId, clienteId),
      ),
    )
    .orderBy(desc(cobrancasPix.createdAt))
    .limit(1)

  if (!ultima) {
    return (await jaPago(oportunidadeId))
      ? { situacao: 'pago', protocolo: null }
      : { situacao: 'indisponivel', mensagem: 'Nenhum Pix emitido para este acordo.' }
  }

  const atual = (await sincronizarCobranca(ultima.id)) ?? ultima
  if (atual.status === 'paga') {
    if (atual.efeito === 'conflito') {
      return {
        situacao: 'indisponivel',
        mensagem: 'Recebemos seu Pix, mas este acordo já estava pago. A equipe Vincis fará o estorno.',
      }
    }
    return { situacao: 'pago', protocolo: atual.protocolo }
  }
  if (atual.status === 'gerando') return { situacao: 'gerando', mensagem: 'Gerando o Pix…' }
  if (atual.status !== 'aguardando_pagamento') {
    return { situacao: 'indisponivel', mensagem: 'O Pix expirou sem pagamento. Gere um novo para continuar.' }
  }
  return { situacao: 'cobranca', cobranca: paraDTO(atual) }
}
