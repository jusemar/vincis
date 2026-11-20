import { createHash } from 'node:crypto'
import { and, eq, gt, sql, type SQL } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/db/connection'
import { eventosAuditoria } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'

/**
 * Limites da recuperação de senha, por IP e por identificador (e-mail ou
 * celular), contados nos próprios eventos de auditoria do pedido — cada pedido
 * fica registrado de qualquer forma, então não há tabela nova.
 *
 * O identificador nunca é gravado em claro: só o hash (SHA-256) do valor
 * normalizado. O intervalo de 1 minuto por CONTA continua na action (token mais
 * recente); estes limites seguram quem varia de conta ou de identificador.
 */

export const LIMITES_RECUPERACAO = {
  /** Pedidos para o mesmo e-mail/celular (existindo ou não). */
  porIdentificador: [
    { janelaMinutos: 15, maximo: 3 },
    { janelaMinutos: 24 * 60, maximo: 8 },
  ],
  /** Pedidos do mesmo IP (CGNAT: margem maior). */
  porIp: [
    { janelaMinutos: 15, maximo: 10 },
    { janelaMinutos: 24 * 60, maximo: 40 },
  ],
} as const

export type CanalRecuperacao = 'email' | 'sms'

/**
 * Os mesmos limites servem à recuperação de senha e ao cadastro por celular;
 * cada fluxo conta só os próprios eventos.
 */
export type FluxoCodigo = 'recuperacao' | 'cadastro' | 'verificacao'
const ACOES = {
  recuperacao: {
    pedido: ACOES_AUDITORIA.recuperacaoSenhaSolicitada,
    erro: ACOES_AUDITORIA.recuperacaoSenhaCodigoIncorreto,
    acerto: ACOES_AUDITORIA.recuperacaoSenhaCodigoValidado,
  },
  cadastro: {
    pedido: ACOES_AUDITORIA.cadastroCelularSolicitado,
    erro: ACOES_AUDITORIA.cadastroCelularCodigoIncorreto,
    acerto: ACOES_AUDITORIA.cadastroCelularCodigoValidado,
  },
  verificacao: {
    pedido: ACOES_AUDITORIA.verificacaoCelularSolicitada,
    erro: ACOES_AUDITORIA.verificacaoCelularCodigoIncorreto,
    acerto: ACOES_AUDITORIA.celularVerificadoPorSms,
  },
} as const
export type ResultadoPedidoRecuperacao = 'enviado' | 'ignorado' | 'limitado' | 'falha_envio' | 'invalido' | 'ja_cadastrado'

export function hashIdentificador(identificadorNormalizado: string): string {
  return createHash('sha256').update(`recuperacao:${identificadorNormalizado}`).digest('hex')
}

export async function ipDaRequisicao(): Promise<string | null> {
  try {
    const cabecalhos = await headers()
    const ip = cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() || cabecalhos.get('x-real-ip')?.trim()
    return ip ? ip.slice(0, 45) : null
  } catch {
    return null // fora de uma requisição (testes, scripts)
  }
}

async function contar(desde: Date, condicao: SQL, fluxo: FluxoCodigo) {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(eventosAuditoria)
    .where(and(eq(eventosAuditoria.acao, ACOES[fluxo].pedido), gt(eventosAuditoria.createdAt, desde), condicao))
  return linha?.total ?? 0
}

/** `true` quando este pedido ultrapassaria algum limite (IP ou identificador). */
export async function recuperacaoExcedeLimites(
  ip: string | null,
  identificadorHash: string,
  fluxo: FluxoCodigo = 'recuperacao',
): Promise<boolean> {
  const agora = Date.now()
  for (const { janelaMinutos, maximo } of LIMITES_RECUPERACAO.porIdentificador) {
    const desde = new Date(agora - janelaMinutos * 60_000)
    if ((await contar(desde, sql`${eventosAuditoria.metadados}->>'identificadorHash' = ${identificadorHash}`, fluxo)) >= maximo) return true
  }
  if (ip) {
    for (const { janelaMinutos, maximo } of LIMITES_RECUPERACAO.porIp) {
      const desde = new Date(agora - janelaMinutos * 60_000)
      if ((await contar(desde, sql`${eventosAuditoria.ip} = ${ip}`, fluxo)) >= maximo) return true
    }
  }
  return false
}

/** Registra o pedido (sempre, inclusive recusado): auditoria + base dos limites. */
export async function registrarPedidoRecuperacao(dados: {
  ip: string | null
  identificadorHash: string
  canal: CanalRecuperacao
  resultado: ResultadoPedidoRecuperacao
  usuarioId: string | null
  fluxo?: FluxoCodigo
}) {
  try {
    await registrarEventoAuditoria({
      acao: ACOES[dados.fluxo ?? 'recuperacao'].pedido,
      entidade: 'usuarios',
      registroAfetado: dados.usuarioId,
      usuarioId: dados.usuarioId,
      origem: 'sistema',
      ip: dados.ip,
      metadados: { canal: dados.canal, resultado: dados.resultado, identificadorHash: dados.identificadorHash },
    })
  } catch (erro) {
    console.error('[RECUPERACAO_SENHA] Falha ao registrar auditoria', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
  }
}

/** Erros de código por IP (adivinhação espalhada por várias solicitações). */
export const LIMITE_ERROS_CODIGO_POR_IP = { janelaMinutos: 15, maximo: 30 } as const

/** Erros já cometidos nesta solicitação (exista ela ou não — a resposta é a mesma). */
export async function errosDaSolicitacao(solicitacaoId: string, fluxo: FluxoCodigo = 'recuperacao'): Promise<number> {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(eventosAuditoria)
    .where(
      and(
        eq(eventosAuditoria.acao, ACOES[fluxo].erro),
        eq(eventosAuditoria.registroAfetado, solicitacaoId),
      ),
    )
  return linha?.total ?? 0
}

export async function ipExcedeErrosDeCodigo(ip: string | null, fluxo: FluxoCodigo = 'recuperacao'): Promise<boolean> {
  if (!ip) return false
  const desde = new Date(Date.now() - LIMITE_ERROS_CODIGO_POR_IP.janelaMinutos * 60_000)
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(eventosAuditoria)
    .where(
      and(
        eq(eventosAuditoria.acao, ACOES[fluxo].erro),
        eq(eventosAuditoria.ip, ip),
        gt(eventosAuditoria.createdAt, desde),
      ),
    )
  return (linha?.total ?? 0) >= LIMITE_ERROS_CODIGO_POR_IP.maximo
}

/** Registra a tentativa de código (o código em si nunca é gravado). */
export async function registrarTentativaCodigo(dados: {
  solicitacaoId: string
  ip: string | null
  usuarioId: string | null
  correto: boolean
  fluxo?: FluxoCodigo
}) {
  const fluxo = dados.fluxo ?? 'recuperacao'
  try {
    await registrarEventoAuditoria({
      acao: dados.correto ? ACOES[fluxo].acerto : ACOES[fluxo].erro,
      entidade: fluxo === 'cadastro' ? 'cadastros_celular' : fluxo === 'verificacao' ? 'usuarios' : 'tokens_usuario',
      registroAfetado: dados.solicitacaoId,
      usuarioId: dados.usuarioId,
      origem: 'sistema',
      ip: dados.ip,
      metadados: { canal: 'sms' },
    })
  } catch (erro) {
    console.error('[RECUPERACAO_SENHA] Falha ao registrar tentativa de código', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
  }
}
