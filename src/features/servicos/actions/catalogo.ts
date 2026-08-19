'use server'

import { and, asc, count, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { contratacoesServico, servicos } from '@/db/schema'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import {
  LIMITE_SERVICOS_CATALOGO,
  AlternarServicoSchema,
  ServicoIdSchema,
  ServicoSchema,
  converterValorParaCentavos,
  type ServicoDTO,
  type ServicoValidado,
} from '../schemas/servico'

/**
 * Catálogo do prestador.
 *
 * A porta é `obterPrestadorSessao`, a mesma dos clientes e da equipe: vale para
 * Profissional aprovado e Colaborador ativo, e nenhum dos dois vira o outro por
 * ter catálogo. O dono do serviço é sempre o usuário da sessão — nunca um id
 * recebido do cliente —, o que já garante o isolamento entre prestadores.
 */

async function contarServicosDoPrestador(prestadorId: string) {
  const [total] = await db
    .select({ valor: count() })
    .from(servicos)
    .where(eq(servicos.prestadorId, prestadorId))
  return total?.valor ?? 0
}

function valoresDoServico(dados: ServicoValidado) {
  const semPreco = dados.modeloPreco === 'sob_orcamento'
  return {
    nome: dados.nome,
    descricaoCurta: dados.descricaoCurta,
    descricaoDetalhada: dados.descricaoDetalhada || null,
    categoria: dados.categoria,
    itensIncluidos: dados.itensIncluidos,
    checklistModelo: dados.checklistModelo,
    modeloPreco: dados.modeloPreco,
    // Sob orçamento fica nulo de propósito: zero seria um preço inventado.
    valorCentavos: semPreco ? null : converterValorParaCentavos(dados.valor),
    prazoEstimadoDias: dados.prazoEstimadoDias ?? null,
    ativo: dados.ativo,
    publico: dados.publico,
    ordem: dados.ordem,
  }
}

export async function listarMeusServicos() {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return { ...SEM_AUTORIZACAO, dados: null }

  const dados = await db
    .select()
    .from(servicos)
    .where(eq(servicos.prestadorId, prestador.usuarioId))
    .orderBy(asc(servicos.ordem), asc(servicos.nome))

  return {
    sucesso: true as const,
    mensagem: 'Catálogo carregado.',
    dados,
    limite: LIMITE_SERVICOS_CATALOGO,
  }
}

export async function criarServico(dados: ServicoDTO) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = ServicoSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados.',
    }
  }

  // Limite verificado no servidor: desabilitar o botão não é proteção.
  if ((await contarServicosDoPrestador(prestador.usuarioId)) >= LIMITE_SERVICOS_CATALOGO) {
    return {
      sucesso: false as const,
      mensagem: `Você atingiu o limite de ${LIMITE_SERVICOS_CATALOGO} serviços.`,
    }
  }

  const [criado] = await db
    .insert(servicos)
    .values({
      prestadorId: prestador.usuarioId,
      ...valoresDoServico(validacao.data),
    })
    .returning({ id: servicos.id })

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Serviço cadastrado com sucesso.',
    dados: criado,
  }
}

export async function atualizarServico(servicoId: string, dados: ServicoDTO) {
  const prestador = await obterPrestadorSessao()
  const id = ServicoIdSchema.safeParse(servicoId)
  if (!prestador || !id.success) return SEM_AUTORIZACAO

  const validacao = ServicoSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados.',
    }
  }

  // O `where` amarra o serviço ao dono: editar o de outro prestador não
  // encontra linha nenhuma.
  const [atualizado] = await db
    .update(servicos)
    .set({ ...valoresDoServico(validacao.data), updatedAt: new Date() })
    .where(
      and(
        eq(servicos.id, id.data),
        eq(servicos.prestadorId, prestador.usuarioId),
      ),
    )
    .returning({ id: servicos.id })

  if (!atualizado) {
    return { sucesso: false as const, mensagem: 'Serviço não encontrado.' }
  }

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Serviço atualizado.' }
}

export async function alternarServicoAtivo(entrada: unknown) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = AlternarServicoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const [atualizado] = await db
    .update(servicos)
    .set({ ativo: validacao.data.ativo, updatedAt: new Date() })
    .where(
      and(
        eq(servicos.id, validacao.data.servicoId),
        eq(servicos.prestadorId, prestador.usuarioId),
      ),
    )
    .returning({ id: servicos.id })

  if (!atualizado) {
    return { sucesso: false as const, mensagem: 'Serviço não encontrado.' }
  }

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: validacao.data.ativo ? 'Serviço ativado.' : 'Serviço desativado.',
  }
}

/**
 * Exclusão de um serviço do catálogo.
 *
 * Serviço já contratado nunca é apagado: as contratações guardam o histórico do
 * cliente e apontam para ele. Nesse caso desativamos e tiramos do ar, o que
 * preserva os snapshots e some com o item da vitrine — apagar destruiria
 * histórico real. Só quem nunca foi contratado é removido de fato.
 */
export async function excluirServico(servicoId: string) {
  const prestador = await obterPrestadorSessao()
  const id = ServicoIdSchema.safeParse(servicoId)
  if (!prestador || !id.success) return SEM_AUTORIZACAO

  const [servico] = await db
    .select({ id: servicos.id })
    .from(servicos)
    .where(
      and(
        eq(servicos.id, id.data),
        eq(servicos.prestadorId, prestador.usuarioId),
      ),
    )
    .limit(1)

  if (!servico) {
    return { sucesso: false as const, mensagem: 'Serviço não encontrado.' }
  }

  const [contratado] = await db
    .select({ id: contratacoesServico.id })
    .from(contratacoesServico)
    .where(eq(contratacoesServico.servicoId, id.data))
    .limit(1)

  if (contratado) {
    await db
      .update(servicos)
      .set({ ativo: false, publico: false, updatedAt: new Date() })
      .where(eq(servicos.id, id.data))

    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem:
        'Este serviço já foi contratado, então foi arquivado em vez de excluído. O histórico das contratações permanece intacto.',
      arquivado: true,
    }
  }

  await db.delete(servicos).where(eq(servicos.id, id.data))
  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Serviço excluído.',
    arquivado: false,
  }
}
