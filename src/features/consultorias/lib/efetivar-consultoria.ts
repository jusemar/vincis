import { and, eq, gt, lt, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaPagamentos,
  consultoriaReservas,
  usuarios,
} from '@/db/schema'
import { garantirAtendimentoDaConsultoria } from '@/features/atendimentos/lib/criar-atendimento-da-consultoria'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import {
  colunasDoRetrato,
  retratoDoContexto,
  type RetratoComissaoVincis,
} from '@/features/pagamentos/lib/comissao-vincis'
import type { AplicarEfeito } from '@/features/pagamentos/types/efeito'
import { bordasDeConflito } from './reserva'

type Reserva = typeof consultoriaReservas.$inferSelect

export type PagamentoDaConsultoria = {
  status: string
  /** `simulado` (só na suíte) ou `efi`. */
  origem: string
  /** `SIM-…` na simulação; o txid da cobrança no Pix real. */
  referencia: string
  valorCentavos: number
  /** Retrato da comissão Vincis congelado no Pix. Ausente na simulação. */
  comissaoVincis?: RetratoComissaoVincis | null
}

export type ConsultoriaEfetivada = {
  novo: boolean
  agendamentoId: string
  /** `null` na consultoria jurídica: não existe pagamento pela Vincis. */
  referencia: string | null
  valorCentavos: number
  atendimentoId: string
  protocolo: string
}

/**
 * Agendamento + pagamento + reserva confirmada + Atendimento, numa transação.
 *
 * É o miolo que o pagamento simulado já tinha, extraído sem mudar a ordem —
 * agora compartilhado com o Pix real. A ordem e as travas continuam as
 * documentadas em `actions/pagamento.ts`:
 *
 * 1. agendamento (`reserva_id` único — onde a corrida é decidida);
 * 2. pagamento (FK para o agendamento; `reserva_id` único);
 * 3. reserva vira `confirmada`;
 * 4. Atendimento + protocolo (`consultoria_agendamento_id` único).
 *
 * Quem chama já travou a reserva e decidiu que ela pode ser paga.
 */
export async function efetivarConsultoria(
  tx: TransacaoDb,
  {
    reserva,
    prestadorId,
    pagamento,
    agora = new Date(),
  }: {
    reserva: Reserva
    prestadorId: string
    /**
     * `null` = consultoria jurídica: honorário combinado direto entre Cliente e
     * advogado. Nenhuma linha em `consultoria_pagamentos` — a Vincis não
     * registra pago/não pago.
     */
    pagamento: PagamentoDaConsultoria | null
    agora?: Date
  },
): Promise<ConsultoriaEfetivada> {
  const [agendamentoCriado] = await tx
    .insert(consultoriaAgendamentos)
    .values({
      reservaId: reserva.id,
      configuracaoId: reserva.configuracaoId,
      prestadorId,
      clienteUsuarioId: reserva.clienteUsuarioId,
      inicioEm: reserva.inicioEm,
      fimEm: reserva.fimEm,
      timezone: reserva.timezone,
      valorCentavos: reserva.valorCentavos,
      duracaoMinutos: reserva.duracaoMinutos,
      descricao: reserva.descricao,
    })
    .onConflictDoNothing({ target: consultoriaAgendamentos.reservaId })
    .returning({ id: consultoriaAgendamentos.id })

  const agendamento =
    agendamentoCriado ??
    (
      await tx
        .select({ id: consultoriaAgendamentos.id })
        .from(consultoriaAgendamentos)
        .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
        .limit(1)
    )[0]
  if (!agendamento) throw new Error('Consultoria não encontrada após conflito de unicidade.')

  let registrado: { referencia: string; valorCentavos: number } | null = null
  if (pagamento) {
    const [pagamentoCriado] = await tx
      .insert(consultoriaPagamentos)
      .values({
        reservaId: reserva.id,
        agendamentoId: agendamento.id,
        clienteUsuarioId: reserva.clienteUsuarioId,
        prestadorId,
        valorCentavos: pagamento.valorCentavos,
        status: pagamento.status,
        origem: pagamento.origem,
        referencia: pagamento.referencia,
        ...colunasDoRetrato(pagamento.comissaoVincis, pagamento.valorCentavos),
      })
      .onConflictDoNothing({ target: consultoriaPagamentos.reservaId })
      .returning({
        referencia: consultoriaPagamentos.referencia,
        valorCentavos: consultoriaPagamentos.valorCentavos,
      })

    registrado =
      pagamentoCriado ??
      (
        await tx
          .select({
            referencia: consultoriaPagamentos.referencia,
            valorCentavos: consultoriaPagamentos.valorCentavos,
          })
          .from(consultoriaPagamentos)
          .where(eq(consultoriaPagamentos.reservaId, reserva.id))
          .limit(1)
      )[0]
    if (!registrado) throw new Error('Pagamento não encontrado após conflito de unicidade.')
  }

  // O que bloqueia o horário daqui em diante é o agendamento, não este status.
  await tx
    .update(consultoriaReservas)
    .set({ status: 'confirmada', updatedAt: agora })
    .where(and(eq(consultoriaReservas.id, reserva.id), ne(consultoriaReservas.status, 'confirmada')))

  const atendimento = await garantirAtendimentoDaConsultoria(tx, agendamento.id)

  return {
    novo: Boolean(agendamentoCriado),
    agendamentoId: agendamento.id,
    referencia: registrado?.referencia ?? null,
    valorCentavos: registrado?.valorCentavos ?? 0,
    atendimentoId: atendimento.id,
    protocolo: atendimento.protocolo,
  }
}

/** `28/08/2026 14:00`, no fuso da agenda. Para o sino e para a auditoria. */
export function rotularHorario(instante: Date, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(instante)
}

/**
 * O aviso essencial da confirmação — um só, e para o Profissional.
 *
 * O Cliente não é avisado sobre a própria ação (`emitirNotificacoes` descarta o
 * autor). `chaveDedupe` amarrada ao agendamento: retry, F5 e webhook repetido
 * não tocam o sino de novo. A descrição do Cliente não viaja no aviso.
 */
export async function avisarConsultoriaAgendada({
  clienteId,
  clienteNome,
  prestadorId,
  agendamentoId,
  atendimentoId,
  protocolo,
  quando,
}: {
  clienteId: string
  clienteNome: string
  prestadorId: string
  agendamentoId: string
  atendimentoId: string
  protocolo: string
  quando: string
}) {
  await emitirNotificacoes(db, {
    destinatarios: [prestadorId],
    autorId: clienteId,
    tipo: TIPOS_NOTIFICACAO.consultoriaAgendada,
    titulo: 'Nova consultoria agendada',
    resumo: resumirTexto(`${quando} · ${protocolo} · ${clienteNome}`, 200),
    recursoTipo: 'atendimento',
    recursoId: atendimentoId,
    atendimentoId,
    protocolo,
    destino: { pagina: 'atendimentos', atendimento: protocolo },
    chaveDedupe: `${TIPOS_NOTIFICACAO.consultoriaAgendada}:${agendamentoId}`,
  })
}

/**
 * Efeito do Pix confirmado de uma consultoria: agenda o horário reservado.
 *
 * ## A relação entre reserva e Pix
 *
 * Ao emitir o Pix, a reserva é estendida para cobrir a validade dele mais uma
 * folga (`FOLGA_RESERVA_APOS_PIX_SEGUNDOS`). Dentro dessa janela ninguém mais
 * consegue reservar o horário, e o Pix pago a tempo encontra a reserva de pé.
 *
 * ## Webhook tardio
 *
 * A Efí só aceita Pix dentro da validade, mas o **aviso** pode chegar depois
 * da folga. Aí a reserva pode estar `expirada` (ou `liberada`, se o Cliente
 * escolheu outro horário). O dinheiro entrou, então a regra é honrar sempre
 * que o horário ainda estiver livre — conferido com a agenda travada, contra
 * consultorias confirmadas e reservas vivas de **outros** Clientes. Se outra
 * pessoa já ficou com o horário, o resultado é `conflito`: a cobrança fica paga
 * e marcada para estorno manual, e nenhum horário é vendido duas vezes.
 */
export const confirmarConsultoriaPaga: AplicarEfeito = async (tx, cobranca) => {
  const [previa] = await tx
    .select({ configuracaoId: consultoriaReservas.configuracaoId })
    .from(consultoriaReservas)
    .where(
      and(
        eq(consultoriaReservas.id, cobranca.referenciaId),
        eq(consultoriaReservas.clienteUsuarioId, cobranca.clienteUsuarioId),
      ),
    )
    .limit(1)
  if (!previa) return { efeito: 'conflito', motivo: 'Reserva paga não encontrada.' }

  // A mesma ordem de travas da aquisição de horário: agenda, depois reserva.
  const [configuracao] = await tx
    .select({
      id: consultoriaConfiguracoes.id,
      prestadorId: consultoriaConfiguracoes.prestadorId,
      intervaloMinutos: consultoriaConfiguracoes.intervaloMinutos,
    })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.id, previa.configuracaoId))
    .for('update')
    .limit(1)
  if (!configuracao) return { efeito: 'conflito', motivo: 'Agenda da consultoria não existe mais.' }

  const [reserva] = await tx
    .select()
    .from(consultoriaReservas)
    .where(eq(consultoriaReservas.id, cobranca.referenciaId))
    .for('update')
    .limit(1)
  if (!reserva) return { efeito: 'conflito', motivo: 'Reserva paga não encontrada.' }

  if (reserva.status === 'confirmada') {
    const [existente] = await tx
      .select({ agendamentoId: consultoriaPagamentos.agendamentoId, referencia: consultoriaPagamentos.referencia })
      .from(consultoriaPagamentos)
      .where(eq(consultoriaPagamentos.reservaId, reserva.id))
      .limit(1)
    if (!existente || existente.referencia !== cobranca.txid) {
      return { efeito: 'conflito', motivo: 'Reserva já confirmada por outro pagamento.' }
    }
    const atendimento = await garantirAtendimentoDaConsultoria(tx, existente.agendamentoId)
    return {
      efeito: 'aplicado',
      referenciaId: existente.agendamentoId,
      atendimentoId: atendimento.id,
      protocolo: atendimento.protocolo,
      novo: false,
    }
  }

  const agora = new Date()
  const { limiteInferior, limiteSuperior } = bordasDeConflito(reserva, configuracao.intervaloMinutos)

  const [ocupado] = await tx
    .select({ id: consultoriaAgendamentos.id })
    .from(consultoriaAgendamentos)
    .where(
      and(
        eq(consultoriaAgendamentos.configuracaoId, configuracao.id),
        eq(consultoriaAgendamentos.status, 'agendada'),
        lt(consultoriaAgendamentos.inicioEm, limiteSuperior),
        gt(consultoriaAgendamentos.fimEm, limiteInferior),
      ),
    )
    .limit(1)

  const [disputado] = await tx
    .select({ id: consultoriaReservas.id })
    .from(consultoriaReservas)
    .where(
      and(
        eq(consultoriaReservas.configuracaoId, configuracao.id),
        eq(consultoriaReservas.status, 'ativa'),
        gt(consultoriaReservas.expiraEm, agora),
        ne(consultoriaReservas.clienteUsuarioId, reserva.clienteUsuarioId),
        lt(consultoriaReservas.inicioEm, limiteSuperior),
        gt(consultoriaReservas.fimEm, limiteInferior),
      ),
    )
    .limit(1)

  if (ocupado || disputado) {
    return {
      efeito: 'conflito',
      motivo: 'Pix recebido depois de o horário ter sido ocupado por outro Cliente.',
    }
  }

  const efetivada = await efetivarConsultoria(tx, {
    reserva,
    prestadorId: configuracao.prestadorId,
    agora,
    pagamento: {
      status: 'aprovado',
      origem: 'efi',
      referencia: cobranca.txid,
      valorCentavos: cobranca.valorCentavos,
      comissaoVincis: retratoDoContexto(cobranca.contexto),
    },
  })

  const [cliente] = await tx
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, reserva.clienteUsuarioId))
    .limit(1)

  return {
    efeito: 'aplicado',
    referenciaId: efetivada.agendamentoId,
    atendimentoId: efetivada.atendimentoId,
    protocolo: efetivada.protocolo,
    novo: efetivada.novo,
    aposConfirmar: async () => {
      await avisarConsultoriaAgendada({
        clienteId: reserva.clienteUsuarioId,
        clienteNome: cliente?.nome ?? 'Cliente',
        prestadorId: configuracao.prestadorId,
        agendamentoId: efetivada.agendamentoId,
        atendimentoId: efetivada.atendimentoId,
        protocolo: efetivada.protocolo,
        quando: rotularHorario(reserva.inicioEm, reserva.timezone),
      })
      revalidatePath('/cliente')
      revalidatePath('/admin')
    },
  }
}
