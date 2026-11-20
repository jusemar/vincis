/**
 * Comtele — envio de SMS (API do Painel Novo: `POST /messages/sms/send`,
 * cabeçalho `x-api-key`). Mesmo contrato da integração do Jaaa.
 *
 * - Número no formato 55 + DDD + número, só dígitos.
 * - A ROTA é o id da rota contratada na conta (`GET /routes`): vem da
 *   configuração, nunca do código.
 * - Só é entrega aceita com a confirmação explícita do provedor
 *   (`hasError: false`); 200 sem ela não conta.
 * - Timeout curto (8 s) e **sem nova tentativa automática**: repetir um envio
 *   que talvez tenha saído geraria SMS duplicado e custo dobrado. Quem chama
 *   trata a falha (o link é invalidado e a pessoa pode pedir outro).
 * - Nada sensível vai para log ou para o resultado: nem a chave, nem o texto
 *   (que contém o link), nem o telefone.
 */

export type MotivoFalhaSms =
  | 'configuracao'
  | 'telefone_invalido'
  | 'mensagem_longa'
  | 'tempo_esgotado'
  | 'rede'
  | 'http'
  | 'recusado'
  | 'resposta_invalida'

export type ResultadoEnvioSms = { sucesso: true } | { sucesso: false; motivo: MotivoFalhaSms; status?: number }

export type ConfiguracaoComtele = {
  chaveApi: string
  rota: number
  urlBase?: string
  buscar?: typeof fetch
  timeoutMs?: number
}

const URL_PADRAO = 'https://api.comtele.com.br'
const TIMEOUT_PADRAO_MS = 8_000
const ETIQUETA = 'vincis-recuperacao'
/** Acima disto a Comtele cobra mais de um crédito e algumas operadoras entregam em partes. */
export const TAMANHO_MAXIMO_SMS = 160

/** Configuração lida do ambiente do servidor; `null` quando incompleta. */
export function configuracaoComteleDoAmbiente(): ConfiguracaoComtele | null {
  const chaveApi = process.env.COMTELE_API_KEY?.trim()
  const rota = Number(process.env.COMTELE_ROTA)
  if (!chaveApi || !Number.isInteger(rota) || rota <= 0) return null
  return { chaveApi, rota }
}

export async function enviarSmsComtele(
  destinatario: string,
  mensagem: string,
  configuracao: ConfiguracaoComtele | null = configuracaoComteleDoAmbiente(),
): Promise<ResultadoEnvioSms> {
  if (!configuracao) {
    console.error('[SMS_COMTELE] Configuração ausente (COMTELE_API_KEY / COMTELE_ROTA).')
    return { sucesso: false, motivo: 'configuracao' }
  }
  if (!/^55\d{10,11}$/.test(destinatario)) return { sucesso: false, motivo: 'telefone_invalido' }
  if (mensagem.length > TAMANHO_MAXIMO_SMS) return { sucesso: false, motivo: 'mensagem_longa' }

  const { chaveApi, rota, urlBase = URL_PADRAO, buscar = fetch, timeoutMs = TIMEOUT_PADRAO_MS } = configuracao
  const controle = new AbortController()
  const expirar = setTimeout(() => controle.abort(), timeoutMs)
  let resposta: Response
  try {
    resposta = await buscar(`${urlBase.replace(/\/+$/, '')}/messages/sms/send`, {
      method: 'POST',
      headers: { 'x-api-key': chaveApi, 'content-type': 'application/json' },
      body: JSON.stringify({
        receivers: [destinatario],
        contactGroups: [],
        message: mensagem,
        route: rota,
        tag: ETIQUETA,
        custom: ETIQUETA,
        scheduleDate: null,
      }),
      signal: controle.signal,
    })
  } catch {
    // O erro original não é repassado: pode carregar a requisição inteira.
    const motivo = controle.signal.aborted ? 'tempo_esgotado' : 'rede'
    console.error('[SMS_COMTELE] Falha de comunicação', { motivo })
    return { sucesso: false, motivo }
  } finally {
    clearTimeout(expirar)
  }

  const corpo: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    console.error('[SMS_COMTELE] Provedor recusou a requisição', { status: resposta.status })
    return { sucesso: false, motivo: 'http', status: resposta.status }
  }
  if (typeof corpo !== 'object' || corpo === null || !('hasError' in corpo) || typeof corpo.hasError !== 'boolean') {
    console.error('[SMS_COMTELE] Resposta sem confirmação de envio', { status: resposta.status })
    return { sucesso: false, motivo: 'resposta_invalida', status: resposta.status }
  }
  if (corpo.hasError) {
    console.error('[SMS_COMTELE] Envio recusado pelo provedor', { status: resposta.status })
    return { sucesso: false, motivo: 'recusado', status: resposta.status }
  }
  return { sucesso: true }
}
