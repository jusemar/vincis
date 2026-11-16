import type { Metadata } from 'next'
import { TermosDeUso } from '@/features/institucional/components/TermosDeUso'

export const metadata: Metadata = {
  title: 'Termos de Uso | Vincis',
  description:
    'Regras de uso da Vincis: cadastro, contratação de profissionais contábeis e jurídicos, pagamentos por Pix, atendimentos, cancelamentos e uso responsável.',
}

export default function TermosDeUsoRoute() {
  return <TermosDeUso />
}
