'use server'

import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
  cobrancasPix,
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaPagamentos,
  consultoriaReservas,
} from '@/db/schema'
import { garantirAtendimentoDaConsultoria } from '@/features/atendimentos/lib/criar-atendimento-da-consultoria'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  EXPIRACAO_PIX_SEGUNDOS,
  FOLGA_RESERVA_APOS_PIX_SEGUNDOS,
} from '@/features/pagamentos/constants/cobranca'
import { ORIGEM_SIMULADA } from '@/features/pagamentos/constants/pagamento'
import {
  abrirCobrancaPix,
  paraDTO,
  sincronizarCobranca,
} from '@/features/pagamentos/lib/cobrancas'
import { simulacaoPermitida } from '@/features/pagamentos/lib/ambiente'
import { retratoComissaoVigente } from '@/features/pagamentos/lib/comissao-vincis'
import { MENSAGEM_COMISSAO_PENDENTE } from '@/features/servicos/constants/comissao'
import { MENSAGEM_HONORARIOS_DIRETOS, prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import {
  DESFECHOS_SIMULACAO,
  processarPagamentoSimulado,
} from '@/features/pagamentos/lib/simulador'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { MENSAGEM_RESERVA_EXPIRADA } from '../constants/reserva'
import {
  avisarConsultoriaAgendada,
  efetivarConsultoria,
  rotularHorario,
} from '../lib/efetivar-consultoria'
import { formatarPreco } from '../lib/formato'
import { dataLocalDoInstante, horaDeMinutos, minutosLocaisDoInstante } from '../lib/tempo'
import type {
  ResultadoPagamentoConsultoria,
  ResultadoPixConsultoria,
} from '../types/contratacao'

const ReservaSchema = z.object({
  /** O único identificador que o navegador envia. Todo o resto vem do banco. */
  reservaId: z.string().uuid('Reserva inválida.'),
})

const PagarConsultoriaSchema = ReservaSchema.extend({
  /** Só o simulador usa. Ausente significa aprovar. */
  desfecho: z.enum(DESFECHOS_SIMULACAO).optional(),
})

const EXPIRADA = {
  situacao: 'reserva_expirada',
  mensagem: MENSAGEM_RESERVA_EXPIRADA,
} as const

/**
 * A reserva precisa ter pelo menos isto de vida para um Pix ser emitido.
 *
 * Emitir com segundos restantes criaria um QR Code para um horário que pode
 * ser de outra pessoa antes de o pagador abrir o app do banco.
 */
const VIDA_MINIMA_RESERVA_MS = 30_000

async function exigirSessao() {
  const sessao = await obterSessaoServidor()
  if (sessao) return { sessao }
  const estado = await obterEstadoDaContaDaSessao()
  return {
    recusa:
      estado === 'nao_confirmada'
        ? ({
            situacao: 'conta_nao_confirmada',
            mensagem: 'Confirme sua conta para concluir a contratação.',
          } as const)
        : ({ situacao: 'precisa_entrar', mensagem: 'Entre na sua conta para continuar.' } as const),
  }
}

/** A consultoria confirmada, no formato que o painel "Concluído" mostra. */
function confirmadoDaReserva(
  reserva: typeof consultoriaReservas.$inferSelect,
  dados: {
    novo: boolean
    agendamentoId: string
    atendimentoId: string
    protocolo: string
    referencia: string | null
    valorCentavos: number
    honorariosDiretos?: boolean
  },
): Extract<ResultadoPagamentoConsultoria, { situacao: 'confirmado' }> {
  return {
    situacao: 'confirmado',
    ...dados,
    data: dataLocalDoInstante(reserva.inicioEm, reserva.timezone),
    inicio: horaDeMinutos(minutosLocaisDoInstante(reserva.inicioEm, reserva.timezone)),
    fim: horaDeMinutos(minutosLocaisDoInstante(reserva.fimEm, reserva.timezone)),
    timezone: reserva.timezone,
    duracaoMinutos: reserva.duracaoMinutos,
  }
}

/** A reserva deste Cliente. De outro Cliente, é como se não existisse. */
async function reservaDoCliente(reservaId: string, clienteId: string) {
  const [reserva] = await db
    .select()
    .from(consultoriaReservas)
    .where(
      and(eq(consultoriaReservas.id, reservaId), eq(consultoriaReservas.clienteUsuarioId, clienteId)),
    )
    .limit(1)
  return reserva ?? null
}

/** Reserva já confirmada → o mesmo "Concluído" de antes, sem cobrar de novo. */
async function jaConfirmada(reserva: typeof consultoriaReservas.$inferSelect) {
  const [feito] = await db
    .select({
      agendamentoId: consultoriaAgendamentos.id,
      referencia: consultoriaPagamentos.referencia,
      valorCentavos: consultoriaPagamentos.valorCentavos,
    })
    .from(consultoriaAgendamentos)
    // `left`: a consultoria jurídica não tem linha de pagamento — e continua
    // confirmada.
    .leftJoin(consultoriaPagamentos, eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id))
    .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
    .limit(1)
  if (!feito) return null
  const atendimento = await garantirAtendimentoDaConsultoria(db, feito.agendamentoId)
  return confirmadoDaReserva(reserva, {
    novo: false,
    agendamentoId: feito.agendamentoId,
    atendimentoId: atendimento.id,
    protocolo: atendimento.protocolo,
    referencia: feito.referencia,
    valorCentavos: feito.valorCentavos ?? 0,
    honorariosDiretos: !feito.referencia,
  })
}

/**
 * Emite (ou reaproveita) o Pix da reserva — etapa "Pagamento".
 *
 * ## O que o navegador pode dizer
 *
 * O id da reserva, e mais nada. Valor, horário, Profissional e Cliente são da
 * reserva, que fotografou tudo isso ao prender o horário; o Cliente é o da
 * sessão, e a reserva de outro Cliente simplesmente não é encontrada.
 *
 * ## Reserva × validade do Pix
 *
 * A reserva de dez minutos é estendida para cobrir a validade do Pix
 * (`EXPIRACAO_PIX_SEGUNDOS.consultoria`) mais uma folga — **a partir da
 * validade gravada na cobrança**, então chamar de novo não estica nada: F5 não
 * compra tempo. Pix vencido não é reemitido para a mesma reserva: o horário
 * volta para a agenda e o Cliente escolhe de novo.
 *
 * ## O que esta ação não faz
 *
 * Não agenda, não abre Atendimento e não gera protocolo. Isso só acontece
 * quando a Efí confirma o Pix (`confirmarConsultoriaPaga`).
 */
export async function iniciarPagamentoDaConsultoria(
  entrada: unknown,
): Promise<ResultadoPixConsultoria> {
  const validacao = ReservaSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'dados_invalidos', mensagem: 'Reserva inválida.' }

  const { sessao, recusa } = await exigirSessao()
  if (!sessao) return recusa

  const reserva = await reservaDoCliente(validacao.data.reservaId, sessao.id)
  if (!reserva) return EXPIRADA

  if (reserva.status === 'confirmada') return (await jaConfirmada(reserva)) ?? EXPIRADA

  // Pix desta reserva que venceu ou foi cancelado encerra a reserva: emitir
  // outro seria segurar o horário indefinidamente.
  const [anterior] = await db
    .select({ id: cobrancasPix.id })
    .from(cobrancasPix)
    .where(
      and(
        eq(cobrancasPix.finalidade, 'consultoria'),
        eq(cobrancasPix.referenciaId, reserva.id),
        inArray(cobrancasPix.status, ['expirada', 'cancelada']),
      ),
    )
    .limit(1)
  if (anterior) return EXPIRADA

  const agora = Date.now()
  if (reserva.status !== 'ativa' || reserva.expiraEm.getTime() - agora < VIDA_MINIMA_RESERVA_MS) {
    return EXPIRADA
  }

  const [configuracao] = await db
    .select({ prestadorId: consultoriaConfiguracoes.prestadorId, titulo: consultoriaConfiguracoes.titulo })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.id, reserva.configuracaoId))
    .limit(1)
  if (!configuracao) return EXPIRADA

  // Consultoria avulsa paga pela Vincis: comissão configurada obrigatória,
  // congelada na cobrança sobre o valor do snapshot da reserva.
  // Advocacia não passa pela Vincis: a resposta é a de honorários, não a de comissão.
  if (await prestadorCobraDiretamente(db, configuracao.prestadorId)) {
    return { situacao: 'indisponivel', mensagem: MENSAGEM_HONORARIOS_DIRETOS }
  }
  const comissaoVincis = await retratoComissaoVigente(reserva.valorCentavos)
  if (!comissaoVincis) {
    console.warn('[CONSULTORIA_SEM_COMISSAO]', { reservaId: reserva.id })
    return { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE }
  }

  const aberta = await abrirCobrancaPix({
    finalidade: 'consultoria',
    referenciaId: reserva.id,
    clienteUsuarioId: sessao.id,
    prestadorId: configuracao.prestadorId,
    // O snapshot da reserva — nunca o preço atual da agenda.
    valorCentavos: reserva.valorCentavos,
    descricao: `Vincis · Consultoria ${rotularHorario(reserva.inicioEm, reserva.timezone)}`,
    contexto: { comissaoVincis },
    expiracaoSegundos: EXPIRACAO_PIX_SEGUNDOS.consultoria,
  })

  if (aberta.situacao === 'gerando') return { situacao: 'gerando', mensagem: aberta.mensagem }
  if (aberta.situacao !== 'ok') {
    return { situacao: 'indisponivel', mensagem: aberta.mensagem }
  }

  const { cobranca } = aberta
  if (cobranca.status === 'paga') return acompanhar(reserva.id, sessao.id)

  if (cobranca.expiraEm) {
    // Nunca encurta, e a base é a validade da cobrança — fixa: repetir a
    // chamada grava o mesmo instante.
    const ate = new Date(cobranca.expiraEm.getTime() + FOLGA_RESERVA_APOS_PIX_SEGUNDOS * 1000)
    if (ate.getTime() > reserva.expiraEm.getTime()) {
      await db
        .update(consultoriaReservas)
        .set({ expiraEm: ate, updatedAt: new Date() })
        .where(
          and(
            eq(consultoriaReservas.id, reserva.id),
            eq(consultoriaReservas.status, 'ativa'),
            lt(consultoriaReservas.expiraEm, ate),
          ),
        )
    }
  }

  return { situacao: 'cobranca', cobranca, valorFormatado: formatarPreco(cobranca.valorCentavos) }
}

/**
 * A situação do pagamento da reserva — o que a tela pergunta enquanto espera.
 *
 * Confere na Efí (com freio) e devolve: ainda aguardando, Concluído com
 * protocolo, expirado ou pago-sem-horário. A tela nunca decide sozinha.
 */
export async function acompanharPagamentoDaConsultoria(
  entrada: unknown,
): Promise<ResultadoPixConsultoria> {
  const validacao = ReservaSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'dados_invalidos', mensagem: 'Reserva inválida.' }
  const { sessao, recusa } = await exigirSessao()
  if (!sessao) return recusa
  return acompanhar(validacao.data.reservaId, sessao.id)
}

async function acompanhar(reservaId: string, clienteId: string): Promise<ResultadoPixConsultoria> {
  const reserva = await reservaDoCliente(reservaId, clienteId)
  if (!reserva) return EXPIRADA

  const [ultima] = await db
    .select()
    .from(cobrancasPix)
    .where(and(eq(cobrancasPix.finalidade, 'consultoria'), eq(cobrancasPix.referenciaId, reserva.id)))
    .orderBy(desc(cobrancasPix.createdAt))
    .limit(1)

  if (!ultima) {
    return reserva.status === 'confirmada' ? ((await jaConfirmada(reserva)) ?? EXPIRADA) : EXPIRADA
  }

  const atual = (await sincronizarCobranca(ultima.id)) ?? ultima

  if (atual.status === 'paga') {
    if (atual.efeito === 'conflito') {
      return {
        situacao: 'pago_sem_horario',
        mensagem:
          'Recebemos seu Pix, mas o horário já não estava disponível. A equipe Vincis fará o estorno integral.',
      }
    }
    const atualizada = await reservaDoCliente(reserva.id, clienteId)
    const confirmado = atualizada ? await jaConfirmada(atualizada) : null
    return confirmado ?? { situacao: 'gerando', mensagem: 'Confirmando seu pagamento…' }
  }
  if (atual.status === 'expirada' || atual.status === 'cancelada') return EXPIRADA
  if (atual.status === 'falhou') {
    return { situacao: 'indisponivel', mensagem: 'Não foi possível gerar o Pix. Tente novamente.' }
  }
  if (atual.status === 'gerando') return { situacao: 'gerando', mensagem: 'Gerando o Pix…' }

  return {
    situacao: 'cobranca',
    cobranca: paraDTO(atual),
    valorFormatado: formatarPreco(atual.valorCentavos),
  }
}

/**
 * Paga **de mentira** e confirma a consultoria — exclusivo da suíte de testes.
 *
 * Existia para fechar o fluxo antes do gateway. Com o Pix real no lugar, deixar
 * esta ação acessível seria entregar consultoria sem cobrança a quem chamasse
 * a Server Action à mão. Ela segue existindo porque a suíte a usa para montar
 * consultorias confirmadas sem falar com a Efí — e recusa em qualquer outro
 * ambiente (`simulacaoPermitida`).
 *
 * As travas, a ordem e a idempotência são as de `efetivarConsultoria`, a mesma
 * função que o Pix confirmado usa.
 */
export async function pagarConsultoriaSimulado(
  entrada: unknown,
): Promise<ResultadoPagamentoConsultoria> {
  if (!simulacaoPermitida()) {
    return { situacao: 'falhou', mensagem: 'Pagamento simulado indisponível neste ambiente.' }
  }

  const validacao = PagarConsultoriaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { situacao: 'dados_invalidos', mensagem: 'Reserva inválida.' }
  }
  const { reservaId, desfecho } = validacao.data

  const { sessao, recusa } = await exigirSessao()
  if (!sessao) return recusa

  const agora = new Date()

  try {
    const resultado = await db.transaction(async (tx) => {
      const [reserva] = await tx
        .select()
        .from(consultoriaReservas)
        .where(
          and(
            eq(consultoriaReservas.id, reservaId),
            eq(consultoriaReservas.clienteUsuarioId, sessao.id),
          ),
        )
        .for('update')
        .limit(1)

      if (!reserva) return EXPIRADA

      if (reserva.status === 'confirmada') {
        const [jaFeito] = await tx
          .select({
            agendamentoId: consultoriaAgendamentos.id,
            referencia: consultoriaPagamentos.referencia,
            valorCentavos: consultoriaPagamentos.valorCentavos,
          })
          .from(consultoriaAgendamentos)
          .innerJoin(
            consultoriaPagamentos,
            eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
          )
          .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
          .limit(1)

        if (!jaFeito) throw new Error('Reserva confirmada sem contratação.')

        const atendimento = await garantirAtendimentoDaConsultoria(tx, jaFeito.agendamentoId)
        return {
          situacao: 'confirmado' as const,
          novo: false,
          agendamentoId: jaFeito.agendamentoId,
          referencia: jaFeito.referencia,
          valorCentavos: jaFeito.valorCentavos,
          atendimentoId: atendimento.id,
          protocolo: atendimento.protocolo,
          reserva,
          prestadorId: '',
        }
      }

      if (reserva.status !== 'ativa' || reserva.expiraEm.getTime() <= agora.getTime()) {
        return EXPIRADA
      }

      const [configuracao] = await tx
        .select({ id: consultoriaConfiguracoes.id, prestadorId: consultoriaConfiguracoes.prestadorId })
        .from(consultoriaConfiguracoes)
        .where(eq(consultoriaConfiguracoes.id, reserva.configuracaoId))
        .limit(1)

      if (!configuracao) return EXPIRADA

      const simulacao = processarPagamentoSimulado({
        valorCentavos: reserva.valorCentavos,
        desfecho,
      })
      if (!simulacao.aprovado) {
        return {
          situacao: 'recusado' as const,
          mensagem: simulacao.motivo,
          expiraEm: reserva.expiraEm,
        }
      }

      const efetivada = await efetivarConsultoria(tx, {
        reserva,
        prestadorId: configuracao.prestadorId,
        agora,
        pagamento: {
          status: simulacao.status,
          origem: simulacao.origem,
          referencia: simulacao.referencia,
          valorCentavos: simulacao.valorCentavos,
        },
      })

      return {
        situacao: 'confirmado' as const,
        ...efetivada,
        reserva,
        prestadorId: configuracao.prestadorId,
      }
    })

    if (resultado.situacao !== 'confirmado') return resultado

    const { reserva, prestadorId, ...confirmado } = resultado

    if (confirmado.novo && prestadorId) {
      await avisarConsultoriaAgendada({
        clienteId: sessao.id,
        clienteNome: sessao.nome,
        prestadorId,
        agendamentoId: confirmado.agendamentoId,
        atendimentoId: confirmado.atendimentoId,
        protocolo: confirmado.protocolo,
        quando: rotularHorario(reserva.inicioEm, reserva.timezone),
      })
      await registrarEventoAuditoria({
        acao: ACOES_AUDITORIA.pagamentoSimuladoAprovado,
        entidade: 'consultoria_pagamentos',
        registroAfetado: confirmado.agendamentoId,
        autorId: sessao.id,
        usuarioId: prestadorId,
        origem: 'sistema',
        metadados: {
          consultoriaAgendamentoId: confirmado.agendamentoId,
          atendimentoId: confirmado.atendimentoId,
          protocolo: confirmado.protocolo,
          referencia: confirmado.referencia,
          valorCentavos: confirmado.valorCentavos,
          origem: ORIGEM_SIMULADA,
        },
      })
    }

    revalidatePath('/cliente')
    revalidatePath('/admin')

    return confirmadoDaReserva(reserva, confirmado)
  } catch (erro) {
    console.error('[PAGAR_CONSULTORIA_SIMULADO]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      situacao: 'falhou',
      mensagem: 'Não foi possível concluir a contratação. Tente novamente.',
    }
  }
}

/**
 * Confirma o agendamento de uma consultoria **jurídica** — sem pagamento.
 *
 * Regra de advocacia: honorário é combinado diretamente entre Cliente e
 * advogado; a Vincis não cobra, não mostra QR Code, não chama a Efí e não
 * registra pago/não pago. A agenda continua valendo: a reserva vira
 * agendamento + Atendimento (conversa e acompanhamento), sem linha em
 * `consultoria_pagamentos`.
 *
 * Só para advogado — lido do cadastro no servidor. Para qualquer outro
 * profissional a resposta é recusa: a consultoria dele exige o Pix, e chamar
 * esta action à mão não pula o pagamento.
 *
 * Mesmas travas do caminho pago: agenda e reserva travadas, reserva viva e do
 * próprio Cliente, idempotente pelos índices únicos de agendamento e Atendimento.
 */
export async function confirmarConsultoriaJuridica(
  entrada: unknown,
): Promise<ResultadoPagamentoConsultoria> {
  const validacao = ReservaSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'dados_invalidos', mensagem: 'Reserva inválida.' }
  const { sessao, recusa } = await exigirSessao()
  if (!sessao) return recusa

  const previa = await reservaDoCliente(validacao.data.reservaId, sessao.id)
  if (!previa) return EXPIRADA
  if (previa.status === 'confirmada') return (await jaConfirmada(previa)) ?? EXPIRADA

  const [configuracao] = await db
    .select({ prestadorId: consultoriaConfiguracoes.prestadorId })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.id, previa.configuracaoId))
    .limit(1)
  if (!configuracao) return EXPIRADA
  if (!(await prestadorCobraDiretamente(db, configuracao.prestadorId))) {
    return { situacao: 'falhou', mensagem: 'Esta consultoria é confirmada após o pagamento por Pix.' }
  }

  const agora = new Date()
  try {
    const resultado = await db.transaction(async (tx) => {
      // Mesma ordem de travas da aquisição de horário: agenda, depois reserva.
      await tx
        .select({ id: consultoriaConfiguracoes.id })
        .from(consultoriaConfiguracoes)
        .where(eq(consultoriaConfiguracoes.id, previa.configuracaoId))
        .for('update')
      const [reserva] = await tx
        .select()
        .from(consultoriaReservas)
        .where(and(eq(consultoriaReservas.id, previa.id), eq(consultoriaReservas.clienteUsuarioId, sessao.id)))
        .for('update')
        .limit(1)
      if (!reserva || reserva.status !== 'ativa' || reserva.expiraEm.getTime() <= agora.getTime()) {
        return null
      }
      const efetivada = await efetivarConsultoria(tx, {
        reserva,
        prestadorId: configuracao.prestadorId,
        agora,
        pagamento: null,
      })
      return { reserva, efetivada }
    })

    if (!resultado) {
      // Pode ter sido confirmada por outra aba no meio do caminho.
      const atual = await reservaDoCliente(previa.id, sessao.id)
      return atual?.status === 'confirmada' ? ((await jaConfirmada(atual)) ?? EXPIRADA) : EXPIRADA
    }

    const { reserva, efetivada } = resultado
    if (efetivada.novo) {
      await avisarConsultoriaAgendada({
        clienteId: sessao.id,
        clienteNome: sessao.nome,
        prestadorId: configuracao.prestadorId,
        agendamentoId: efetivada.agendamentoId,
        atendimentoId: efetivada.atendimentoId,
        protocolo: efetivada.protocolo,
        quando: rotularHorario(reserva.inicioEm, reserva.timezone),
      })
    }
    revalidatePath('/cliente')
    revalidatePath('/admin')
    return confirmadoDaReserva(reserva, { ...efetivada, valorCentavos: 0, honorariosDiretos: true })
  } catch (erro) {
    console.error('[CONFIRMAR_CONSULTORIA_JURIDICA]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return { situacao: 'falhou', mensagem: 'Não foi possível confirmar o agendamento. Tente novamente.' }
  }
}
