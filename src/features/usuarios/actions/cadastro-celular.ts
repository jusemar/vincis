'use server'

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db/connection'
import { cadastrosCelular, eventosAuditoria, perfis, usuarios, usuariosPerfis } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import { associarIndicacaoAoCadastro } from '@/features/parceiros/lib/associar-cadastro'
import { enviarSmsCelularJaCadastrado, enviarSmsCodigoCadastro } from '@/integracoes/sms/mensagens-cadastro-sms'
import {
  INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
  MAXIMO_TENTATIVAS_CODIGO,
  MENSAGEM_CODIGO_BLOQUEADO,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_RECUPERACAO_SMS,
  VALIDADE_CODIGO_SMS_SEGUNDOS,
} from '../constants/recuperacao-senha'
import { executarAposResposta } from '../lib/apos-resposta'
import { gerarCodigoOtp, hashCodigoCadastro, hashSegredo } from '../lib/gerar-token'
import { gerarHash } from '../lib/hash-senha'
import {
  errosDaSolicitacao,
  hashIdentificador,
  ipDaRequisicao,
  ipExcedeErrosDeCodigo,
  recuperacaoExcedeLimites,
  registrarPedidoRecuperacao,
  registrarTentativaCodigo,
} from '../lib/limite-recuperacao'
import { normalizarCelularBR } from '../lib/telefone'
import { condicaoTelefoneIgual } from '../lib/telefone-sql'
import { nomeSchema, senhaSchema } from '../schemas/base'

/**
 * Cadastro com CELULAR (sem e-mail).
 *
 * 1. `solicitarCodigoCadastroSms` — código de 6 dígitos por SMS. Se o número
 *    já tem conta, o SMS avisa isso ao DONO do número (nada de código) e a tela
 *    recebe exatamente a mesma resposta: ela nunca revela quem tem conta.
 * 2. `verificarCodigoCadastroSms` — código certo devolve uma autorização de uso
 *    único (15 min) para concluir. Mesma resposta para código errado, expirado,
 *    usado ou solicitação inexistente; 5 erros invalidam.
 * 3. `concluirCadastroPorCelular` — com a autorização, cria a conta: e-mail
 *    NULO (nunca inventado), celular verificado pelo próprio código, ativa.
 *
 * Código e autorização só existem como hash; nada sensível vai para log.
 */

const VALIDADE_AUTORIZACAO_MINUTOS = 15
const FLUXO = 'cadastro' as const

export type ResultadoSolicitacaoCadastro =
  | { sucesso: true; solicitacaoId: string; mensagem: string; aguardarSegundos: number; validadeSegundos: number }
  | { sucesso: false; mensagem: string }

/** Houve pedido de cadastro para este número no último minuto? (evita SMS duplicado) */
async function pedidoRecente(identificadorHash: string): Promise<boolean> {
  const desde = new Date(Date.now() - INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS * 1000)
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(eventosAuditoria)
    .where(
      and(
        eq(eventosAuditoria.acao, ACOES_AUDITORIA.cadastroCelularSolicitado),
        gt(eventosAuditoria.createdAt, desde),
        sql`${eventosAuditoria.metadados}->>'identificadorHash' = ${identificadorHash}`,
        sql`${eventosAuditoria.metadados}->>'resultado' in ('enviado', 'ja_cadastrado')`,
      ),
    )
  return (linha?.total ?? 0) > 0
}

export async function solicitarCodigoCadastroSms(entrada: unknown): Promise<ResultadoSolicitacaoCadastro> {
  const dados = z.object({ celular: z.string().trim().min(1).max(32) }).safeParse(entrada)
  const nacional = dados.success ? normalizarCelularBR(dados.data.celular) : null
  if (!nacional) return { sucesso: false, mensagem: 'Informe um celular válido com DDD, ex.: (31) 99999-9999.' }

  const ip = await ipDaRequisicao()
  const identificadorHash = hashIdentificador(`cadastro:${nacional}`)
  const resposta = (solicitacaoId: string): ResultadoSolicitacaoCadastro => ({
    sucesso: true,
    solicitacaoId,
    mensagem: MENSAGEM_RECUPERACAO_SMS,
    aguardarSegundos: INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
    validadeSegundos: VALIDADE_CODIGO_SMS_SEGUNDOS,
  })
  const registrar = (resultado: 'enviado' | 'limitado' | 'falha_envio' | 'ja_cadastrado') =>
    registrarPedidoRecuperacao({ ip, identificadorHash, canal: 'sms', resultado, usuarioId: null, fluxo: FLUXO })

  try {
    if ((await recuperacaoExcedeLimites(ip, identificadorHash, FLUXO)) || (await pedidoRecente(identificadorHash))) {
      await registrar('limitado')
      return resposta(randomUUID())
    }

    const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(condicaoTelefoneIgual(nacional)).limit(1)
    if (existente) {
      // Só o dono do número fica sabendo, pelo próprio SMS; a tela não muda.
      await executarAposResposta(async () => {
        const envio = await enviarSmsCelularJaCadastrado({ celularNacional: nacional })
        if (!envio.sucesso) console.error('[CADASTRO_CELULAR] Falha no aviso de número já cadastrado', { motivo: envio.motivo })
        await registrar(envio.sucesso ? 'ja_cadastrado' : 'falha_envio')
      })
      return resposta(randomUUID())
    }

    const solicitacaoId = randomUUID()
    const codigo = gerarCodigoOtp()
    const agora = new Date()
    await db.transaction(async (tx) => {
      // Só o pedido mais recente deste número vale.
      await tx
        .update(cadastrosCelular)
        .set({ invalidadoEm: agora })
        .where(and(eq(cadastrosCelular.celular, nacional), isNull(cadastrosCelular.concluidoEm), isNull(cadastrosCelular.invalidadoEm)))
      await tx.insert(cadastrosCelular).values({
        id: solicitacaoId,
        celular: nacional,
        codigoHash: hashCodigoCadastro(solicitacaoId, codigo),
        createdAt: agora,
        expiraEm: new Date(agora.getTime() + VALIDADE_CODIGO_SMS_SEGUNDOS * 1000),
      })
    })

    await executarAposResposta(async () => {
      const envio = await enviarSmsCodigoCadastro({ celularNacional: nacional, codigo })
      if (!envio.sucesso) {
        await db.update(cadastrosCelular).set({ invalidadoEm: new Date() }).where(eq(cadastrosCelular.id, solicitacaoId))
        console.error('[CADASTRO_CELULAR] Falha no envio do código', { motivo: envio.motivo })
      }
      await registrar(envio.sucesso ? 'enviado' : 'falha_envio')
    })
    return resposta(solicitacaoId)
  } catch (erro) {
    console.error('[CADASTRO_CELULAR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return resposta(randomUUID())
  }
}

export type ResultadoVerificacaoCadastro =
  | { sucesso: true; tokenCadastro: string }
  | { sucesso: false; mensagem: string; bloqueado: boolean }

function hashesIguais(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function verificarCodigoCadastroSms(entrada: unknown): Promise<ResultadoVerificacaoCadastro> {
  const dados = z.object({ solicitacaoId: z.string().uuid(), codigo: z.string().regex(/^\d{6}$/) }).safeParse(entrada)
  if (!dados.success) return { sucesso: false, mensagem: 'Digite os 6 números do código.', bloqueado: false }
  const { solicitacaoId, codigo } = dados.data
  const ip = await ipDaRequisicao()
  const bloqueio = { sucesso: false as const, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true }

  try {
    if ((await ipExcedeErrosDeCodigo(ip, FLUXO)) || (await errosDaSolicitacao(solicitacaoId, FLUXO)) >= MAXIMO_TENTATIVAS_CODIGO) {
      return bloqueio
    }

    const resultado = await db.transaction(async (tx) => {
      const [pedido] = await tx.select().from(cadastrosCelular).where(eq(cadastrosCelular.id, solicitacaoId)).limit(1).for('update')
      const valido =
        pedido &&
        !pedido.invalidadoEm &&
        !pedido.concluidoEm &&
        !pedido.verificadoEm &&
        pedido.expiraEm.getTime() > Date.now() &&
        hashesIguais(pedido.codigoHash, hashCodigoCadastro(solicitacaoId, codigo))
      if (!pedido || !valido) return { estado: 'invalido' as const, aberto: Boolean(pedido && !pedido.invalidadoEm && !pedido.concluidoEm) }

      const token = randomBytes(32).toString('hex')
      const agora = new Date()
      await tx
        .update(cadastrosCelular)
        .set({
          verificadoEm: agora,
          autorizacaoHash: hashSegredo(token),
          autorizacaoExpiraEm: new Date(agora.getTime() + VALIDADE_AUTORIZACAO_MINUTOS * 60_000),
        })
        .where(eq(cadastrosCelular.id, solicitacaoId))
      return { estado: 'valido' as const, token }
    })

    if (resultado.estado === 'valido') {
      await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: null, correto: true, fluxo: FLUXO })
      return { sucesso: true, tokenCadastro: resultado.token }
    }
    await registrarTentativaCodigo({ solicitacaoId, ip, usuarioId: null, correto: false, fluxo: FLUXO })
    if ((await errosDaSolicitacao(solicitacaoId, FLUXO)) >= MAXIMO_TENTATIVAS_CODIGO) {
      if (resultado.aberto) await db.update(cadastrosCelular).set({ invalidadoEm: new Date() }).where(eq(cadastrosCelular.id, solicitacaoId))
      return bloqueio
    }
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  } catch (erro) {
    console.error('[CADASTRO_CELULAR_VERIFICAR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false }
  }
}

const ConcluirSchema = z.object({
  tokenCadastro: z.string().regex(/^[0-9a-f]{64}$/),
  nome: nomeSchema,
  senha: senhaSchema,
  perfilTipo: z.enum(['cliente', 'profissional', 'colaborador']),
})

export type ResultadoConclusaoCadastro = { sucesso: true; celular: string } | { sucesso: false; mensagem: string; recomecar?: boolean }

export async function concluirCadastroPorCelular(entrada: unknown): Promise<ResultadoConclusaoCadastro> {
  const dados = ConcluirSchema.safeParse(entrada)
  if (!dados.success) {
    const campo = dados.error.issues[0]
    return { sucesso: false, mensagem: campo?.path[0] === 'tokenCadastro' ? 'Autorização inválida. Recomece o cadastro.' : (campo?.message ?? 'Revise os dados.') }
  }
  const { tokenCadastro, nome, senha, perfilTipo } = dados.data
  const senhaHash = await gerarHash(senha)

  try {
    const resultado = await db.transaction(async (tx) => {
      const [pedido] = await tx
        .select()
        .from(cadastrosCelular)
        .where(eq(cadastrosCelular.autorizacaoHash, hashSegredo(tokenCadastro)))
        .limit(1)
        .for('update')
      if (!pedido || !pedido.verificadoEm || pedido.concluidoEm || pedido.invalidadoEm || !pedido.autorizacaoExpiraEm || pedido.autorizacaoExpiraEm.getTime() <= Date.now()) {
        return { erro: 'Autorização expirada. Recomece o cadastro pelo celular.', recomecar: true } as const
      }

      // A posse do número foi provada; mesmo assim ele não pode estar em outra conta.
      const [emUso] = await tx.select({ id: usuarios.id }).from(usuarios).where(condicaoTelefoneIgual(pedido.celular)).limit(1)
      if (emUso) {
        await tx.update(cadastrosCelular).set({ invalidadoEm: new Date() }).where(eq(cadastrosCelular.id, pedido.id))
        return { erro: 'Este celular já tem uma conta. Entre com sua senha ou use "Esqueci minha senha".', recomecar: true } as const
      }

      const [perfil] = await tx.select({ id: perfis.id }).from(perfis).where(eq(perfis.nome, perfilTipo)).limit(1)
      if (!perfil) return { erro: 'Tipo de conta indisponível.', recomecar: false } as const

      const agora = new Date()
      const [conta] = await tx
        .insert(usuarios)
        .values({
          nome,
          email: null,
          whatsapp: pedido.celular,
          whatsappVerificado: true,
          whatsappVerificadoEm: agora,
          senhaHash,
          status: 'ativo',
          emailVerificado: false,
        })
        .returning({ id: usuarios.id })
      await tx.insert(usuariosPerfis).values({ usuarioId: conta.id, perfilId: perfil.id })
      await tx.update(cadastrosCelular).set({ concluidoEm: agora }).where(eq(cadastrosCelular.id, pedido.id))
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.contaCriadaPorCelular,
          entidade: 'usuarios',
          registroAfetado: conta.id,
          usuarioId: conta.id,
          autorId: conta.id,
          origem: 'sistema',
          ip: await ipDaRequisicao(),
          metadados: { perfilTipo, canal: 'sms' },
        },
        tx,
      )
      return { usuarioId: conta.id, celular: pedido.celular } as const
    })

    if (resultado.erro !== undefined) return { sucesso: false, mensagem: resultado.erro, recomecar: resultado.recomecar }

    // Indicação de parceiro, igual ao cadastro por e-mail (nunca derruba o cadastro).
    let visitanteToken: string | undefined
    try {
      visitanteToken = (await cookies()).get(COOKIE_INDICACAO)?.value
    } catch {
      visitanteToken = undefined
    }
    await associarIndicacaoAoCadastro({ usuarioId: resultado.usuarioId, visitanteToken })
    return { sucesso: true, celular: resultado.celular }
  } catch (erro) {
    // Corrida rara: o mesmo número gravado por outro cadastro no mesmo instante.
    const duplicado = typeof erro === 'object' && erro !== null && 'code' in erro && (erro as { code?: string }).code === '23505'
    console.error('[CADASTRO_CELULAR_CONCLUIR]', { tipo: erro instanceof Error ? erro.name : 'desconhecido', duplicado })
    return duplicado
      ? { sucesso: false, mensagem: 'Este celular já tem uma conta. Entre com sua senha.', recomecar: true }
      : { sucesso: false, mensagem: 'Não foi possível concluir o cadastro. Tente novamente.' }
  }
}
