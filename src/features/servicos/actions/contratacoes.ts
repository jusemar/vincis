'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { db } from '@/db/connection'
import { contratacoesServico, servicos, usuarios } from '@/db/schema'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

const clienteConta = alias(usuarios, 'cliente_conta')
const prestadorConta = alias(usuarios, 'prestador_conta')

const AlterarStatusSchema = z.object({
  contratacaoId: z.string().uuid('Contratação inválida.'),
  status: z.enum(['pendente', 'em_andamento', 'concluido', 'cancelado']),
})

/**
 * Contratações recebidas pelo prestador da sessão.
 *
 * O filtro é `prestador_id = sessão`: um prestador nunca alcança a contratação
 * de outro, mesmo conhecendo o id.
 */
export async function listarContratacoesDoPrestador() {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return { ...SEM_AUTORIZACAO, dados: null }

  const registros = await db
    .select({
      id: contratacoesServico.id,
      nomeServico: contratacoesServico.nomeServicoSnapshot,
      modeloPreco: contratacoesServico.modeloPrecoSnapshot,
      valorCentavos: contratacoesServico.valorSnapshotCentavos,
      prazoEstimadoDias: contratacoesServico.prazoEstimadoDias,
      status: contratacoesServico.status,
      criadoEm: contratacoesServico.createdAt,
      clienteNome: clienteConta.nome,
      categoria: servicos.categoria,
    })
    .from(contratacoesServico)
    .innerJoin(servicos, eq(servicos.id, contratacoesServico.servicoId))
    .innerJoin(
      clienteConta,
      eq(clienteConta.id, contratacoesServico.clienteUsuarioId),
    )
    .where(eq(contratacoesServico.prestadorId, prestador.usuarioId))
    .orderBy(desc(contratacoesServico.createdAt))

  return {
    sucesso: true as const,
    mensagem: 'Contratações carregadas.',
    dados: registros.map((registro) => ({
      ...registro,
      criadoEm: registro.criadoEm.toISOString(),
    })),
  }
}

/** Contratações do Cliente da sessão. */
export async function listarMinhasContratacoes() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { ...SEM_AUTORIZACAO, dados: null }

  const registros = await db
    .select({
      id: contratacoesServico.id,
      nomeServico: contratacoesServico.nomeServicoSnapshot,
      modeloPreco: contratacoesServico.modeloPrecoSnapshot,
      valorCentavos: contratacoesServico.valorSnapshotCentavos,
      status: contratacoesServico.status,
      criadoEm: contratacoesServico.createdAt,
      prestadorNome: prestadorConta.nome,
    })
    .from(contratacoesServico)
    .innerJoin(
      prestadorConta,
      eq(prestadorConta.id, contratacoesServico.prestadorId),
    )
    // Sempre pela sessão: nenhum id de cliente é aceito de fora.
    .where(eq(contratacoesServico.clienteUsuarioId, sessao.id))
    .orderBy(desc(contratacoesServico.createdAt))

  return {
    sucesso: true as const,
    mensagem: 'Contratações carregadas.',
    dados: registros.map((registro) => ({
      ...registro,
      criadoEm: registro.criadoEm.toISOString(),
    })),
  }
}

/** Avanço de status pelo prestador responsável. */
export async function alterarStatusContratacao(entrada: unknown) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = AlterarStatusSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const concluido = validacao.data.status === 'concluido'
  const [atualizada] = await db
    .update(contratacoesServico)
    .set({
      status: validacao.data.status,
      concluidoEm: concluido ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contratacoesServico.id, validacao.data.contratacaoId),
        eq(contratacoesServico.prestadorId, prestador.usuarioId),
      ),
    )
    .returning({ id: contratacoesServico.id })

  if (!atualizada) {
    return { sucesso: false as const, mensagem: 'Contratação não encontrada.' }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return { sucesso: true as const, mensagem: 'Status atualizado.' }
}
