import { responderWebhookPixEfi } from '@/features/pagamentos/lib/responder-webhook-efi'

/** Ver `../route.ts`: mesma entrada, com o `/pix` que a Efí acrescenta. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return responderWebhookPixEfi(request)
}
