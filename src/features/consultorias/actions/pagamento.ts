'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
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
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import { ORIGEM_SIMULADA } from '@/features/pagamentos/constants/pagamento'
import {
  DESFECHOS_SIMULACAO,
  processarPagamentoSimulado,
} from '@/features/pagamentos/lib/simulador'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { MENSAGEM_RESERVA_EXPIRADA } from '../constants/reserva'
import { dataLocalDoInstante, horaDeMinutos, minutosLocaisDoInstante } from '../lib/tempo'
import type { ResultadoPagamentoConsultoria } from '../types/contratacao'

const PagarConsultoriaSchema = z.object({
  /** O único identificador que o navegador envia. Todo o resto vem do banco. */
  reservaId: z.string().uuid('Reserva inválida.'),
  /** Só o simulador usa. Ausente significa aprovar. */
  desfecho: z.enum(DESFECHOS_SIMULACAO).optional(),
})

const EXPIRADA = {
  situacao: 'reserva_expirada',
  mensagem: MENSAGEM_RESERVA_EXPIRADA,
} as const

/**
 * Paga (de mentira) e confirma a consultoria.
 *
 * ## O que o navegador pode dizer
 *
 * Um id de reserva. Mais nada. Preço, duração, horário, fuso, descrição,
 * Profissional e Cliente são lidos do servidor — a reserva já fotografou tudo
 * isso quando prendeu o horário, e é essa fotografia que vale. Se o
 * Profissional reajustou o preço nos dez minutos seguintes, quem reservou paga
 * o que lhe foi mostrado: foi o compromisso que a plataforma assumiu.
 *
 * ## A ordem dentro da transação, e por que é essa
 *
 * 1. **agendamento** — `reserva_id` único; é aqui que a corrida é decidida;
 * 2. **pagamento** — precisa do agendamento existindo (FK);
 * 3. **reserva vira `confirmada`** — o rascunho fecha;
 * 4. **Atendimento + protocolo** — `consultoria_agendamento_id` único.
 *
 * Tudo numa transação só. Não existe estado intermediário publicável: ou há
 * consultoria, pagamento, Atendimento e protocolo, ou não há nada. Como o
 * pagamento é simulado e interno, atomicidade forte é possível — e sendo
 * possível, é o que se faz.
 *
 * ## Idempotência
 *
 * Três índices únicos do banco, e não o botão desabilitado da tela:
 * `consultoria_agendamentos_reserva_unica`,
 * `consultoria_pagamentos_reserva_unica` e `atendimentos_consultoria_unico`.
 * Duplo clique, duas abas, F5 no meio e resposta perdida convergem para o mesmo
 * trio (consultoria, pagamento, protocolo). A segunda chamada **não falha**:
 * reencontra o que já existe e devolve o mesmo protocolo, porque do ponto de
 * vista de quem clicou o pedido foi atendido. O `onConflictDoNothing` seguido
 * de releitura é o mesmo padrão que `pagarAcordoSimulado` já usa.
 *
 * ## O limite da expiração
 *
 * A reserva é relida **dentro** da transação, com `expira_em > agora` e a linha
 * travada. Quem entrou válido termina; quem chegou um segundo tarde não paga,
 * não confirma e não abre protocolo — e recebe a orientação de escolher outro
 * horário, nunca um erro técnico.
 */
export async function pagarConsultoriaSimulado(
  entrada: unknown,
): Promise<ResultadoPagamentoConsultoria> {
  const validacao = PagarConsultoriaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { situacao: 'dados_invalidos', mensagem: 'Reserva inválida.' }
  }
  const { reservaId, desfecho } = validacao.data

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    if (estado === 'nao_confirmada') {
      return {
        situacao: 'conta_nao_confirmada',
        mensagem: 'Confirme sua conta para concluir a contratação.',
      }
    }
    return {
      situacao: 'precisa_entrar',
      mensagem: 'Entre na sua conta para continuar.',
    }
  }

  const agora = new Date()

  try {
    const resultado = await db.transaction(async (tx) => {
      /**
       * A reserva, travada e conferida.
       *
       * O `where` carrega a posse: `cliente_usuario_id = sessão`. Conhecer o id
       * da reserva alheia não basta — a linha simplesmente não é encontrada, e
       * a resposta é a mesma de uma reserva vencida. Quem tenta usar reserva de
       * outro não descobre sequer que ela existe.
       */
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

      /**
       * Já foi paga? Então a resposta é o que já existe.
       *
       * Este é o caminho do F5 depois do sucesso e do retry cuja resposta se
       * perdeu: nada é cobrado de novo, nenhum protocolo novo é aberto, e a
       * tela reencontra o estado Concluído.
       */
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

        const atendimento = await garantirAtendimentoDaConsultoria(
          tx,
          jaFeito.agendamentoId,
        )
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

      // Vencida, liberada ou expirada não se paga. O servidor decide pelo
      // relógio dele, e não pelo contador que o navegador estava desenhando.
      if (reserva.status !== 'ativa' || reserva.expiraEm.getTime() <= agora.getTime()) {
        return EXPIRADA
      }

      const [configuracao] = await tx
        .select({
          id: consultoriaConfiguracoes.id,
          prestadorId: consultoriaConfiguracoes.prestadorId,
        })
        .from(consultoriaConfiguracoes)
        .where(eq(consultoriaConfiguracoes.id, reserva.configuracaoId))
        .limit(1)

      if (!configuracao) return EXPIRADA

      // O valor é o do snapshot. Nada aqui relê o preço atual da configuração.
      const simulacao = processarPagamentoSimulado({
        valorCentavos: reserva.valorCentavos,
        desfecho,
      })
      if (!simulacao.aprovado) {
        /**
         * Recusa não grava nada — nem pagamento, nem consultoria, nem
         * protocolo — e **não** mexe na reserva: os dez minutos originais
         * continuam correndo, e o Cliente pode tentar de novo enquanto durarem.
         * Repetir a tentativa não compra tempo extra.
         */
        return {
          situacao: 'recusado' as const,
          mensagem: simulacao.motivo,
          expiraEm: reserva.expiraEm,
        }
      }

      const [agendamentoCriado] = await tx
        .insert(consultoriaAgendamentos)
        .values({
          reservaId: reserva.id,
          configuracaoId: reserva.configuracaoId,
          prestadorId: configuracao.prestadorId,
          clienteUsuarioId: reserva.clienteUsuarioId,
          inicioEm: reserva.inicioEm,
          fimEm: reserva.fimEm,
          timezone: reserva.timezone,
          valorCentavos: reserva.valorCentavos,
          duracaoMinutos: reserva.duracaoMinutos,
          descricao: reserva.descricao,
        })
        // O índice único é a trava. A segunda chamada não grava e não quebra:
        // cai na releitura e encontra a contratação do vencedor.
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

      if (!agendamento) {
        throw new Error('Consultoria não encontrada após conflito de unicidade.')
      }

      const [pagamentoCriado] = await tx
        .insert(consultoriaPagamentos)
        .values({
          reservaId: reserva.id,
          agendamentoId: agendamento.id,
          clienteUsuarioId: reserva.clienteUsuarioId,
          prestadorId: configuracao.prestadorId,
          valorCentavos: simulacao.valorCentavos,
          status: simulacao.status,
          origem: simulacao.origem,
          referencia: simulacao.referencia,
        })
        .onConflictDoNothing({ target: consultoriaPagamentos.reservaId })
        .returning({
          id: consultoriaPagamentos.id,
          referencia: consultoriaPagamentos.referencia,
          valorCentavos: consultoriaPagamentos.valorCentavos,
        })

      const pagamento =
        pagamentoCriado ??
        (
          await tx
            .select({
              id: consultoriaPagamentos.id,
              referencia: consultoriaPagamentos.referencia,
              valorCentavos: consultoriaPagamentos.valorCentavos,
            })
            .from(consultoriaPagamentos)
            .where(eq(consultoriaPagamentos.reservaId, reserva.id))
            .limit(1)
        )[0]

      if (!pagamento) {
        throw new Error('Pagamento não encontrado após conflito de unicidade.')
      }

      /**
       * A reserva fecha.
       *
       * `where status = 'ativa'` para que duas transações não escrevam por cima
       * uma da outra. O que passa a bloquear o horário daqui em diante é o
       * agendamento, e não este status — fosse o status, o horário voltaria à
       * venda no minuto em que o prazo da reserva vencesse.
       */
      await tx
        .update(consultoriaReservas)
        .set({ status: 'confirmada', updatedAt: agora })
        .where(
          and(
            eq(consultoriaReservas.id, reserva.id),
            eq(consultoriaReservas.status, 'ativa'),
          ),
        )

      // Só aqui o Atendimento nasce. Idempotente por índice único, então
      // repetir esta linha não abre um segundo protocolo.
      const atendimento = await garantirAtendimentoDaConsultoria(
        tx,
        agendamento.id,
      )

      return {
        situacao: 'confirmado' as const,
        novo: Boolean(agendamentoCriado),
        agendamentoId: agendamento.id,
        referencia: pagamento.referencia,
        valorCentavos: pagamento.valorCentavos,
        atendimentoId: atendimento.id,
        protocolo: atendimento.protocolo,
        reserva,
        prestadorId: configuracao.prestadorId,
      }
    })

    if (resultado.situacao !== 'confirmado') return resultado

    const { reserva, prestadorId, ...confirmado } = resultado

    // Avisos e auditoria só na primeira vez: um F5 não é um fato novo, e o
    // sino do Profissional não pode contar a mesma consultoria duas vezes.
    if (confirmado.novo && prestadorId) {
      await avisarConfirmacao({
        clienteId: sessao.id,
        clienteNome: sessao.nome,
        prestadorId,
        agendamentoId: confirmado.agendamentoId,
        atendimentoId: confirmado.atendimentoId,
        protocolo: confirmado.protocolo,
        referencia: confirmado.referencia,
        valorCentavos: confirmado.valorCentavos,
        quando: rotularHorario(reserva.inicioEm, reserva.timezone),
      })
    }

    revalidatePath('/cliente')
    revalidatePath('/admin')

    return {
      situacao: 'confirmado',
      novo: confirmado.novo,
      agendamentoId: confirmado.agendamentoId,
      atendimentoId: confirmado.atendimentoId,
      protocolo: confirmado.protocolo,
      referencia: confirmado.referencia,
      valorCentavos: confirmado.valorCentavos,
      data: dataLocalDoInstante(reserva.inicioEm, reserva.timezone),
      inicio: horaDeMinutos(minutosLocaisDoInstante(reserva.inicioEm, reserva.timezone)),
      fim: horaDeMinutos(minutosLocaisDoInstante(reserva.fimEm, reserva.timezone)),
      timezone: reserva.timezone,
      duracaoMinutos: reserva.duracaoMinutos,
    }
  } catch (erro) {
    // Nome do erro, nunca a mensagem: stack e detalhe de banco não vazam para
    // o Cliente nem para o log de produção.
    console.error('[PAGAR_CONSULTORIA_SIMULADO]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      situacao: 'falhou',
      mensagem: 'Não foi possível concluir a contratação. Tente novamente.',
    }
  }
}

/** `28/08/2026 14:00`, no fuso da agenda. Para o sino e para a auditoria. */
function rotularHorario(instante: Date, timezone: string) {
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
 * ## Por que o Cliente não recebe notificação
 *
 * Porque a plataforma não avisa ninguém sobre a própria ação: `emitirNotificacoes`
 * descarta o autor dos destinatários, de propósito, e forçar a exceção aqui
 * significaria mandar um sino dizendo "você fez o que acabou de fazer". O
 * Cliente já vê a confirmação com o protocolo na tela, e o atendimento fica na
 * Área dele. Quem precisa ser puxado para a plataforma é o Profissional, que
 * não estava olhando.
 *
 * Lembretes de véspera, "começa em 15 minutos" e o resto da régua de
 * comunicação são etapa própria — não se antecipa régua aqui.
 *
 * `chaveDedupe` amarrada ao agendamento: retry e F5 não tocam o sino de novo.
 * A descrição do Cliente **não** viaja no aviso — ela é assunto privado e vive
 * dentro do Protocolo, atrás de autorização.
 */
async function avisarConfirmacao({
  clienteId,
  clienteNome,
  prestadorId,
  agendamentoId,
  atendimentoId,
  protocolo,
  referencia,
  valorCentavos,
  quando,
}: {
  clienteId: string
  clienteNome: string
  prestadorId: string
  agendamentoId: string
  atendimentoId: string
  protocolo: string
  referencia: string
  valorCentavos: number
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

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.pagamentoSimuladoAprovado,
    entidade: 'consultoria_pagamentos',
    registroAfetado: agendamentoId,
    autorId: clienteId,
    usuarioId: prestadorId,
    origem: 'sistema',
    metadados: {
      consultoriaAgendamentoId: agendamentoId,
      atendimentoId,
      protocolo,
      referencia,
      valorCentavos,
      origem: ORIGEM_SIMULADA,
    },
  })
}
