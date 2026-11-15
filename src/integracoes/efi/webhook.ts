import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * Entrada do webhook Pix da Efí.
 *
 * ## Autenticação
 *
 * O padrão do Nooo: a URL cadastrada na Efí carrega um segredo
 * (`?token=…`, ou o cabeçalho `x-efi-webhook-token`) comparado com
 * `EFI_WEBHOOK_TOKEN`. A comparação aqui é em tempo constante.
 *
 * ## O payload não confirma nada
 *
 * Mesmo com token válido, o corpo é tratado só como **aviso**: a Vincis pega o
 * txid e pergunta à Efí, pela API autenticada com mTLS, se aquela cobrança foi
 * paga e por quanto. Um webhook forjado — ou um token vazado — no máximo faz a
 * Vincis consultar uma cobrança que a própria Efí dirá não estar paga.
 */

export function tokenWebhookValido(
  recebido: string | null,
  configurado: string | undefined = process.env.EFI_WEBHOOK_TOKEN,
): boolean {
  const esperado = configurado?.trim()
  if (!esperado || !recebido) return false
  const a = Buffer.from(esperado)
  const b = Buffer.from(recebido)
  return a.length === b.length && timingSafeEqual(a, b)
}

const PixDoWebhookSchema = z.object({
  endToEndId: z.string().trim().min(1).max(64),
  txid: z.string().trim().regex(/^[A-Za-z0-9]{26,35}$/),
  valor: z.string().optional(),
  horario: z.string().optional(),
})

const PayloadSchema = z.object({ pix: z.array(z.unknown()).max(100).optional() })

export type AvisoDePix = z.infer<typeof PixDoWebhookSchema>

/** Os avisos bem formados do corpo. Item malformado é descartado, não derruba o lote. */
export function lerAvisosDePix(corpo: unknown): AvisoDePix[] {
  const payload = PayloadSchema.safeParse(corpo)
  if (!payload.success || !payload.data.pix) return []
  return payload.data.pix.flatMap((item) => {
    const aviso = PixDoWebhookSchema.safeParse(item)
    return aviso.success ? [aviso.data] : []
  })
}
