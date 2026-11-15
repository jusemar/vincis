import https from 'node:https'
import { obterConfiguracaoEfi, type ConfiguracaoEfi } from './configuracao'

/**
 * Transporte da API Pix da Efí: mTLS, OAuth, timeout, retry e log.
 *
 * ## O que foi herdado do Nooo, e o que mudou
 *
 * Herdado: `https.request` com o `.p12` no agente (a Efí exige mTLS em toda
 * chamada, inclusive no token) e o token `client_credentials` por Basic Auth.
 *
 * Acrescentado, porque toda integração da Vincis precisa (AGENTS.md):
 * - **timeout** por requisição — sem ele uma Efí lenta segura a Server Action
 *   até o limite da função;
 * - **retry** só para falha de rede e 5xx, e só em método idempotente. O `PUT
 *   /v2/cob/{txid}` é idempotente pelo txid, então repetir nunca cria segunda
 *   cobrança;
 * - **cache do token** até perto de vencer, em vez de um OAuth por chamada;
 * - **log estruturado** com método, caminho, status e duração — nunca corpo,
 *   cabeçalho, token, segredo ou certificado.
 */

export type MetodoEfi = 'GET' | 'PUT' | 'POST' | 'PATCH'

const TIMEOUT_MS = 15_000
const TENTATIVAS = 3

/** Falha conversando com a Efí. `status` ausente = rede/timeout. */
export class ErroEfi extends Error {
  readonly status?: number
  readonly transitorio: boolean
  constructor(mensagem: string, status?: number) {
    super(mensagem)
    this.name = 'ErroEfi'
    this.status = status
    this.transitorio = status === undefined || status >= 500 || status === 429
  }
}

/** A mensagem que a Efí devolve, quando ela devolve uma legível. */
function mensagemDaEfi(dados: unknown): string {
  if (dados && typeof dados === 'object') {
    for (const campo of ['mensagem', 'message', 'error_description', 'nome']) {
      const valor = (dados as Record<string, unknown>)[campo]
      if (typeof valor === 'string' && valor.trim()) return valor.slice(0, 200)
    }
  }
  return 'Não foi possível comunicar com a Efí.'
}

let agenteEmCache: { chave: string; agente: https.Agent } | null = null

/** Um agente por certificado — reaproveita conexões TLS entre chamadas. */
function agenteDe(configuracao: ConfiguracaoEfi): https.Agent {
  const chave = `${configuracao.baseUrl}|${configuracao.clientId}`
  if (agenteEmCache?.chave !== chave) {
    agenteEmCache = {
      chave,
      agente: new https.Agent({
        pfx: configuracao.certificado,
        passphrase: configuracao.senhaCertificado,
        keepAlive: true,
      }),
    }
  }
  return agenteEmCache.agente
}

function requisicaoUnica<T>(
  configuracao: ConfiguracaoEfi,
  metodo: MetodoEfi,
  caminho: string,
  autorizacao: string,
  corpo?: unknown,
  cabecalhos: Record<string, string> = {},
): Promise<T> {
  const url = new URL(caminho, configuracao.baseUrl)
  const payload = corpo === undefined ? undefined : JSON.stringify(corpo)

  return new Promise<T>((resolve, reject) => {
    const requisicao = https.request(
      url,
      {
        method: metodo,
        agent: agenteDe(configuracao),
        timeout: TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          'Content-Type': 'application/json',
          ...cabecalhos,
          Authorization: autorizacao,
        },
      },
      (resposta) => {
        const partes: Buffer[] = []
        resposta.on('data', (parte) => partes.push(Buffer.from(parte)))
        resposta.on('end', () => {
          const bruto = Buffer.concat(partes).toString('utf8')
          let dados: unknown = null
          try {
            dados = bruto ? JSON.parse(bruto) : null
          } catch {
            dados = null
          }
          const status = resposta.statusCode ?? 0
          if (status < 200 || status >= 300) {
            reject(new ErroEfi(mensagemDaEfi(dados), status))
            return
          }
          resolve(dados as T)
        })
      },
    )
    requisicao.on('timeout', () => {
      requisicao.destroy(new ErroEfi('Tempo esgotado aguardando a Efí.'))
    })
    requisicao.on('error', (erro) => {
      reject(erro instanceof ErroEfi ? erro : new ErroEfi('Falha de rede com a Efí.'))
    })
    if (payload) requisicao.write(payload)
    requisicao.end()
  })
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Retry com espera crescente — só para o que é transitório e idempotente. */
async function comRetry<T>(
  metodo: MetodoEfi,
  caminho: string,
  executar: () => Promise<T>,
): Promise<T> {
  const idempotente = metodo !== 'POST' || caminho === '/oauth/token'
  let ultimo: unknown
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const inicio = Date.now()
    try {
      const resultado = await executar()
      console.info('[EFI]', { metodo, caminho: rotuloDoCaminho(caminho), ok: true, ms: Date.now() - inicio })
      return resultado
    } catch (erro) {
      ultimo = erro
      const efi = erro instanceof ErroEfi ? erro : null
      console.warn('[EFI]', {
        metodo,
        caminho: rotuloDoCaminho(caminho),
        ok: false,
        status: efi?.status ?? null,
        tentativa,
        ms: Date.now() - inicio,
      })
      if (!idempotente || !efi?.transitorio || tentativa === TENTATIVAS) break
      await esperar(300 * 2 ** (tentativa - 1))
    }
  }
  throw ultimo
}

/**
 * O caminho no log sem o txid inteiro (rastreável, mas não um índice de
 * cobranças) e **sem a chave Pix**: `/v2/webhook/{chave}` vira `/v2/webhook/…`.
 */
export function rotuloDoCaminho(caminho: string) {
  if (caminho.startsWith('/v2/webhook/')) return '/v2/webhook/…'
  return caminho.replace(/\/([A-Za-z0-9]{26,35})(?=\/|$)/, (_, txid: string) => `/${txid.slice(0, 6)}…`)
}

type TokenEfi = { access_token: string; expires_in: number }

let tokenEmCache: { chave: string; valor: string; venceEm: number } | null = null

async function obterToken(configuracao: ConfiguracaoEfi): Promise<string> {
  const chave = `${configuracao.baseUrl}|${configuracao.clientId}`
  if (tokenEmCache?.chave === chave && tokenEmCache.venceEm > Date.now()) {
    return tokenEmCache.valor
  }
  const basic = Buffer.from(`${configuracao.clientId}:${configuracao.clientSecret}`).toString('base64')
  const token = await comRetry('POST', '/oauth/token', () =>
    requisicaoUnica<TokenEfi>(configuracao, 'POST', '/oauth/token', `Basic ${basic}`, {
      grant_type: 'client_credentials',
    }),
  )
  // Um minuto de folga: um token que vence no meio da chamada é erro à toa.
  const validadeMs = Math.max(0, (token.expires_in - 60) * 1000)
  tokenEmCache = { chave, valor: token.access_token, venceEm: Date.now() + validadeMs }
  return token.access_token
}

/**
 * Chamada autenticada à API Pix.
 *
 * `cabecalhos` existe para o que a Efí pede fora do padrão — hoje só o
 * `x-skip-mtls-checking` do cadastro do webhook. Não substitui `Authorization`.
 */
export async function chamarApiPixEfi<T>(
  metodo: MetodoEfi,
  caminho: string,
  corpo?: unknown,
  cabecalhos?: Record<string, string>,
): Promise<T> {
  const configuracao = obterConfiguracaoEfi()
  const executar = async () => {
    const token = await obterToken(configuracao)
    return comRetry(metodo, caminho, () =>
      requisicaoUnica<T>(configuracao, metodo, caminho, `Bearer ${token}`, corpo, cabecalhos),
    )
  }
  try {
    return await executar()
  } catch (erro) {
    // Token revogado ou vencido antes do previsto: um novo, uma vez só.
    if (!(erro instanceof ErroEfi) || erro.status !== 401) throw erro
    tokenEmCache = null
    return executar()
  }
}
