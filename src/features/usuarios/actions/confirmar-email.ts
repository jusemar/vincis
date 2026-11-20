'use server'

import { createHash } from 'node:crypto'
import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { ConfirmacaoEmailSchema, type ConfirmacaoEmailDTO } from '../schemas/confirmacao-email'
import type { ResultadoPadrao } from '../types'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * E-mail adicionado por uma conta que já existe (criada pelo celular): o
 * endereço pendente só vira o e-mail da conta agora, com o link aberto — e só
 * se nenhuma outra conta o tiver confirmado nesse meio-tempo. O status da conta
 * não muda (ela já está ativa pelo celular).
 */
async function confirmarEmailAdicional(
  tx: Transacao,
  token: { id: string; usuarioId: string },
  usuario: { status: string; email: string | null; emailPendente: string | null } | undefined,
): Promise<ResultadoPadrao> {
  if (!usuario || usuario.status === 'bloqueado' || !usuario.emailPendente) {
    return { sucesso: false, mensagem: 'Esta confirmação não é mais válida.' }
  }
  const novo = usuario.emailPendente
  const [emUso] = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(sql`lower(${usuarios.email}) = ${novo.toLowerCase()}`, ne(usuarios.id, token.usuarioId)))
    .limit(1)
  const agora = new Date()
  await tx.update(tokensUsuario).set({ usadoEm: agora }).where(eq(tokensUsuario.id, token.id))
  if (emUso) {
    await tx.update(usuarios).set({ emailPendente: null, updatedAt: agora }).where(eq(usuarios.id, token.usuarioId))
    return { sucesso: false, mensagem: 'Este e-mail não pode ser usado. Adicione outro endereço na sua conta.' }
  }
  await tx
    .update(usuarios)
    .set({ email: novo, emailPendente: null, emailVerificado: true, emailVerificadoEm: agora, updatedAt: agora })
    .where(eq(usuarios.id, token.usuarioId))
  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.emailAdicionalConfirmado,
      entidade: 'usuarios',
      registroAfetado: token.usuarioId,
      usuarioId: token.usuarioId,
      autorId: token.usuarioId,
      origem: 'sistema',
    },
    tx,
  )
  return { sucesso: true, mensagem: 'E-mail confirmado e adicionado à sua conta' }
}

export async function confirmarEmail(dados: ConfirmacaoEmailDTO): Promise<ResultadoPadrao> {
  const validated = ConfirmacaoEmailSchema.safeParse(dados)

  if (!validated.success) {
    return {
      sucesso: false,
      mensagem: 'Token inválido',
    }
  }

  const tokenHash = createHash('sha256').update(validated.data.token).digest('hex')

  try {
    return await db.transaction(async (tx): Promise<ResultadoPadrao> => {
      const [tokenValido] = await tx
        .select({
          id: tokensUsuario.id,
          usuarioId: tokensUsuario.usuarioId,
          tipo: tokensUsuario.tipo,
        })
        .from(tokensUsuario)
        .where(
          and(
            eq(tokensUsuario.tokenHash, tokenHash),
            // `confirmacao_email_adicional`: conta criada pelo celular que
            // adicionou um e-mail depois (ver `adicionar-email.ts`).
            inArray(tokensUsuario.tipo, ['confirmacao_email', 'confirmacao_email_adicional']),
            isNull(tokensUsuario.usadoEm),
            gt(tokensUsuario.expiraEm, new Date()),
          ),
        )
        .limit(1)
        .for('update')

      if (!tokenValido) {
        return {
          sucesso: false,
          mensagem: 'Token inválido ou expirado',
        }
      }

      const [usuario] = await tx
        .select({ status: usuarios.status, email: usuarios.email, emailPendente: usuarios.emailPendente })
        .from(usuarios)
        .where(eq(usuarios.id, tokenValido.usuarioId))
        .limit(1)
        .for('update')

      if (tokenValido.tipo === 'confirmacao_email_adicional') {
        return confirmarEmailAdicional(tx, tokenValido, usuario)
      }

      if (!usuario || usuario.status === 'bloqueado') {
        return {
          sucesso: false,
          mensagem: 'Esta conta não pode ser confirmada',
        }
      }

      const agora = new Date()

      await tx
        .update(usuarios)
        .set({
          emailVerificado: true,
          emailVerificadoEm: agora,
          status: 'ativo',
          updatedAt: agora,
        })
        .where(eq(usuarios.id, tokenValido.usuarioId))

      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(eq(tokensUsuario.id, tokenValido.id))

      return {
        sucesso: true,
        mensagem: 'E-mail confirmado com sucesso',
      }
    })
  } catch (error) {
    console.error('[CONFIRMAR_EMAIL]', error)
    return {
      sucesso: false,
      mensagem: 'Não foi possível confirmar o e-mail. Tente novamente.',
    }
  }
}
