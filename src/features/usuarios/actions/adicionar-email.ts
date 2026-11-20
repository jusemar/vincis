'use server'

import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { enviarEmailConfirmacao } from '@/integracoes/email/enviar-confirmacao-email'
import { executarAposResposta } from '../lib/apos-resposta'
import { gerarToken } from '../lib/gerar-token'
import { ipDaRequisicao } from '../lib/limite-recuperacao'
import { obterSessaoServidor } from '../lib/sessao-servidor'

/**
 * Conta criada pelo celular adiciona um e-mail, com confirmação própria.
 *
 * O endereço fica em `email_pendente` e só vira o e-mail da conta quando o link
 * enviado a ELE é aberto (`confirmarEmail`). Confirmar o celular nunca valida
 * e-mail, e pedir não "reserva" o endereço de ninguém. A resposta é a mesma
 * esteja o endereço livre ou já em outra conta — nesse caso nada é enviado.
 */

const TIPO = 'confirmacao_email_adicional'
const VALIDADE_HORAS = 24
const INTERVALO_MS = 60_000
const MAXIMO_POR_DIA = 5

export type ResultadoAdicaoEmail = { sucesso: boolean; mensagem: string; aguardarSegundos?: number }

const MENSAGEM_ENVIADO =
  'Se este endereço puder ser usado, enviamos um link de confirmação para ele. O e-mail só passa a valer depois da confirmação.'

export async function solicitarAdicaoEmail(entrada: unknown): Promise<ResultadoAdicaoEmail> {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { sucesso: false, mensagem: 'Sessão expirada. Entre novamente.' }

  const validacao = z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(255) }).safeParse(entrada)
  if (!validacao.success) return { sucesso: false, mensagem: validacao.error.issues[0]?.message ?? 'Informe um e-mail válido.' }
  const email = validacao.data.email

  try {
    const resultado = await db.transaction(async (tx) => {
      const [conta] = await tx
        .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status })
        .from(usuarios)
        .where(eq(usuarios.id, sessao.id))
        .limit(1)
        .for('update')
      if (!conta || conta.status === 'bloqueado') return { erro: 'Não foi possível adicionar o e-mail.' } as const
      if (conta.email) return { erro: 'Sua conta já tem um e-mail. Para alterá-lo, fale com a Vincis.' } as const

      const agora = Date.now()
      const recentes = await tx
        .select({ createdAt: tokensUsuario.createdAt })
        .from(tokensUsuario)
        .where(and(eq(tokensUsuario.usuarioId, conta.id), eq(tokensUsuario.tipo, TIPO), gt(tokensUsuario.createdAt, new Date(agora - 86_400_000))))
      if (recentes.some((t) => agora - t.createdAt.getTime() < INTERVALO_MS)) return { limitado: true } as const
      if (recentes.length >= MAXIMO_POR_DIA) return { erro: 'Muitos pedidos hoje. Tente novamente amanhã.' } as const

      // Links anteriores deixam de valer; o pendente passa a ser o novo endereço.
      await tx
        .update(tokensUsuario)
        .set({ usadoEm: new Date() })
        .where(and(eq(tokensUsuario.usuarioId, conta.id), eq(tokensUsuario.tipo, TIPO), isNull(tokensUsuario.usadoEm)))
      await tx.update(usuarios).set({ emailPendente: email, updatedAt: new Date() }).where(eq(usuarios.id, conta.id))

      const [emUso] = await tx.select({ id: usuarios.id }).from(usuarios).where(sql`lower(${usuarios.email}) = ${email}`).limit(1)
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.emailAdicionalSolicitado,
          entidade: 'usuarios',
          registroAfetado: conta.id,
          usuarioId: conta.id,
          autorId: conta.id,
          origem: 'sistema',
          ip: await ipDaRequisicao(),
          metadados: { enviado: !emUso },
        },
        tx,
      )
      // Endereço de outra conta: mesma resposta, nenhum link (não revela quem é cliente).
      if (emUso) return { enviar: false } as const

      const { token, hash } = gerarToken()
      const [registro] = await tx
        .insert(tokensUsuario)
        .values({ usuarioId: conta.id, tipo: TIPO, tokenHash: hash, expiraEm: new Date(agora + VALIDADE_HORAS * 3_600_000) })
        .returning({ id: tokensUsuario.id })
      return { enviar: true, token, tokenId: registro.id, nome: conta.nome } as const
    })

    if ('erro' in resultado && resultado.erro) return { sucesso: false, mensagem: resultado.erro }
    if ('limitado' in resultado) return { sucesso: true, mensagem: MENSAGEM_ENVIADO, aguardarSegundos: 60 }
    if (resultado.enviar) {
      const { token, tokenId, nome } = resultado
      await executarAposResposta(async () => {
        const envio = await enviarEmailConfirmacao({ destinatario: email, nome, token })
        if (!envio.sucesso) {
          await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, tokenId))
          console.error('[ADICIONAR_EMAIL] Falha no envio', { motivo: envio.motivo })
        }
      })
    }
    return { sucesso: true, mensagem: MENSAGEM_ENVIADO, aguardarSegundos: 60 }
  } catch (erro) {
    console.error('[ADICIONAR_EMAIL]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, mensagem: 'Não foi possível enviar a confirmação. Tente novamente.' }
  }
}
