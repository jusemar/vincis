import { responderWebhookPixEfi } from '@/features/pagamentos/lib/responder-webhook-efi'

/**
 * Webhook Pix da Efí.
 *
 * A Efí acrescenta `/pix` à URL cadastrada (a menos que se use `?ignorar=`),
 * por isso esta rota e `./pix` respondem igual. Toda a lógica — token,
 * consulta autenticada, idempotência — mora no domínio de pagamentos.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return responderWebhookPixEfi(request)
}
