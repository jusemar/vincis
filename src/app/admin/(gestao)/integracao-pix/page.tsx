import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { WebhookEfiPainel } from '@/features/pagamentos/components/admin/WebhookEfiPainel'
import { consultarSituacaoWebhookEfi } from '@/features/pagamentos/lib/webhook-efi-cadastro'

/**
 * Integração Pix (Efí) — somente Gestor da Vincis.
 *
 * Abrir a tela consulta o webhook na Efí (só leitura). Cadastrar é uma action
 * que repete a guarda do Gestor.
 */
export const dynamic = 'force-dynamic'

export default async function IntegracaoPixRoute() {
  await exigirGestorDaPlataforma()
  const situacao = await consultarSituacaoWebhookEfi()
  return <WebhookEfiPainel situacao={situacao} consultadoEm={new Date().toISOString()} />
}
