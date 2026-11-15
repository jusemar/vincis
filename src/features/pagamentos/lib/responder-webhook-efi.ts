import { NextResponse } from 'next/server'
import { lerAvisosDePix, tokenWebhookValido } from '@/integracoes/efi/webhook'
import { processarAvisosDePix } from './webhook-efi'

/**
 * A resposta HTTP do webhook Pix da Efí.
 *
 * - Token inválido ou ausente → 401, sem ler o corpo.
 * - Corpo sem Pix (o teste que a Efí faz ao cadastrar o webhook) → 200.
 * - Falha inesperada → 500, para a Efí reenviar depois. A confirmação é
 *   idempotente, então o reenvio nunca duplica nada.
 *
 * O log leva contadores, nunca o corpo, o token ou dados do pagador.
 */
export async function responderWebhookPixEfi(request: Request) {
  const url = new URL(request.url)
  const token = request.headers.get('x-efi-webhook-token') ?? url.searchParams.get('token')

  if (!process.env.EFI_WEBHOOK_TOKEN?.trim()) {
    console.error('[WEBHOOK_EFI] variável ausente', { variavel: 'EFI_WEBHOOK_TOKEN' })
    return NextResponse.json({ erro: 'Webhook não configurado.' }, { status: 503 })
  }
  if (!tokenWebhookValido(token)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const corpo = await request.json().catch(() => null)
  const avisos = lerAvisosDePix(corpo)
  if (!avisos.length) return NextResponse.json({ recebido: true })

  try {
    const resumo = await processarAvisosDePix(avisos)
    console.info('[WEBHOOK_EFI]', resumo)
    return NextResponse.json({ recebido: true })
  } catch (erro) {
    console.error('[WEBHOOK_EFI]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
}
