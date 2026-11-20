'use server'

import { eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { enviarEmailRedefinicaoSenha } from '@/integracoes/email/enviar-redefinicao-senha-email'
import { executarAposResposta } from '../lib/apos-resposta'
import { gerarToken } from '../lib/gerar-token'
import {
  hashIdentificador,
  ipDaRequisicao,
  recuperacaoExcedeLimites,
  registrarPedidoRecuperacao,
} from '../lib/limite-recuperacao'
import { contaEmIntervaloDeReenvio, invalidarRecuperacoesAbertas } from '../lib/recuperacao-senha'
import {
  SolicitarRedefinicaoSenhaSchema,
  type SolicitarRedefinicaoSenhaDTO,
} from '../schemas/redefinicao-senha'
import {
  INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
  MENSAGEM_RECUPERACAO_EMAIL,
  VALIDADE_LINK_EMAIL_MINUTOS,
} from '../constants/recuperacao-senha'


export type ResultadoSolicitacaoRecuperacao =
  | { sucesso: true; mensagem: string; canal: 'email'; aguardarSegundos: number; validadeMinutos: number }
  | { sucesso: false; mensagem: string }

/**
 * "Esqueci minha senha" por E-MAIL: link de uso único, válido por 10 min, para
 * a página `/redefinir-senha`. (Pelo celular o fluxo é outro: código por SMS,
 * em `recuperacao-senha-sms.ts`.)
 *
 * A resposta é sempre a mesma — exista a conta ou não, esteja limitada ou não —
 * e o e-mail sai DEPOIS da resposta, para o tempo não denunciar contas.
 * Preservados: só o hash no banco, invalidação dos links/códigos anteriores,
 * 1 min entre pedidos da conta e, na troca, encerramento das sessões.
 */
export async function solicitarRedefinicaoSenha(
  dados: SolicitarRedefinicaoSenhaDTO,
): Promise<ResultadoSolicitacaoRecuperacao> {
  const validacao = SolicitarRedefinicaoSenhaSchema.safeParse(dados)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0]?.message ?? 'Informe seu e-mail' }
  }
  const email = validacao.data.emailOuWhatsapp.toLowerCase()
  if (!email.includes('@')) {
    return { sucesso: false, mensagem: 'Para recuperar pelo celular, escolha a opção SMS.' }
  }

  const resposta: ResultadoSolicitacaoRecuperacao = {
    sucesso: true,
    canal: 'email',
    mensagem: MENSAGEM_RECUPERACAO_EMAIL,
    aguardarSegundos: INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
    validadeMinutos: VALIDADE_LINK_EMAIL_MINUTOS,
  }
  const ip = await ipDaRequisicao()
  const identificadorHash = hashIdentificador(`email:${email}`)

  try {
    if (await recuperacaoExcedeLimites(ip, identificadorHash)) {
      await registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'email', resultado: 'limitado', usuarioId: null })
      return resposta
    }

    const resultado = await db.transaction(async (tx) => {
      const [usuario] = await tx
        .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, status: usuarios.status })
        .from(usuarios)
        .where(sql`lower(${usuarios.email}) = ${email}`)
        .limit(1)
        .for('update')

      // Conta bloqueada nunca recebe link (resposta pública igual).
      if (!usuario || !usuario.email || usuario.status === 'bloqueado') return { estado: 'ignorado' as const, usuarioId: usuario?.id ?? null }
      if (await contaEmIntervaloDeReenvio(tx, usuario.id)) return { estado: 'limitado' as const, usuarioId: usuario.id }

      const agora = new Date()
      await invalidarRecuperacoesAbertas(tx, usuario.id, agora)
      const { token, hash } = gerarToken()
      const [tokenInserido] = await tx
        .insert(tokensUsuario)
        .values({
          usuarioId: usuario.id,
          tipo: 'recuperacao_senha',
          tokenHash: hash,
          // Mesmo relógio para criação e validade (o intervalo de reenvio compara os dois).
          createdAt: agora,
          expiraEm: new Date(agora.getTime() + VALIDADE_LINK_EMAIL_MINUTOS * 60_000),
        })
        .returning({ id: tokensUsuario.id })

      return { estado: 'enviar' as const, usuarioId: usuario.id, token, tokenId: tokenInserido.id, nome: usuario.nome, email: usuario.email }
    })

    if (resultado.estado !== 'enviar') {
      await registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'email', resultado: resultado.estado, usuarioId: resultado.usuarioId })
      return resposta
    }

    await executarAposResposta(async () => {
      const envio = await enviarEmailRedefinicaoSenha({ destinatario: resultado.email, nome: resultado.nome, token: resultado.token })
      if (!envio.sucesso) {
        // Link que não saiu não pode valer: a pessoa pede outro depois.
        await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, resultado.tokenId))
        console.error('[SOLICITAR_REDEFINICAO_SENHA] Falha no envio do e-mail', { motivo: envio.motivo })
      }
      await registrarPedidoRecuperacao({
        ip,
        identificadorHash,
        canal: 'email',
        resultado: envio.sucesso ? 'enviado' : 'falha_envio',
        usuarioId: resultado.usuarioId,
      })
    })
    return resposta
  } catch (error) {
    console.error('[SOLICITAR_REDEFINICAO_SENHA]', { tipo: error instanceof Error ? error.name : 'desconhecido' })
    return resposta
  }
}
