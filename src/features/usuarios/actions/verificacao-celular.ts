'use server'

import { randomUUID, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { enviarSmsCodigoVerificacao } from '@/integracoes/sms/mensagens-cadastro-sms'
import {
  INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
  MAXIMO_TENTATIVAS_CODIGO,
  MENSAGEM_CODIGO_BLOQUEADO,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_RECUPERACAO_SMS,
  VALIDADE_CODIGO_SMS_SEGUNDOS,
} from '../constants/recuperacao-senha'
import { executarAposResposta } from '../lib/apos-resposta'
import { gerarCodigoOtp, hashCodigoVerificacao } from '../lib/gerar-token'
import {
  errosDaSolicitacao,
  hashIdentificador,
  ipDaRequisicao,
  ipExcedeErrosDeCodigo,
  recuperacaoExcedeLimites,
  registrarPedidoRecuperacao,
  registrarTentativaCodigo,
} from '../lib/limite-recuperacao'
import { obterSessaoServidor } from '../lib/sessao-servidor'
import { formatarCelularDigitado, mascararCelular, normalizarCelularBR } from '../lib/telefone'
import { condicaoTelefoneIgual } from '../lib/telefone-sql'

/**
 * Verificação do celular pelo PRÓPRIO usuário, na área logada.
 *
 * - Exige sessão. O número nunca vem da tela: é o celular já gravado na conta
 *   da sessão — não dá para verificar número de outra conta nem trocar a
 *   propriedade de um número por aqui (trocar o número é em "Meus dados", e
 *   isso derruba a verificação).
 * - Código de 6 dígitos por SMS (Comtele), 5 min, reenvio após 60 s, 5 erros
 *   invalidam. O hash do código inclui o número: se a conta trocar de número
 *   no meio do caminho, o código deixa de valer.
 * - Número que aparece em mais de uma conta (cadastros antigos com máscaras
 *   diferentes) não é verificado: a Vincis resolve a duplicidade antes.
 */

const TIPO = 'verificacao_celular'
const FLUXO = 'verificacao' as const

export type EstadoCelularConta = { celular: string | null; celularMascarado: string | null; verificado: boolean }

async function contaDaSessao() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return null
  const [conta] = await db
    .select({ id: usuarios.id, whatsapp: usuarios.whatsapp, verificado: usuarios.whatsappVerificado, status: usuarios.status })
    .from(usuarios)
    .where(eq(usuarios.id, sessao.id))
    .limit(1)
  return conta ?? null
}

/** Estado do celular da conta logada (para a tela "Minha conta"). */
export async function obterCelularDaConta(): Promise<EstadoCelularConta | null> {
  const conta = await contaDaSessao()
  if (!conta) return null
  const nacional = conta.whatsapp ? normalizarCelularBR(conta.whatsapp) : null
  return {
    celular: nacional ? formatarCelularDigitado(nacional) : conta.whatsapp,
    celularMascarado: nacional ? mascararCelular(nacional) : null,
    verificado: conta.verificado,
  }
}

export type ResultadoPedidoVerificacao =
  | { sucesso: true; solicitacaoId: string; mensagem: string; aguardarSegundos: number; validadeSegundos: number }
  | { sucesso: false; mensagem: string }

export async function solicitarCodigoVerificacaoCelular(): Promise<ResultadoPedidoVerificacao> {
  const conta = await contaDaSessao()
  if (!conta) return { sucesso: false, mensagem: 'Sessão expirada. Entre novamente.' }
  if (conta.status === 'bloqueado') return { sucesso: false, mensagem: 'Não foi possível verificar este celular.' }
  if (conta.verificado) return { sucesso: false, mensagem: 'Seu celular já está verificado.' }
  const nacional = conta.whatsapp ? normalizarCelularBR(conta.whatsapp) : null
  if (!nacional) return { sucesso: false, mensagem: 'Cadastre um celular válido em "Meus dados" antes de verificar.' }

  const ip = await ipDaRequisicao()
  const identificadorHash = hashIdentificador(`verificacao:${nacional}`)
  const registrar = (resultado: 'enviado' | 'limitado' | 'falha_envio') =>
    registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'sms', resultado, usuarioId: conta.id, fluxo: FLUXO })

  try {
    // O mesmo número em outra conta: não verifica (nem revela qual é a outra).
    const [outra] = await db.select({ id: usuarios.id }).from(usuarios).where(and(condicaoTelefoneIgual(nacional), ne(usuarios.id, conta.id))).limit(1)
    if (outra) return { sucesso: false, mensagem: 'Este número não pode ser verificado nesta conta. Fale com a Vincis.' }

    if (await recuperacaoExcedeLimites(ip, identificadorHash, FLUXO)) {
      await registrar('limitado')
      return { sucesso: false, mensagem: 'Muitos pedidos de código. Tente novamente mais tarde.' }
    }

    const agora = new Date()
    const solicitacaoId = randomUUID()
    const codigo = gerarCodigoOtp()
    const criado = await db.transaction(async (tx) => {
      const [recente] = await tx
        .select({ createdAt: tokensUsuario.createdAt })
        .from(tokensUsuario)
        .where(and(eq(tokensUsuario.usuarioId, conta.id), eq(tokensUsuario.tipo, TIPO)))
        .orderBy(desc(tokensUsuario.createdAt))
        .limit(1)
        .for('update')
      if (recente && agora.getTime() - recente.createdAt.getTime() < INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS * 1000) return false
      // Só o código mais recente vale.
      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(and(eq(tokensUsuario.usuarioId, conta.id), eq(tokensUsuario.tipo, TIPO), isNull(tokensUsuario.usadoEm)))
      await tx.insert(tokensUsuario).values({
        id: solicitacaoId,
        usuarioId: conta.id,
        tipo: TIPO,
        tokenHash: hashCodigoVerificacao(solicitacaoId, nacional, codigo),
        createdAt: agora,
        expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_SMS_SEGUNDOS * 1000),
      })
      return true
    })
    if (!criado) return { sucesso: false, mensagem: 'Aguarde 1 minuto antes de pedir outro código.' }

    await executarAposResposta(async () => {
      const envio = await enviarSmsCodigoVerificacao({ celularNacional: nacional, codigo })
      if (!envio.sucesso) {
        await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, solicitacaoId))
        console.error('[VERIFICACAO_CELULAR] Falha no envio', { motivo: envio.motivo })
      }
      await registrar(envio.sucesso ? 'enviado' : 'falha_envio')
    })
    return {
      sucesso: true,
      solicitacaoId,
      mensagem: MENSAGEM_RECUPERACAO_SMS,
      aguardarSegundos: INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
      validadeSegundos: VALIDADE_CODIGO_SMS_SEGUNDOS,
    }
  } catch (erro) {
    console.error('[VERIFICACAO_CELULAR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, mensagem: 'Não foi possível enviar o código. Tente novamente.' }
  }
}

export type ResultadoConfirmacaoCelular = { sucesso: true; mensagem: string } | { sucesso: false; mensagem: string; bloqueado: boolean }

function hashesIguais(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function confirmarCodigoVerificacaoCelular(entrada: unknown): Promise<ResultadoConfirmacaoCelular> {
  const dados = z.object({ solicitacaoId: z.string().uuid(), codigo: z.string().regex(/^\d{6}$/) }).safeParse(entrada)
  if (!dados.success) return { sucesso: false, mensagem: 'Digite os 6 números do código.', bloqueado: false }
  const conta = await contaDaSessao()
  if (!conta) return { sucesso: false, mensagem: 'Sessão expirada. Entre novamente.', bloqueado: false }
  const { solicitacaoId, codigo } = dados.data
  const ip = await ipDaRequisicao()
  const bloqueio = { sucesso: false as const, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true }

  try {
    if ((await ipExcedeErrosDeCodigo(ip, FLUXO)) || (await errosDaSolicitacao(solicitacaoId, FLUXO)) >= MAXIMO_TENTATIVAS_CODIGO) return bloqueio

    const resultado = await db.transaction(async (tx) => {
      const [pedido] = await tx
        .select()
        .from(tokensUsuario)
        // Só a solicitação DESTA conta: a de outra conta é tratada como inexistente.
        .where(and(eq(tokensUsuario.id, solicitacaoId), eq(tokensUsuario.tipo, TIPO), eq(tokensUsuario.usuarioId, conta.id)))
        .limit(1)
        .for('update')
      const [atual] = await tx
        .select({ whatsapp: usuarios.whatsapp, verificado: usuarios.whatsappVerificado })
        .from(usuarios)
        .where(eq(usuarios.id, conta.id))
        .limit(1)
        .for('update')
      const nacional = atual?.whatsapp ? normalizarCelularBR(atual.whatsapp) : null
      const valido =
        pedido &&
        nacional &&
        !pedido.usadoEm &&
        pedido.expiraEm.getTime() > Date.now() &&
        hashesIguais(pedido.tokenHash, hashCodigoVerificacao(solicitacaoId, nacional, codigo))
      if (!pedido || !nacional || !valido) return { estado: 'invalido' as const, aberto: Boolean(pedido && !pedido.usadoEm) }

      // A posse foi provada agora; mesmo assim o número não pode estar em outra conta.
      const [outra] = await tx.select({ id: usuarios.id }).from(usuarios).where(and(condicaoTelefoneIgual(nacional), ne(usuarios.id, conta.id))).limit(1)
      if (outra) return { estado: 'duplicado' as const }

      const agora = new Date()
      await tx.update(tokensUsuario).set({ usadoEm: agora }).where(eq(tokensUsuario.id, pedido.id))
      await tx
        .update(usuarios)
        .set({
          // Mesmo número, só no formato padrão (DDD + número).
          whatsapp: nacional,
          whatsappVerificado: true,
          whatsappVerificadoEm: agora,
          whatsappVerificadoPorId: null, // pelo próprio usuário, não pela Gestão
          updatedAt: agora,
        })
        .where(eq(usuarios.id, conta.id))
      return { estado: 'valido' as const }
    })

    if (resultado.estado === 'valido') {
      await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: conta.id, correto: true, fluxo: FLUXO })
      revalidatePath('/cliente')
      return { sucesso: true, mensagem: 'Celular verificado. Agora ele também serve para recuperar sua senha por SMS.' }
    }
    if (resultado.estado === 'duplicado') return { sucesso: false, mensagem: 'Este número não pode ser verificado nesta conta. Fale com a Vincis.', bloqueado: true }

    await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: conta.id, correto: false, fluxo: FLUXO })
    if ((await errosDaSolicitacao(solicitacaoId, FLUXO)) >= MAXIMO_TENTATIVAS_CODIGO) {
      if (resultado.aberto) await db.update(tokensUsuario).set({ usadoEm: new Date() }).where(eq(tokensUsuario.id, solicitacaoId))
      return bloqueio
    }
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  } catch (erro) {
    console.error('[VERIFICACAO_CELULAR_CONFIRMAR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  }
}

