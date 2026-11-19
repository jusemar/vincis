'use server'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'

const Schema = z.discriminatedUnion('ocultar', [
  z.object({
    usuarioId: z.string().uuid('Profissional inválido.'),
    ocultar: z.literal(true),
    motivo: z.string().trim().min(5, 'Informe o motivo (mínimo de 5 caracteres).').max(255),
  }),
  z.object({ usuarioId: z.string().uuid('Profissional inválido.'), ocultar: z.literal(false) }),
])

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestão retira um perfil da vitrine pública (ex.: perfil de teste) ou o
 * devolve. Não exclui nada: cadastro, atendimentos e acesso do dono seguem; o
 * perfil só sai da busca, da Home, do sitemap e do índice dos buscadores.
 * Antes e depois ficam na auditoria.
 */
export async function alterarVisibilidadeVitrine(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }
  const validacao = Schema.safeParse(entrada)
  if (!validacao.success)
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  const dados = validacao.data

  const [perfil] = await db
    .select({ id: perfisProfissionais.id, ocultoEm: perfisProfissionais.ocultoVitrineEm, motivo: perfisProfissionais.motivoOcultacaoVitrine })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, dados.usuarioId))
    .limit(1)
  if (!perfil) return { sucesso: false as const, mensagem: 'Este usuário não possui cadastro profissional.' }

  const ip = await ipDaRequisicao()
  await db.transaction(async (tx) => {
    await tx
      .update(perfisProfissionais)
      .set(
        dados.ocultar
          ? { ocultoVitrineEm: new Date(), motivoOcultacaoVitrine: dados.motivo, updatedAt: new Date() }
          : { ocultoVitrineEm: null, motivoOcultacaoVitrine: null, updatedAt: new Date() },
      )
      .where(eq(perfisProfissionais.id, perfil.id))
    await registrarEventoAuditoria(
      {
        acao: dados.ocultar ? ACOES_AUDITORIA.perfilVitrineOcultado : ACOES_AUDITORIA.perfilVitrineReexibido,
        entidade: 'perfis_profissionais',
        registroAfetado: perfil.id,
        autorId: gestor.id,
        usuarioId: dados.usuarioId,
        origem: 'gestao_vincis',
        ip,
        metadados: {
          antes: perfil.ocultoEm ? { oculto: true, motivo: perfil.motivo } : { oculto: false },
          depois: dados.ocultar ? { oculto: true, motivo: dados.motivo } : { oculto: false },
        },
      },
      tx,
    )
  })

  revalidatePath(`/admin/usuarios/${dados.usuarioId}`)
  revalidatePath('/profissionais')
  revalidatePath('/sitemap.xml')
  return { sucesso: true as const, mensagem: dados.ocultar ? 'Perfil retirado da vitrine.' : 'Perfil devolvido à vitrine.' }
}
