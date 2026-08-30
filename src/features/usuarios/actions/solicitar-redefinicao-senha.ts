'use server'

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { enviarEmailRedefinicaoSenha } from '@/integracoes/email/enviar-redefinicao-senha-email'
import { gerarToken } from '../lib/gerar-token'
import {
  SolicitarRedefinicaoSenhaSchema,
  type SolicitarRedefinicaoSenhaDTO,
} from '../schemas/redefinicao-senha'
import type { ResultadoPadrao } from '../types'

const TEMPO_EXPIRACAO_MINUTOS = 60
const INTERVALO_REENVIO_MS = 60 * 1000
const MENSAGEM_GENERICA =
  'Se existir uma conta com este e-mail ou WhatsApp, enviaremos um link para redefinir sua senha.'

export async function solicitarRedefinicaoSenha(
  dados: SolicitarRedefinicaoSenhaDTO,
): Promise<ResultadoPadrao> {
  const validacao = SolicitarRedefinicaoSenhaSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Informe e-mail ou WhatsApp',
    }
  }

  const identificador = validacao.data.emailOuWhatsapp.toLowerCase()

  try {
    const resultado = await db.transaction(async (tx) => {
      const [usuario] = await tx
        .select({
          id: usuarios.id,
          nome: usuarios.nome,
          email: usuarios.email,
          status: usuarios.status,
        })
        .from(usuarios)
        .where(
          or(
            sql`lower(${usuarios.email}) = ${identificador}`,
            eq(usuarios.whatsapp, validacao.data.emailOuWhatsapp),
          ),
        )
        .limit(1)
        .for('update')

      // Conta bloqueada nunca recebe link — mas a resposta pública é sempre a
      // mesma genérica, para não funcionar como oráculo de contas existentes.
      if (!usuario || usuario.status === 'bloqueado') {
        return { estado: 'ignorado' as const }
      }

      const [tokenMaisRecente] = await tx
        .select({ createdAt: tokensUsuario.createdAt })
        .from(tokensUsuario)
        .where(
          and(
            eq(tokensUsuario.usuarioId, usuario.id),
            eq(tokensUsuario.tipo, 'recuperacao_senha'),
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

      // Qualquer token de recuperação anterior, ainda não usado, é invalidado:
      // só o link mais recente enviado pode ser usado.
      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(
          and(
            eq(tokensUsuario.usuarioId, usuario.id),
            eq(tokensUsuario.tipo, 'recuperacao_senha'),
            isNull(tokensUsuario.usadoEm),
          ),
        )

      const { token, hash } = gerarToken()
      const expiraEm = new Date(agora)
      expiraEm.setMinutes(expiraEm.getMinutes() + TEMPO_EXPIRACAO_MINUTOS)

      const [tokenInserido] = await tx
        .insert(tokensUsuario)
        .values({
          usuarioId: usuario.id,
          tipo: 'recuperacao_senha',
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
      // Também genérica: confirmar "aguarde" revelaria que a conta existe.
      return { sucesso: true, mensagem: MENSAGEM_GENERICA }
    }

    const envio = await enviarEmailRedefinicaoSenha({
      destinatario: resultado.email,
      nome: resultado.nome,
      token: resultado.token,
    })

    if (!envio.sucesso) {
      await db
        .update(tokensUsuario)
        .set({ usadoEm: new Date() })
        .where(eq(tokensUsuario.id, resultado.tokenId))

      console.error('[SOLICITAR_REDEFINICAO_SENHA] Falha ao enviar e-mail', {
        motivo: envio.motivo,
      })
      // A resposta pública permanece genérica mesmo em falha de envio: o
      // motivo real fica só no log, nunca no retorno ao visitante.
      return { sucesso: true, mensagem: MENSAGEM_GENERICA }
    }

    return { sucesso: true, mensagem: MENSAGEM_GENERICA }
  } catch (error) {
    console.error('[SOLICITAR_REDEFINICAO_SENHA]', error)
    return { sucesso: true, mensagem: MENSAGEM_GENERICA }
  }
}
