import type { EstiloCardHome } from '@/features/cms/integracao/cards-home/constantes'

/**
 * Visuais dos cards de serviço da Home — as mesmas classes que os três cards
 * fixos usavam, agora indexadas pelo estilo escolhido no CMS.
 *
 * O Gestor escolhe a chave (`destaque`, `esmeralda`, `ambar`); as classes
 * ficam aqui, no código. Assim nenhuma classe arbitrária chega ao site, e o
 * Tailwind enxerga todas as classes como texto literal.
 *
 * `posicaoBrilhoMenor`: onde fica o brilho decorativo quando o card aparece
 * pequeno (à direita). No original, só o card jurídico tinha o brilho embaixo
 * à direita; os outros, em cima à esquerda. O card destacado usa sempre a
 * mesma posição (em cima à direita).
 */
export type VisualCardServico = {
  selo: string
  brilho: string
  posicaoBrilhoMenor: string
}

export const VISUAL_CARD_SERVICO: Record<EstiloCardHome, VisualCardServico> = {
  destaque: {
    selo: 'bg-primary/20 text-primary',
    brilho: 'from-primary/20 via-primary/10 to-transparent',
    posicaoBrilhoMenor: '-top-10 -left-10',
  },
  esmeralda: {
    selo: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    brilho: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
    posicaoBrilhoMenor: '-bottom-14 -right-8',
  },
  ambar: {
    selo: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    brilho: 'from-amber-500/20 via-amber-500/10 to-transparent',
    posicaoBrilhoMenor: '-top-10 -left-10',
  },
}
