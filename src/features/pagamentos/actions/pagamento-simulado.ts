'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
} from '@/db/schema'
import { garantirAtendimentoDaOportunidade } from '@/features/atendimentos/lib/criar-atendimento-da-oportunidade'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import { avisarEmTempoReal } from '@/features/oportunidades/lib/difundir-oportunidade'
import {
  SEM_AUTORIZACAO,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { ORIGEM_SIMULADA } from '../constants/pagamento'
import { gerarReferenciaSimulada } from '../lib/referencia-simulada'
import {
  PagamentoSimuladoSchema,
  converterValorParaCentavos,
} from '../schemas/pagamento'

/**
 * Pagamento **simulado** do acordo de uma oportunidade.
 *
 * ## O que esta função é
 *
 * O ponto único em que "existe acordo" vira "existe Atendimento". Ela não fala
 * com gateway nenhum, não coleta dado financeiro e grava o registro já marcado
 * como simulado — ver `constants/pagamento.ts`. Quando houver cobrança real, é
 * o miolo desta função que muda; a fronteira (quem pode pagar, o que o
 * pagamento produz, como não duplicar) fica igual.
 *
 * ## Idempotência
 *
 * É requisito, e a garantia é do banco em dois pontos:
 *
 * 1. `oportunidade_pagamentos_unico` — uma oportunidade, um pagamento;
 * 2. `atendimentos_oportunidade_unico` — uma oportunidade, um protocolo.
 *
 * Duplo clique, duas abas, F5 no meio ou duas requisições simultâneas
 * convergem para o mesmo par (pagamento, Atendimento). A segunda chamada **não
 * falha**: ela reencontra o que já existe e devolve o mesmo protocolo, porque
 * do ponto de vista de quem clicou o pedido foi atendido. Desabilitar o botão
 * no navegador continua sendo cortesia, nunca a regra.
 */
export async function pagarAcordoSimulado(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = PagamentoSimuladoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const [acordo] = await db
    .select({
      oportunidadeId: oportunidades.id,
      titulo: oportunidades.titulo,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      statusOportunidade: oportunidades.status,
      propostaId: oportunidadePropostas.id,
      prestadorId: oportunidadePropostas.prestadorId,
      valorAcordadoCentavos: oportunidadePropostas.valorAcordadoCentavos,
    })
    .from(oportunidades)
    .innerJoin(
      oportunidadePropostas,
      eq(oportunidadePropostas.oportunidadeId, oportunidades.id),
    )
    .where(
      and(
        eq(oportunidades.id, validacao.data.oportunidadeId),
        // Sem proposta aceita não há acordo, e sem acordo não há o que pagar.
        eq(oportunidadePropostas.status, 'aceita'),
      ),
    )
    .limit(1)

  if (!acordo) {
    return {
      sucesso: false as const,
      mensagem: 'Esta solicitação ainda não tem um acordo fechado para pagar.',
    }
  }
  // Paga quem pediu. Nem o prestador, nem outro Cliente, nem quem só conhece
  // o id da solicitação.
  if (acordo.clienteUsuarioId !== sessao.id) {
    return semPermissaoPara('pagar este acordo')
  }

  /**
   * O valor.
   *
   * Regra: se o acordo tem valor, é ele — o que vier do navegador é ignorado.
   * Só quando o acordo ficou "a combinar" o Cliente informa um número, e aí ele
   * precisa ser maior que zero. Este segundo caminho é **provisório**: existe
   * porque a plataforma ainda não tem a etapa em que valor a combinar vira
   * preço, e sem número não há simulação possível.
   */
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

  try {
    const resultado = await db.transaction(async (tx) => {
      const [criado] = await tx
        .insert(oportunidadePagamentos)
        .values({
          oportunidadeId: acordo.oportunidadeId,
          propostaId: acordo.propostaId,
          clienteUsuarioId: acordo.clienteUsuarioId,
          prestadorId: acordo.prestadorId,
          valorCentavos,
          status: 'aprovado',
          origem: ORIGEM_SIMULADA,
          referencia: gerarReferenciaSimulada(),
        })
        // O índice único é a trava. A segunda chamada não grava e não quebra:
        // ela cai no `select` abaixo e encontra o pagamento do vencedor.
        .onConflictDoNothing({
          target: oportunidadePagamentos.oportunidadeId,
        })
        .returning({
          id: oportunidadePagamentos.id,
          referencia: oportunidadePagamentos.referencia,
          valorCentavos: oportunidadePagamentos.valorCentavos,
          aprovadoEm: oportunidadePagamentos.aprovadoEm,
        })

      const pagamento =
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
            .where(
              eq(
                oportunidadePagamentos.oportunidadeId,
                acordo.oportunidadeId,
              ),
            )
            .limit(1)
        )[0]

      if (!pagamento) {
        throw new Error('Pagamento não encontrado após conflito de unicidade.')
      }

      // Acordo que ficou "a combinar" só agora ganha número. O `where` com
      // `is null` impede que uma segunda chamada reescreva o valor de um acordo
      // que já tinha preço.
      if (criado && acordo.valorAcordadoCentavos === null) {
        await tx
          .update(oportunidadePropostas)
          .set({ valorAcordadoCentavos: valorCentavos, updatedAt: new Date() })
          .where(
            and(
              eq(oportunidadePropostas.id, acordo.propostaId),
              isNull(oportunidadePropostas.valorAcordadoCentavos),
            ),
          )
      }

      // Só aqui o Atendimento nasce — nunca no aceite da proposta. Idempotente
      // por índice único, então repetir esta linha não abre um segundo
      // protocolo.
      const atendimento = await garantirAtendimentoDaOportunidade(
        tx,
        acordo.oportunidadeId,
      )

      return { pagamento, atendimento, novo: Boolean(criado) }
    })

    // Avisos e auditoria só na primeira vez: repetir um F5 não é um fato novo,
    // e o sino do prestador não pode contar o mesmo pagamento duas vezes.
    if (resultado.novo) {
      await emitirNotificacoes(db, {
        destinatarios: [acordo.prestadorId],
        autorId: sessao.id,
        tipo: TIPOS_NOTIFICACAO.pagamentoAprovado,
        titulo: 'Pagamento aprovado · Atendimento criado',
        resumo: resumirTexto(
          `${resultado.atendimento.protocolo} · ${acordo.titulo}`,
          200,
        ),
        recursoTipo: 'atendimento',
        recursoId: resultado.atendimento.id,
        atendimentoId: resultado.atendimento.id,
        protocolo: resultado.atendimento.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: resultado.atendimento.protocolo,
        },
        // Segunda linha de defesa contra duplicidade, agora do lado do aviso.
        chaveDedupe: `${TIPOS_NOTIFICACAO.pagamentoAprovado}:${acordo.oportunidadeId}`,
      })

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

      await avisarEmTempoReal({
        destinatarios: [acordo.prestadorId],
        titulo: 'Pagamento aprovado · Atendimento criado',
        oportunidadeId: acordo.oportunidadeId,
        autorId: sessao.id,
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
