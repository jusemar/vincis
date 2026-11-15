'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  SEM_AUTORIZACAO,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { ORIGEM_SIMULADA } from '../constants/pagamento'
import {
  acordoRecorrente,
  avisarAcordoPago,
  buscarAcordo,
  efetivarAcordo,
  MENSAGEM_ACORDO_RECORRENTE_DIRETO,
} from '../lib/acordo'
import { simulacaoPermitida } from '../lib/ambiente'
import { processarPagamentoSimulado } from '../lib/simulador'
import {
  PagamentoSimuladoSchema,
  converterValorParaCentavos,
} from '../schemas/pagamento'

/**
 * Pagamento **simulado** do acordo de uma oportunidade — exclusivo da suíte.
 *
 * ## Por que ainda existe
 *
 * Foi o ponto único em que "existe acordo" vira "existe Atendimento" antes do
 * gateway. Com o Pix real (`actions/pagamento-acordo.ts`), uma Server Action
 * que aprova sem dinheiro seria contratação de graça para quem a chamasse à
 * mão — então ela recusa fora da suíte de testes (`simulacaoPermitida`), que
 * segue usando-a para montar cenários sem falar com a Efí.
 *
 * O miolo (`efetivarAcordo`) é o mesmo que o Pix confirmado usa: as travas
 * `oportunidade_pagamentos_unico` e `atendimentos_oportunidade_unico` valem
 * para os dois caminhos.
 */
export async function pagarAcordoSimulado(entrada: unknown) {
  if (!simulacaoPermitida()) {
    return {
      sucesso: false as const,
      mensagem: 'Pagamento simulado indisponível neste ambiente.',
    }
  }

  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = PagamentoSimuladoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const acordo = await buscarAcordo(db, validacao.data.oportunidadeId)
  if (!acordo) {
    return {
      sucesso: false as const,
      mensagem: 'Esta solicitação ainda não tem um acordo fechado para pagar.',
    }
  }
  if (acordo.clienteUsuarioId !== sessao.id) {
    return semPermissaoPara('pagar este acordo')
  }
  if (acordoRecorrente(acordo)) {
    return { sucesso: false as const, mensagem: MENSAGEM_ACORDO_RECORRENTE_DIRETO }
  }

  const informado = converterValorParaCentavos(validacao.data.valorAcordado)
  const valorCentavos = acordo.valorAcordadoCentavos ?? informado
  if (!valorCentavos || valorCentavos <= 0) {
    return {
      sucesso: false as const,
      mensagem:
        'Este acordo ficou com o valor a combinar. Informe o valor combinado, maior que zero, para concluir.',
      dados: { precisaValor: true as const },
    }
  }

  const simulacao = processarPagamentoSimulado({ valorCentavos })
  if (!simulacao.aprovado) {
    return { sucesso: false as const, mensagem: simulacao.motivo }
  }

  try {
    const resultado = await db.transaction((tx) =>
      efetivarAcordo(tx, acordo, {
        valorCentavos,
        status: simulacao.status,
        origem: simulacao.origem,
        referencia: simulacao.referencia,
      }),
    )

    if (resultado.novo) {
      await avisarAcordoPago(acordo, resultado.atendimento, sessao.id)
      await registrarEventoAuditoria({
        acao: ACOES_AUDITORIA.pagamentoSimuladoAprovado,
        entidade: 'oportunidade_pagamentos',
        registroAfetado: resultado.pagamento.id,
        autorId: sessao.id,
        usuarioId: acordo.prestadorId,
        origem: 'sistema',
        metadados: {
          oportunidadeId: acordo.oportunidadeId,
          propostaId: acordo.propostaId,
          atendimentoId: resultado.atendimento.id,
          protocolo: resultado.atendimento.protocolo,
          valorCentavos: resultado.pagamento.valorCentavos,
          referencia: resultado.pagamento.referencia,
          origem: ORIGEM_SIMULADA,
        },
      })
    }

    revalidatePath('/cliente')
    revalidatePath('/admin')

    return {
      sucesso: true as const,
      mensagem: resultado.novo
        ? `Pagamento aprovado. Atendimento ${resultado.atendimento.protocolo} criado.`
        : `Este acordo já estava pago. Atendimento ${resultado.atendimento.protocolo}.`,
      dados: {
        novo: resultado.novo,
        referencia: resultado.pagamento.referencia,
        valorCentavos: resultado.pagamento.valorCentavos,
        aprovadoEm: resultado.pagamento.aprovadoEm.toISOString(),
        atendimentoId: resultado.atendimento.id,
        protocolo: resultado.atendimento.protocolo,
      },
    }
  } catch (erro) {
    console.error('[PAGAR_ACORDO_SIMULADO]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível concluir o pagamento. Tente novamente.',
    }
  }
}
