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

/** O webhook cadastrado para a chave da Vincis, ou `null` se não houver. */
export async function consultarWebhookPix(): Promise<WebhookPixCadastrado | null> {
  try {
    const resposta = await chamarApiPixEfi<RespostaWebhook>('GET', caminhoDoWebhook())
    if (!resposta?.webhookUrl) return null
    return { webhookUrl: resposta.webhookUrl, criacao: resposta.criacao ?? null }
  } catch (erro) {
    // A Efí responde 404 quando a chave não tem webhook.
    if (erro instanceof ErroEfi && erro.status === 404) return null
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
