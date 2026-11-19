'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { perfis, usuarios, usuariosPerfis } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { IDENTIDADES_PUBLICAS } from '../constants/identidade-publica'
import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import { validarGestorVincis } from '../lib/validar-gestor-vincis'

const Schema = z.object({
  usuarioId: z.string().uuid('Usuário inválido.'),
  identidade: z.enum(IDENTIDADES_PUBLICAS),
})

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestão define como a conta se apresenta em público.
 *
 * `equipe_vincis` só para quem tem o perfil de Gestor: nenhum profissional pode
 * ser apresentado como equipe da plataforma. A troca **só** muda a
 * apresentação (autoria e vitrine) — `usuarios_perfis`, cadastro de prestador,
 * sessões e capacidades não são tocados. Antes e depois ficam na auditoria.
 */
export async function alterarIdentidadePublica(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }
  const validacao = Schema.safeParse(entrada)
  if (!validacao.success)
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  const { usuarioId, identidade } = validacao.data

  const [alvo] = await db
    .select({ atual: usuarios.identidadePublica })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!alvo) return { sucesso: false as const, mensagem: 'Usuário não encontrado.' }
  if (alvo.atual === identidade) return { sucesso: true as const, mensagem: 'Identidade pública mantida.' }

  if (identidade === 'equipe_vincis') {
    const [ehGestor] = await db
      .select({ id: usuariosPerfis.usuarioId })
      .from(usuariosPerfis)
      .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
      .where(and(eq(usuariosPerfis.usuarioId, usuarioId), eq(perfis.nome, PERFIL_GESTOR_VINCIS)))
      .limit(1)
    if (!ehGestor)
      return { sucesso: false as const, mensagem: 'Somente contas de Gestor da Plataforma podem assinar como equipe Vincis.' }
  }

  const ip = await ipDaRequisicao()
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ identidadePublica: identidade, updatedAt: new Date() }).where(eq(usuarios.id, usuarioId))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.identidadePublicaAlterada,
        entidade: 'usuarios',
        registroAfetado: usuarioId,
        autorId: gestor.id,
        usuarioId,
        origem: 'gestao_vincis',
        ip,
        metadados: { anterior: alvo.atual, nova: identidade },
      },
      tx,
    )
  })

  // Vitrine, sitemap e autoria dos artigos mudam juntos.
  revalidatePath(`/admin/usuarios/${usuarioId}`)
  revalidatePath('/profissionais')
  revalidatePath('/conhecimento', 'layout')
  revalidatePath('/sitemap.xml')
  return {
    sucesso: true as const,
    mensagem: identidade === 'equipe_vincis' ? 'Conta passa a se apresentar como equipe Vincis.' : 'Conta volta a se apresentar pelo cadastro profissional.',
  }
}
