import type { Metadata } from 'next'
import { PaginaContato } from '@/features/institucional/components/PaginaContato'

export const metadata: Metadata = {
  title: 'Fale com a Vincis | Contato',
  description:
    'Fale com a Vincis pelo Jaaa para tirar dúvidas sobre cadastro, contratação, pagamento ou atendimento.',
}

export default function ContatoRoute() {
  return <PaginaContato />
}
