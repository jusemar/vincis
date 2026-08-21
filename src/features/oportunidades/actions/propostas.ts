'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  oportunidadeDispensas,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { prestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { tipoPrestadorDoPerfil } from '@/features/usuarios/lib/tipos-pessoa'
import type { CategoriaOportunidade } from '../constants/oportunidade'
import { obterVinculoComOportunidade } from '../lib/autorizacao'
import { categoriasCompativeisDoPrestador } from '../lib/compatibilidade'
import {
  contarOportunidadesDisponiveis,
  listarOportunidadesDoPrestador,
} from '../queries/listar-oportunidades-do-prestador'
import { avisarEmTempoReal } from '../lib/difundir-oportunidade'
import {
  expirarOportunidadesVencidas,
  limitarValidade,
  oportunidadeExpirada,
} from '../lib/vigencia-sql'
import {
  NovaPropostaSchema,
  OportunidadeIdSchema,
  converterValorParaCentavos,
} from '../schemas/oportunidade'

/**
 * A vitrine de oportunidades do prestador logado.
 *
 * Devolve o que a consulta já recorta: solicitações abertas e compatíveis, com
 * a proposta **do próprio** prestador quando existir. Proposta alheia não passa
 * por aqui em momento nenhum.
 */
export async function carregarOportunidadesDisponiveis() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) return SEM_AUTORIZACAO_COM_DADOS

  // Mesmo motivo da área do Cliente: sem agendador, a leitura é o momento em
  // que o vencimento vira estado no banco.
  await expirarOportunidadesVencidas()

  const [lista, disponiveis] = await Promise.all([
    listarOportunidadesDoPrestador(sessao.id),
    contarOportunidadesDisponiveis(sessao.id),
  ])

  return {
    sucesso: true as const,
    mensagem: 'Oportunidades carregadas.',
    dados: { lista, disponiveis },
  }
}

/**
 * Envia (ou revisa) a proposta do prestador para uma oportunidade.
 *
 * Quatro verificações antes de gravar, todas no servidor:
 *
 * 1. é prestador habilitado — quem não pode operar não propõe;
 * 2. a oportunidade existe e está **aberta**;
 * 3. a categoria dela é compatível com o cadastro dele — não basta conhecer o
 *    id de uma solicitação para responder a ela;
 * 4. não é a própria solicitação — o mesmo id não pode ocupar as duas pontas.
 *
 * O conflito no índice único vira atualização: reenviar é revisar a proposta,
 * nunca criar uma segunda. É o banco que garante isso, não o código.
 */
export async function enviarProposta(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) {
    return semPermissaoPara('enviar propostas')
  }

  const validacao = NovaPropostaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Proposta inválida.',
    }
  }
  const dados = validacao.data

  const [perfil] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      especialidades: perfisProfissionais.especialidades,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, sessao.id))
    .limit(1)

  if (!prestadorHabilitado(perfil ?? null)) {
    return semPermissaoPara('enviar propostas')
  }

  const [oportunidade] = await db
    .select({
      id: oportunidades.id,
      categoria: oportunidades.categoria,
      status: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
    })
    .from(oportunidades)
    .where(eq(oportunidades.id, dados.oportunidadeId))
    .limit(1)

  if (!oportunidade) {
    return { sucesso: false as const, mensagem: 'Oportunidade não encontrada.' }
  }
  // Vencida pelo relógio conta como fechada, mesmo que a coluna ainda diga
  // `aberta`: sem agendador, é a leitura que sustenta a regra.
  if (oportunidade.status !== 'aberta' || oportunidadeExpirada(oportunidade)) {
    return {
      sucesso: false as const,
      mensagem: 'Esta oportunidade não está mais aberta para propostas.',
    }
  }
  if (oportunidade.clienteUsuarioId === sessao.id) {
    return {
      sucesso: false as const,
      mensagem: 'Você não pode responder à sua própria solicitação.',
    }
  }

  const compativeis = categoriasCompativeisDoPrestador(perfil ?? null)
  if (
    !compativeis.includes(oportunidade.categoria as CategoriaOportunidade)
  ) {
    return semPermissaoPara('enviar proposta nesta categoria')
  }

  // Proposta sem valor é "a combinar"; um zero digitado não vira preço.
  const valorCentavos = converterValorParaCentavos(dados.valor) || null
  // A validade escolhida nunca ultrapassa o prazo global: uma proposta
  // aceitável depois de a solicitação expirar seria acordo fora do prazo.
  const { validaAte, limitada } = limitarValidade(
    dados.validadeHoras,
    oportunidade.expiraEm,
  )

  try {
    const [proposta] = await db
      .insert(oportunidadePropostas)
      .values({
        oportunidadeId: oportunidade.id,
        prestadorId: sessao.id,
        mensagem: dados.mensagem,
        valorCentavos,
        prazoEstimadoDias: dados.prazoEstimadoDias ?? null,
        validaAte,
      })
      .onConflictDoUpdate({
        target: [
          oportunidadePropostas.oportunidadeId,
          oportunidadePropostas.prestadorId,
        ],
        set: {
          mensagem: dados.mensagem,
          valorCentavos,
          prazoEstimadoDias: dados.prazoEstimadoDias ?? null,
          validaAte,
          updatedAt: new Date(),
        },
        // Proposta já aceita não é revisada: o acordo está fechado.
        where: eq(oportunidadePropostas.status, 'enviada'),
      })
      .returning({
        id: oportunidadePropostas.id,
        criadoEm: oportunidadePropostas.createdAt,
        atualizadoEm: oportunidadePropostas.updatedAt,
      })

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.propostaOportunidadeEnviada,
      entidade: 'oportunidade_propostas',
      registroAfetado: proposta.id,
      autorId: sessao.id,
      usuarioId: sessao.id,
      origem: 'admin',
      metadados: {
        oportunidadeId: oportunidade.id,
        categoria: oportunidade.categoria,
      },
    })

    // Enviar proposta supera uma dispensa anterior: o prestador mudou de
    // ideia, e manter a marca de "sem interesse" ao lado da proposta dele seria
    // contar duas histórias contraditórias sobre a mesma oportunidade.
    await db
      .delete(oportunidadeDispensas)
      .where(
        and(
          eq(oportunidadeDispensas.oportunidadeId, oportunidade.id),
          eq(oportunidadeDispensas.prestadorId, sessao.id),
        ),
      )

    // O Cliente é avisado de que há novidade; o conteúdo da proposta não viaja
    // no evento — a tela dele refaz a consulta, que aplica a autorização.
    await avisarEmTempoReal({
      destinatarios: [oportunidade.clienteUsuarioId],
      titulo: 'Você recebeu uma nova proposta',
      oportunidadeId: oportunidade.id,
      autorId: sessao.id,
    })

    revalidatePath('/admin')
    revalidatePath('/cliente')
    if (!proposta) {
      return {
        sucesso: false as const,
        mensagem: 'Esta proposta já foi aceita e não pode ser alterada.',
      }
    }

    return {
      sucesso: true as const,
      mensagem: limitada
        ? 'Proposta enviada. A validade foi ajustada para o fim do prazo da oportunidade.'
        : 'Proposta enviada ao cliente.',
      dados: { propostaId: proposta.id, validaAte: validaAte.toISOString() },
    }
  } catch (error) {
    console.error('[ENVIAR_PROPOSTA]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar sua proposta. Tente novamente.',
    }
  }
}

/**
 * "Não tenho interesse": tira a oportunidade da fila **deste** prestador.
 *
 * Não é recusa comercial, não encerra a solicitação e não avisa o Cliente —
 * não existe contratação para recusar nesta etapa. O efeito é individual: a
 * oportunidade deixa de contar no banner dele e não volta como nova no próximo
 * F5, enquanto continua valendo para todos os outros prestadores compatíveis.
 *
 * A autorização é a mesma da vitrine: só dispensa quem poderia responder.
 * Conhecer o id de uma solicitação de outra categoria não dá direito nem de
 * marcá-la.
 */
export async function marcarSemInteresse(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) {
    return semPermissaoPara('dispensar oportunidades')
  }

  const validacao = OportunidadeIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Oportunidade inválida.' }
  }

  const vinculo = await obterVinculoComOportunidade(
    validacao.data.oportunidadeId,
    sessao.id,
  )
  if (vinculo !== 'prestador') {
    return semPermissaoPara('dispensar esta oportunidade')
  }

  // Clicar duas vezes não grava duas linhas: quem garante é o índice único.
  await db
    .insert(oportunidadeDispensas)
    .values({
      oportunidadeId: validacao.data.oportunidadeId,
      prestadorId: sessao.id,
    })
    .onConflictDoNothing()

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Oportunidade removida da sua lista de pendências.',
  }
}
