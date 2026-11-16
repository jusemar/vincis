import type { Metadata } from 'next'
import { PaginaContato } from '@/features/institucional/components/PaginaContato'

export const metadata: Metadata = {
  title: 'Fale com a Vincis | Contato',
  description:
    'Fale com a Vincis por e-mail ou WhatsApp para tirar dúvidas sobre cadastro, contratação, pagamento ou atendimento.',
}

export default function ContatoRoute() {
  return <PaginaContato />
}
