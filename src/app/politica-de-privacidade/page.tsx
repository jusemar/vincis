import type { Metadata } from 'next'
import { PoliticaDePrivacidade } from '@/features/institucional/components/PoliticaDePrivacidade'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Vincis',
  description:
    'Como a Vincis trata dados pessoais: dados coletados, finalidades, compartilhamento, pagamentos pela Efí, cookies e direitos previstos na LGPD.',
}

export default function PoliticaDePrivacidadeRoute() {
  return <PoliticaDePrivacidade />
}
