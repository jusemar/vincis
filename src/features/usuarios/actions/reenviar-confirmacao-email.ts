'use server'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { enviarEmailConfirmacao } from '@/integracoes/email/enviar-confirmacao-email'
import { gerarToken } from '../lib/gerar-token'
import {
  ReenvioConfirmacaoSchema,
  type ReenvioConfirmacaoDTO,
} from '../schemas/confirmacao-email'
import type { ResultadoPadrao } from '../types'

const TEMPO_EXPIRACAO_HORAS = 24
const INTERVALO_REENVIO_MS = 60 * 1000
const MENSAGEM_GENERICA =
  'Se houver uma conta pendente para este e-mail, enviaremos um novo link de confirmação.'

export async function reenviarConfirmacaoEmail(
  dados: ReenvioConfirmacaoDTO,
): Promise<ResultadoPadrao> {
  const validacao = ReenvioConfirmacaoSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'E-mail inválido',
    }
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      const [usuario] = await tx
        .select({
          id: usuarios.id,
          nome: usuarios.nome,
          email: usuarios.email,
          status: usuarios.status,
          emailVerificado: usuarios.emailVerificado,
        })
        .from(usuarios)
        .where(sql`lower(${usuarios.email}) = ${validacao.data.email}`)
        .limit(1)
        .for('update')

      // O critério é o e-mail ainda não confirmado, não o status da conta: uma
      // conta liberada pela Gestão via WhatsApp segue com o e-mail pendente e
      // continua podendo confirmá-lo depois. Conta bloqueada nunca reenvia.
      if (
        !usuario ||
        usuario.status === 'bloqueado' ||
        usuario.emailVerificado
      ) {
        return { estado: 'ignorado' as const }
      }

      const [tokenMaisRecente] = await tx
        .select({ createdAt: tokensUsuario.createdAt })
        .from(tokensUsuario)
        .where(
          and(
            eq(tokensUsuario.usuarioId, usuario.id),
            eq(tokensUsuario.tipo, 'confirmacao_email'),
          ),
        )
        .orderBy(desc(tokensUsuario.createdAt))
        .limit(1)

      const agora = new Date()
      if (
        tokenMaisRecente &&
        agora.getTime() - tokenMaisRecente.createdAt.getTime() < INTERVALO_REENVIO_MS
      ) {
        return { estado: 'limitado' as const }
      }

      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(
          and(
            eq(tokensUsuario.usuarioId, usuario.id),
            eq(tokensUsuario.tipo, 'confirmacao_email'),
            isNull(tokensUsuario.usadoEm),
          ),
        )

      const { token, hash } = gerarToken()
      const expiraEm = new Date(agora)
      expiraEm.setHours(expiraEm.getHours() + TEMPO_EXPIRACAO_HORAS)

      const [tokenInserido] = await tx
        .insert(tokensUsuario)
        .values({
          usuarioId: usuario.id,
          tipo: 'confirmacao_email',
          tokenHash: hash,
          expiraEm,
        })
        .returning({ id: tokensUsuario.id })

      return {
        estado: 'enviar' as const,
        token,
        tokenId: tokenInserido.id,
        nome: usuario.nome,
        email: usuario.email,
      }
    })

    if (resultado.estado === 'ignorado') {
      return { sucesso: true, mensagem: MENSAGEM_GENERICA }
    }

    if (resultado.estado === 'limitado') {
      return {
        sucesso: false,
        mensagem: 'Aguarde um minuto antes de solicitar outro e-mail.',
      }
    }

    const envio = await enviarEmailConfirmacao({
      destinatario: resultado.email,
      nome: resultado.nome,
      token: resultado.token,
    })

    if (!envio.sucesso) {
      await db
        .update(tokensUsuario)
        .set({ usadoEm: new Date() })
        .where(eq(tokensUsuario.id, resultado.tokenId))

      return {
        sucesso: false,
        mensagem: 'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.',
      }
    }

    return { sucesso: true, mensagem: MENSAGEM_GENERICA }
  } catch (error) {
    console.error('[REENVIAR_CONFIRMACAO_EMAIL]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false,
      mensagem: 'Não foi possível processar o reenvio. Tente novamente mais tarde.',
    }
  }
}
