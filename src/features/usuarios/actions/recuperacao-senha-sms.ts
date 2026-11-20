'use server'

import { randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { enviarSmsCodigoRedefinicao } from '@/integracoes/sms/enviar-codigo-redefinicao-sms'
import {
  INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
  MAXIMO_TENTATIVAS_CODIGO,
  MENSAGEM_CODIGO_BLOQUEADO,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_RECUPERACAO_SMS,
  VALIDADE_AUTORIZACAO_REDEFINICAO_MINUTOS,
  VALIDADE_CODIGO_SMS_SEGUNDOS,
} from '../constants/recuperacao-senha'
import { executarAposResposta } from '../lib/apos-resposta'
import { gerarCodigoOtp, gerarToken, hashCodigoOtp } from '../lib/gerar-token'
import {
  errosDaSolicitacao,
  hashIdentificador,
  ipDaRequisicao,
  ipExcedeErrosDeCodigo,
  recuperacaoExcedeLimites,
  registrarPedidoRecuperacao,
  registrarTentativaCodigo,
} from '../lib/limite-recuperacao'
import { contaEmIntervaloDeReenvio, invalidarRecuperacoesAbertas } from '../lib/recuperacao-senha'
import { normalizarCelularBR } from '../lib/telefone'
import { condicaoTelefoneIgual } from '../lib/telefone-sql'

/**
 * Recuperação de senha pelo CELULAR: código de 6 dígitos por SMS (nunca link).
 *
 * 1. `solicitarCodigoRecuperacaoSms` — envia o código ao celular VERIFICADO da
 *    conta (número em uma única conta). Devolve sempre um `solicitacaoId`: o da
 *    solicitação real ou um aleatório quando não há conta/limite — a resposta e
 *    o tempo são os mesmos (o SMS sai depois da resposta).
 * 2. `verificarCodigoRecuperacaoSms` — confere o código. Errado, expirado, já
 *    usado ou de solicitação inexistente: a mesma mensagem e a mesma contagem de
 *    tentativas. Certo: devolve uma AUTORIZAÇÃO de uso único (10 min) ligada à
 *    conta da solicitação, que `redefinirSenha` consome — e que encerra as
 *    sessões. A conta nunca vem do navegador: sai do código validado.
 *
 * O código nunca é gravado em claro (hash ligado à solicitação), nem em log.
 * Solicitar recuperação não verifica número nenhum.
 */

const TIPO_CODIGO = 'recuperacao_senha_otp'

export type ResultadoSolicitacaoCodigo =
  | {
      sucesso: true
      canal: 'sms'
      solicitacaoId: string
      mensagem: string
      aguardarSegundos: number
      validadeSegundos: number
    }
  | { sucesso: false; mensagem: string }

export async function solicitarCodigoRecuperacaoSms(entrada: unknown): Promise<ResultadoSolicitacaoCodigo> {
  const celular = z.object({ celular: z.string().trim().min(1).max(32) }).safeParse(entrada)
  const nacional = celular.success ? normalizarCelularBR(celular.data.celular) : null
  // Formato impossível não revela nada sobre contas: pode ser dito na hora.
  if (!nacional) return { sucesso: false, mensagem: 'Informe um celular válido com DDD, ex.: (31) 99999-9999.' }

  const ip = await ipDaRequisicao()
  const identificadorHash = hashIdentificador(`sms:${nacional}`)
  const resposta = (solicitacaoId: string): ResultadoSolicitacaoCodigo => ({
    sucesso: true,
    canal: 'sms',
    solicitacaoId,
    mensagem: MENSAGEM_RECUPERACAO_SMS,
    aguardarSegundos: INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
    validadeSegundos: VALIDADE_CODIGO_SMS_SEGUNDOS,
  })
  // Para quem não tem conta (ou está limitado): indistinguível de uma real.
  const ficticia = () => resposta(randomUUID())

  try {
    if (await recuperacaoExcedeLimites(ip, identificadorHash)) {
      await registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'sms', resultado: 'limitado', usuarioId: null })
      return ficticia()
    }

    const resultado = await db.transaction(async (tx) => {
      const candidatos = await tx
        .select({ id: usuarios.id, status: usuarios.status, whatsappVerificado: usuarios.whatsappVerificado })
        .from(usuarios)
        .where(condicaoTelefoneIgual(nacional))
        .limit(2)
        .for('update')
      // Número em mais de uma conta é ambíguo: não se recupera nenhuma por ele.
      if (candidatos.length !== 1) return { estado: 'ignorado' as const, usuarioId: null }
      const usuario = candidatos[0]
      // Só número com posse já comprovada; conta bloqueada nunca recebe código.
      if (usuario.status === 'bloqueado' || !usuario.whatsappVerificado) {
        return { estado: 'ignorado' as const, usuarioId: usuario.id }
      }
      if (await contaEmIntervaloDeReenvio(tx, usuario.id)) return { estado: 'limitado' as const, usuarioId: usuario.id }

      const agora = new Date()
      await invalidarRecuperacoesAbertas(tx, usuario.id, agora)
      const solicitacaoId = randomUUID()
      const codigo = gerarCodigoOtp()
      await tx.insert(tokensUsuario).values({
        id: solicitacaoId,
        usuarioId: usuario.id,
        tipo: TIPO_CODIGO,
        tokenHash: hashCodigoOtp(solicitacaoId, codigo),
        createdAt: agora,
        expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_SMS_SEGUNDOS * 1000),
      })
      return { estado: 'enviar' as const, usuarioId: usuario.id, solicitacaoId, codigo }
    })

    if (resultado.estado !== 'enviar') {
      await registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'sms', resultado: resultado.estado, usuarioId: resultado.usuarioId })
      return ficticia()
    }

    await executarAposResposta(async () => {
      const envio = await enviarSmsCodigoRedefinicao({ celularNacional: nacional, codigo: resultado.codigo })
      if (!envio.sucesso) {
        // Código que não saiu não pode valer; a pessoa pede outro depois de 1 min.
        await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, resultado.solicitacaoId))
        console.error('[RECUPERACAO_SMS] Falha no envio', { motivo: envio.motivo })
      }
      await registrarPedidoRecuperacao({
        ip,
        identificadorHash,
        canal: 'sms',
        resultado: envio.sucesso ? 'enviado' : 'falha_envio',
        usuarioId: resultado.usuarioId,
      })
    })
    return resposta(resultado.solicitacaoId)
  } catch (erro) {
    console.error('[RECUPERACAO_SMS]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return ficticia()
  }
}

export type ResultadoVerificacaoCodigo =
  | { sucesso: true; tokenRedefinicao: string }
  | { sucesso: false; mensagem: string; bloqueado: boolean }

const VerificarSchema = z.object({
  solicitacaoId: z.string().uuid(),
  codigo: z.string().regex(/^\d{6}$/),
})

function hashesIguais(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function verificarCodigoRecuperacaoSms(entrada: unknown): Promise<ResultadoVerificacaoCodigo> {
  const validacao = VerificarSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false, mensagem: 'Digite os 6 números do código.', bloqueado: false }
  const { solicitacaoId, codigo } = validacao.data
  const ip = await ipDaRequisicao()
  const bloqueio = { sucesso: false as const, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true }

  try {
    if ((await ipExcedeErrosDeCodigo(ip)) || (await errosDaSolicitacao(solicitacaoId)) >= MAXIMO_TENTATIVAS_CODIGO) {
      return bloqueio
    }

    const resultado = await db.transaction(async (tx) => {
      // A linha travada serializa tentativas simultâneas da mesma solicitação.
      const [solicitacao] = await tx
        .select({ id: tokensUsuario.id, usuarioId: tokensUsuario.usuarioId, hash: tokensUsuario.tokenHash, expiraEm: tokensUsuario.expiraEm, usadoEm: tokensUsuario.usadoEm, status: usuarios.status })
        .from(tokensUsuario)
        .innerJoin(usuarios, eq(usuarios.id, tokensUsuario.usuarioId))
        .where(and(eq(tokensUsuario.id, solicitacaoId), eq(tokensUsuario.tipo, TIPO_CODIGO)))
        .limit(1)
        .for('update')

      const valido =
        solicitacao &&
        !solicitacao.usadoEm &&
        solicitacao.expiraEm.getTime() > Date.now() &&
        solicitacao.status !== 'bloqueado' &&
        hashesIguais(solicitacao.hash, hashCodigoOtp(solicitacaoId, codigo))

      if (!valido) return { estado: 'invalido' as const, usuarioId: solicitacao?.usuarioId ?? null, aberto: Boolean(solicitacao && !solicitacao.usadoEm) }

      // Código certo: ele e qualquer outro pedido aberto da conta deixam de valer;
      // nasce a autorização de uso único para a nova senha DESTA conta.
      const agora = new Date()
      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(and(eq(tokensUsuario.usuarioId, solicitacao.usuarioId), inArray(tokensUsuario.tipo, ['recuperacao_senha', TIPO_CODIGO]), isNull(tokensUsuario.usadoEm)))
      const { token, hash } = gerarToken()
      await tx.insert(tokensUsuario).values({
        usuarioId: solicitacao.usuarioId,
        tipo: 'recuperacao_senha',
        tokenHash: hash,
        expiraEm: new Date(agora.getTime() + VALIDADE_AUTORIZACAO_REDEFINICAO_MINUTOS * 60_000),
      })
      return { estado: 'valido' as const, usuarioId: solicitacao.usuarioId, token }
    })

    if (resultado.estado === 'valido') {
      await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: resultado.usuarioId, correto: true })
      return { sucesso: true, tokenRedefinicao: resultado.token }
    }

    await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: resultado.usuarioId, correto: false })
    const erros = await errosDaSolicitacao(solicitacaoId)
    if (erros >= MAXIMO_TENTATIVAS_CODIGO) {
      // Excesso de erros invalida o código de vez.
      if (resultado.aberto) await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, solicitacaoId))
      return bloqueio
    }
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  } catch (erro) {
    console.error('[RECUPERACAO_SMS_VERIFICAR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  }
}
