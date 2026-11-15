import { chamarApiPixEfi, ErroEfi } from './cliente'
import { obterConfiguracaoEfi } from './configuracao'

/**
 * Cadastro do webhook Pix na Efí (`GET`/`PUT /v2/webhook/:chave`).
 *
 * A chave é sempre a `EFI_PIX_KEY` do servidor — nunca vem de quem chama —, e
 * só aparece no caminho da requisição (o log do transporte a mascara).
 *
 * ## `x-skip-mtls-checking: true`
 *
 * A Efí, por padrão, exige que o servidor do webhook valide o certificado
 * dela (mTLS de entrada). A Vercel não termina mTLS de cliente, então o
 * cadastro vai com o cabeçalho de dispensa documentado pela Efí. Em troca, a
 * Vincis valida por conta própria: token secreto na URL, comparado em tempo
 * constante, e — o principal — nenhum aviso confirma pagamento: a cobrança é
 * sempre consultada na API autenticada (mTLS de saída) antes de qualquer efeito.
 */

export type WebhookPixCadastrado = {
  webhookUrl: string
  criacao: string | null
}

type RespostaWebhook = { webhookUrl?: string; chave?: string; criacao?: string }

function caminhoDoWebhook(): string {
  return `/v2/webhook/${encodeURIComponent(obterConfiguracaoEfi().pixKey)}`
}

const MENSAGEM_SEM_WEBHOOK = 'nenhum webhook encontrado para a chave informada'

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A Efí disse "esta chave não tem webhook"?
 *
 * Na produção ela responde **HTTP 400** com "Nenhum webhook encontrado para a
 * chave informada", e não 404. Só o 400 com essa mensagem conta como ausência: qualquer outro 400 (chave inválida, requisição mal
 * formada) continua sendo erro — tratá-lo como "não cadastrado" ofereceria um
 * cadastro às cegas. O 404 segue aceito por segurança.
 */
export function webhookNaoEncontrado(erro: unknown): boolean {
  if (!(erro instanceof ErroEfi)) return false
  if (erro.status === 404) return true
  if (erro.status !== 400) return false
  return normalizar(erro.message) === MENSAGEM_SEM_WEBHOOK
}

/** O webhook cadastrado para a chave da Vincis, ou `null` se não houver. */
export async function consultarWebhookPix(): Promise<WebhookPixCadastrado | null> {
  try {
    const resposta = await chamarApiPixEfi<RespostaWebhook>('GET', caminhoDoWebhook())
    if (!resposta?.webhookUrl) return null
    return { webhookUrl: resposta.webhookUrl, criacao: resposta.criacao ?? null }
  } catch (erro) {
    if (webhookNaoEncontrado(erro)) return null
    throw erro
  }
}

/**
 * Cadastra o webhook. A Efí testa a URL na hora (envia um aviso sem Pix e
 * espera 2xx); se a URL não responder, o `PUT` falha e nada é cadastrado.
 */
export async function cadastrarWebhookPix(webhookUrl: string): Promise<void> {
  await chamarApiPixEfi<RespostaWebhook>('PUT', caminhoDoWebhook(), { webhookUrl }, {
    'x-skip-mtls-checking': 'true',
  })
}
