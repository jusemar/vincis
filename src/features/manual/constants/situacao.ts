/**
 * As quatro situações de um recurso da plataforma.
 *
 * O emoji acompanha o rótulo de propósito: a situação precisa ser reconhecida
 * de relance, inclusive por quem não enxerga bem a diferença entre as cores.
 */
export const SITUACOES = ['pronto', 'parcial', 'simulado', 'visual'] as const

export type Situacao = (typeof SITUACOES)[number]

export const SITUACAO: Record<
  Situacao,
  { emoji: string; rotulo: string; significado: string }
> = {
  pronto: {
    emoji: '🟢',
    rotulo: 'Pronto',
    significado: 'Deve funcionar normalmente.',
  },
  parcial: {
    emoji: '🟡',
    rotulo: 'Parcial',
    significado: 'Existe, mas ainda possui partes em desenvolvimento.',
  },
  simulado: {
    emoji: '🔵',
    rotulo: 'Simulado',
    significado:
      'O fluxo funciona para testes, mas não representa uma operação real, como pagamento real.',
  },
  visual: {
    emoji: '⚪',
    rotulo: 'Só visual',
    significado: 'Aparece na interface, mas ainda não possui funcionamento real.',
  },
}
