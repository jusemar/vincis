'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  oportunidadeContrapropostas,
  oportunidadePropostas,
  oportunidades,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import {
  SEM_AUTORIZACAO,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { avisarEmTempoReal } from '../lib/difundir-oportunidade'
import { ehFluxoDireto } from '../lib/fluxo-direto'
import { oportunidadeExpirada, propostaVigente } from '../lib/vigencia-sql'
import {
  ContrapropostaSchema,
  PropostaIdSchema,
  RespostaContrapropostaSchema,
  converterValorParaCentavos,
} from '../schemas/oportunidade'

/**
 * Negociação de uma proposta: contraproposta, resposta e aceite.
 *
 * Tudo aqui gira em torno de duas perguntas que precisam ser respondidas no
 * servidor a cada chamada: **quem é a pessoa nesta negociação** (Cliente dono
 * da solicitação ou prestador autor da proposta — nunca um terceiro) e **a
 * negociação ainda está viva** (oportunidade no prazo e proposta na validade).
 * Nenhuma tela é consultada para decidir isso.
 */

/** A proposta com o contexto que toda decisão precisa. Nada de tela decide. */
async function contextoDaProposta(propostaId: string) {
  const [linha] = await db
    .select({
      propostaId: oportunidadePropostas.id,
      prestadorId: oportunidadePropostas.prestadorId,
      propostaStatus: oportunidadePropostas.status,
      validaAte: oportunidadePropostas.validaAte,
      valorCentavos: oportunidadePropostas.valorCentavos,
      oportunidadeId: oportunidades.id,
      origem: oportunidades.origem,
      oportunidadeStatus: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      titulo: oportunidades.titulo,
    })
    .from(oportunidadePropostas)
    .innerJoin(
      oportunidades,
      eq(oportunidades.id, oportunidadePropostas.oportunidadeId),
    )
    .where(eq(oportunidadePropostas.id, propostaId))
    .limit(1)

  return linha ?? null
}

function negociacaoViva(contexto: {
  origem: string
  oportunidadeStatus: string
  expiraEm: Date | null
  propostaStatus: string
  validaAte: Date | null
}) {
  /*
    Cinto e suspensório.

    Uma Oportunidade do fluxo direto nunca chega a ter proposta — `enviarProposta`
    recusa a origem antes de gravar —, então contraproposta, resposta e aceite já
    são inalcançáveis por falta de objeto. A condição fica aqui mesmo assim
    porque é o ponto por onde as três passam: no dia em que uma proposta antiga
    conviver com uma origem direta, nenhuma delas vai depender de alguém ter
    lembrado de conferir.
  */
  if (ehFluxoDireto(contexto.origem)) {
    return {
      ok: false as const,
      mensagem:
        'Esta solicitação é uma conversa direta com o profissional, sem etapa de proposta e pagamento.',
    }
  }
  if (
    contexto.oportunidadeStatus !== 'aberta' ||
    oportunidadeExpirada({
      status: contexto.oportunidadeStatus,
      expiraEm: contexto.expiraEm,
    })
  ) {
    return { ok: false as const, mensagem: 'Esta oportunidade não está mais ativa.' }
  }
  if (
    !propostaVigente({
      status: contexto.propostaStatus,
      validaAte: contexto.validaAte,
    })
  ) {
    return {
      ok: false as const,
      mensagem:
        contexto.propostaStatus === 'aceita'
          ? 'Esta proposta já foi aceita.'
          : 'A validade desta proposta terminou.',
    }
  }
  return { ok: true as const }
}

/**
 * O que **todo** acordo comercial produz, venha ele por qual caminho vier.
 *
 * Existem dois caminhos para fechar preço — o Cliente aceita a proposta como
 * está, ou o prestador aceita a contraproposta do Cliente — e por um tempo eles
 * produziram efeitos diferentes: o primeiro encerrava a solicitação, o segundo
 * registrava o acordo e deixava a oportunidade aberta, ainda recebendo
 * propostas de quem já tinha perdido. Era inconsistência, não regra, e a
 * correção foi extrair este bloco em vez de repetir o código nos dois lugares:
 * caminho novo que feche acordo passa a chamar isto e herda o comportamento
 * inteiro.
 *
 * Fechado o acordo:
 *
 * - a solicitação sai do ar (`encerrada`) — some do banner e da vitrine dos
 *   demais prestadores, e nenhum deles consegue mais propor, porque a mesma
 *   condição que esconde é a que a Server Action verifica;
 * - as contrapropostas ainda pendentes **daquela oportunidade** são resolvidas
 *   como recusadas. Não é julgamento do valor: é o registro de que aquela
 *   negociação terminou. Deixá-las pendentes penduraria para sempre um
 *   "aguardando sua resposta" que ninguém pode mais responder;
 * - nada é apagado. As propostas concorrentes continuam no histórico, só
 *   deixam de ser acionáveis.
 *
 * O Atendimento **não** nasce aqui. Acordo é preço combinado; o trabalho começa
 * depois do pagamento, e é a simulação de pagamento que abre o protocolo.
 */
async function fecharAcordoComercial(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  {
    oportunidadeId,
    propostaId,
    autorId,
  }: { oportunidadeId: string; propostaId: string; autorId: string },
) {
  await tx
    .update(oportunidades)
    .set({
      status: 'encerrada',
      encerradaEm: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(oportunidades.id, oportunidadeId),
        eq(oportunidades.status, 'aberta'),
        isNull(oportunidades.encerradaEm),
      ),
    )

  // Alcança as pendentes de **todas** as propostas da oportunidade, inclusive
  // as dos concorrentes — o subselect é o que dá esse alcance sem um join no
  // update.
  await tx
    .update(oportunidadeContrapropostas)
    .set({
      status: 'recusada',
      respondidaEm: new Date(),
      respondidaPor: autorId,
    })
    .where(
      and(
        eq(oportunidadeContrapropostas.status, 'pendente'),
        inArray(
          oportunidadeContrapropostas.propostaId,
          tx
            .select({ id: oportunidadePropostas.id })
            .from(oportunidadePropostas)
            .where(eq(oportunidadePropostas.oportunidadeId, oportunidadeId)),
        ),
      ),
    )

  return propostaId
}

/**
 * Cliente contrapropõe um valor para a proposta recebida.
 *
 * Uma pendente por vez, garantido pelo índice parcial do banco: duas abas não
 * produzem duas negociações abertas sobre a mesma proposta.
 */
export async function criarContraproposta(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ContrapropostaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Contraproposta inválida.',
    }
  }

  const contexto = await contextoDaProposta(validacao.data.propostaId)
  if (!contexto) {
    return { sucesso: false as const, mensagem: 'Proposta não encontrada.' }
  }
  // Contrapropor é ato do dono da solicitação. Nem o prestador, nem outro
  // Cliente, nem quem apenas conhece o id.
  if (contexto.clienteUsuarioId !== sessao.id) {
    return semPermissaoPara('negociar esta proposta')
  }

  const vivo = negociacaoViva(contexto)
  if (!vivo.ok) return { sucesso: false as const, mensagem: vivo.mensagem }

  const valorCentavos = converterValorParaCentavos(validacao.data.valor)
  if (!valorCentavos) {
    return {
      sucesso: false as const,
      mensagem: 'Informe um valor maior que zero para a contraproposta.',
    }
  }

  try {
    const [criada] = await db
      .insert(oportunidadeContrapropostas)
      .values({
        propostaId: contexto.propostaId,
        autorId: sessao.id,
        valorCentavos,
        mensagem: validacao.data.mensagem || null,
      })
      // O índice parcial recusa a segunda pendente; nada é sobrescrito.
      .onConflictDoNothing()
      .returning({ id: oportunidadeContrapropostas.id })

    if (!criada) {
      return {
        sucesso: false as const,
        mensagem: 'Já existe uma contraproposta aguardando resposta.',
      }
    }

    await emitirNotificacoes(db, {
      destinatarios: [contexto.prestadorId],
      autorId: sessao.id,
      tipo: TIPOS_NOTIFICACAO.contrapropostaOportunidade,
      titulo: 'Você recebeu uma contraproposta',
      resumo: resumirTexto(contexto.titulo, 200),
      recursoTipo: 'oportunidade',
      recursoId: contexto.oportunidadeId,
      atendimentoId: null,
      protocolo: null,
      destino: {
        pagina: 'oportunidades',
        oportunidadeId: contexto.oportunidadeId,
      },
    })

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.contrapropostaCriada,
      entidade: 'oportunidade_contrapropostas',
      registroAfetado: criada.id,
      autorId: sessao.id,
      usuarioId: sessao.id,
      origem: 'sistema',
      metadados: { propostaId: contexto.propostaId, valorCentavos },
    })

    await avisarEmTempoReal({
      destinatarios: [contexto.prestadorId],
      titulo: 'Você recebeu uma contraproposta',
      oportunidadeId: contexto.oportunidadeId,
      autorId: sessao.id,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Contraproposta enviada ao profissional.',
      dados: { contrapropostaId: criada.id },
    }
  } catch (erro) {
    console.error('[CRIAR_CONTRAPROPOSTA]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar sua contraproposta. Tente novamente.',
    }
  }
}

/**
 * Prestador responde à contraproposta.
 *
 * Recusar **não** derruba a proposta original: ela continua valendo enquanto a
 * validade e o prazo global permitirem, e o Cliente pode aceitá-la como estava
 * ou tentar outro valor. Aceitar fecha o acordo pelo valor contraproposto.
 *
 * A troca de estado é condicional (`status = 'pendente'` no `where`): duas
 * requisições simultâneas não resolvem a mesma contraproposta duas vezes — a
 * segunda não encontra linha.
 */
export async function responderContraproposta(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = RespostaContrapropostaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Resposta inválida.' }
  }

  const [contraproposta] = await db
    .select({
      id: oportunidadeContrapropostas.id,
      propostaId: oportunidadeContrapropostas.propostaId,
      status: oportunidadeContrapropostas.status,
      valorCentavos: oportunidadeContrapropostas.valorCentavos,
    })
    .from(oportunidadeContrapropostas)
    .where(eq(oportunidadeContrapropostas.id, validacao.data.contrapropostaId))
    .limit(1)

  if (!contraproposta) {
    return { sucesso: false as const, mensagem: 'Contraproposta não encontrada.' }
  }

  const contexto = await contextoDaProposta(contraproposta.propostaId)
  if (!contexto) {
    return { sucesso: false as const, mensagem: 'Proposta não encontrada.' }
  }
  // Só o autor da proposta responde à contraproposta dela.
  if (contexto.prestadorId !== sessao.id) {
    return semPermissaoPara('responder a esta contraproposta')
  }

  const vivo = negociacaoViva(contexto)
  if (!vivo.ok) return { sucesso: false as const, mensagem: vivo.mensagem }

  const aceitar = validacao.data.decisao === 'aceitar'

  try {
    const resultado = await db.transaction(async (tx) => {
      const [resolvida] = await tx
        .update(oportunidadeContrapropostas)
        .set({
          status: aceitar ? 'aceita' : 'recusada',
          respondidaEm: new Date(),
          respondidaPor: sessao.id,
        })
        .where(
          and(
            eq(oportunidadeContrapropostas.id, contraproposta.id),
            // Condição atômica: quem chegar depois não encontra pendente.
            eq(oportunidadeContrapropostas.status, 'pendente'),
          ),
        )
        .returning({ id: oportunidadeContrapropostas.id })

      if (!resolvida) return null

      if (aceitar) {
        // Aceitar a contraproposta fecha o acordo pelo valor dela. O índice
        // parcial de acordo único é a última palavra sobre concorrência.
        const [acordo] = await tx
          .update(oportunidadePropostas)
          .set({
            status: 'aceita',
            aceitaEm: new Date(),
            valorAcordadoCentavos: contraproposta.valorCentavos,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(oportunidadePropostas.id, contexto.propostaId),
              eq(oportunidadePropostas.status, 'enviada'),
            ),
          )
          .returning({ id: oportunidadePropostas.id })

        if (!acordo) return null

        // Mesmo desfecho do aceite direto: a solicitação sai do ar e a
        // negociação daquela oportunidade termina para todo mundo.
        await fecharAcordoComercial(tx, {
          oportunidadeId: contexto.oportunidadeId,
          propostaId: contexto.propostaId,
          autorId: sessao.id,
        })
      }

      return { id: resolvida.id }
    })

    if (!resultado) {
      return {
        sucesso: false as const,
        mensagem: 'Esta contraproposta já foi respondida.',
      }
    }

    await emitirNotificacoes(db, {
      destinatarios: [contexto.clienteUsuarioId],
      autorId: sessao.id,
      tipo: aceitar
        ? TIPOS_NOTIFICACAO.contrapropostaAceita
        : TIPOS_NOTIFICACAO.contrapropostaRecusada,
      titulo: aceitar
        ? 'Sua contraproposta foi aceita'
        : 'Sua contraproposta foi recusada',
      resumo: resumirTexto(contexto.titulo, 200),
      recursoTipo: 'oportunidade',
      recursoId: contexto.oportunidadeId,
      atendimentoId: null,
      protocolo: null,
      destino: {
        pagina: 'oportunidades',
        oportunidadeId: contexto.oportunidadeId,
      },
    })

    await registrarEventoAuditoria({
      acao: aceitar
        ? ACOES_AUDITORIA.contrapropostaAceita
        : ACOES_AUDITORIA.contrapropostaRecusada,
      entidade: 'oportunidade_contrapropostas',
      registroAfetado: contraproposta.id,
      autorId: sessao.id,
      usuarioId: sessao.id,
      origem: 'admin',
      metadados: { propostaId: contexto.propostaId },
    })

    await avisarEmTempoReal({
      destinatarios: [contexto.clienteUsuarioId],
      titulo: aceitar
        ? 'Sua contraproposta foi aceita'
        : 'Sua contraproposta foi recusada',
      oportunidadeId: contexto.oportunidadeId,
      autorId: sessao.id,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: aceitar
        ? 'Contraproposta aceita. O acordo está fechado e aguarda o pagamento do cliente.'
        : 'Contraproposta recusada. Sua proposta original continua valendo.',
    }
  } catch (erro) {
    console.error('[RESPONDER_CONTRAPROPOSTA]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível registrar sua resposta. Tente novamente.',
    }
  }
}

/**
 * Cliente aceita a proposta como ela está.
 *
 * Registra o **acordo comercial** e encerra a solicitação — e nada além disso:
 * não cria Atendimento, não cobra e não abre protocolo. Acordo é preço
 * combinado; a contratação só se efetiva com o pagamento, e é ele que abre o
 * Atendimento. Antecipar o protocolo aqui daria ao Cliente um número de
 * protocolo por algo que ele ainda não pagou.
 *
 * Duas travas de concorrência: o `where` exige `status = 'enviada'` (uma
 * proposta só é aceita uma vez) e o índice parcial de acordo único impede que
 * duas propostas da mesma oportunidade sejam aceitas em paralelo.
 */
export async function aceitarProposta(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = PropostaIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Proposta inválida.' }
  }

  const contexto = await contextoDaProposta(validacao.data.propostaId)
  if (!contexto) {
    return { sucesso: false as const, mensagem: 'Proposta não encontrada.' }
  }
  if (contexto.clienteUsuarioId !== sessao.id) {
    return semPermissaoPara('aceitar esta proposta')
  }

  const vivo = negociacaoViva(contexto)
  if (!vivo.ok) return { sucesso: false as const, mensagem: vivo.mensagem }

  try {
    const acordo = await db.transaction(async (tx) => {
      const [aceita] = await tx
        .update(oportunidadePropostas)
        .set({
          status: 'aceita',
          aceitaEm: new Date(),
          valorAcordadoCentavos: contexto.valorCentavos,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oportunidadePropostas.id, contexto.propostaId),
            eq(oportunidadePropostas.status, 'enviada'),
          ),
        )
        .returning({ id: oportunidadePropostas.id })

      if (!aceita) return null

      await fecharAcordoComercial(tx, {
        oportunidadeId: contexto.oportunidadeId,
        propostaId: contexto.propostaId,
        autorId: sessao.id,
      })

      return aceita
    })

    if (!acordo) {
      return {
        sucesso: false as const,
        mensagem: 'Esta proposta não está mais disponível para aceite.',
      }
    }

    await emitirNotificacoes(db, {
      destinatarios: [contexto.prestadorId],
      autorId: sessao.id,
      tipo: TIPOS_NOTIFICACAO.propostaAceita,
      titulo: 'Sua proposta foi aceita',
      resumo: resumirTexto(contexto.titulo, 200),
      recursoTipo: 'oportunidade',
      recursoId: contexto.oportunidadeId,
      atendimentoId: null,
      protocolo: null,
      destino: {
        pagina: 'oportunidades',
        oportunidadeId: contexto.oportunidadeId,
      },
    })

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.propostaOportunidadeAceita,
      entidade: 'oportunidade_propostas',
      registroAfetado: contexto.propostaId,
      autorId: sessao.id,
      usuarioId: sessao.id,
      origem: 'sistema',
      metadados: { oportunidadeId: contexto.oportunidadeId },
    })

    await avisarEmTempoReal({
      destinatarios: [contexto.prestadorId],
      titulo: 'Sua proposta foi aceita',
      oportunidadeId: contexto.oportunidadeId,
      autorId: sessao.id,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Proposta aceita. Conclua o pagamento para abrir o atendimento.',
    }
  } catch (erro) {
    console.error('[ACEITAR_PROPOSTA]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível registrar o aceite. Tente novamente.',
    }
  }
}
