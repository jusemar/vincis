import {
  CATEGORIAS_OPORTUNIDADE,
  CATEGORIA_OPORTUNIDADE,
  categoriaValida,
} from '@/features/oportunidades/constants/oportunidade'

/**
 * Os serviços que podem ter prazo próprio de indicação.
 *
 * Hoje são as categorias da oportunidade, porque é esse o vocabulário que a
 * atribuição registra — a oportunidade não aponta para um dos quatro planos de
 * `precificacao_servicos`, e escolher um deles na hora de congelar o prazo
 * seria inventar um mapeamento que o produto não tem.
 *
 * Quando contratação direta e consultoria entrarem, elas sabem qual serviço foi
 * contratado, e os códigos de `precificacao_servicos` passam a ser referências
 * válidas aqui — o vocabulário cresce sem a tabela mudar de forma.
 */
export const REFERENCIAS_PRAZO = CATEGORIAS_OPORTUNIDADE

/**
 * A referência de prazo equivalente a uma categoria do catálogo de serviços.
 *
 * O catálogo e a oportunidade nomeiam a mesma área de formas diferentes
 * (`contabil` e `contabilidade`, `juridico` e `advocacia`). A tradução mora
 * aqui, e não em `servicos`, porque quem precisa das duas falando a mesma
 * língua é o programa de parceiros: é neste vocabulário que a Gestão configura
 * os prazos, e uma contratação gravada como `contabil` nunca encontraria o
 * prazo que o Gestor definiu para Contabilidade.
 *
 * `consultoria` não tem equivalente e vira nulo — a atribuição nasce com o
 * prazo padrão, que é o comportamento correto para uma área que a tela de
 * prazos ainda não oferece. Inventar uma referência para ela criaria uma
 * configuração que o Gestor não consegue ver nem alterar.
 */
export function referenciaDePrazoDaCategoria(
  categoria: string | null | undefined,
): string | null {
  if (categoria === 'contabil') return 'contabilidade'
  if (categoria === 'juridico') return 'advocacia'
  return categoriaValida(categoria ?? '') ? categoria! : null
}

/** Limites do prazo. Um dia é o mínimo: zero não significa "sem janela". */
export const PRAZO_MINIMO_DIAS = 1
export const PRAZO_MAXIMO_DIAS = 3650

/** O texto é uma referência de serviço conhecida? Barra escrita inválida. */
export function referenciaDePrazoValida(valor: string): boolean {
  return categoriaValida(valor)
}

/** Como a referência aparece na tela do Gestor e do parceiro. */
export function rotuloDaReferencia(valor: string): string {
  return categoriaValida(valor) ? CATEGORIA_OPORTUNIDADE[valor].rotulo : valor
}

/** De onde veio o prazo aplicado a um registro. */
export type OrigemDoPrazo = 'servico' | 'padrao' | 'embutido'

export type PrazoVigente = {
  dias: number
  origem: OrigemDoPrazo
}

/** Fim da janela a partir do início e do prazo congelado. */
export function calcularExpiracao(inicio: Date, dias: number): Date {
  const fim = new Date(inicio)
  fim.setUTCDate(fim.getUTCDate() + dias)
  return fim
}

/**
 * Dias que faltam, arredondados para cima. Zero quando já venceu.
 *
 * Para cima porque "falta meio dia" é, para quem lê, "falta um dia" — e porque
 * arredondar para baixo faria a última hora da janela aparecer como zero,
 * indistinguível de expirada.
 */
export function diasRestantes(expiraEm: Date, agora: Date = new Date()): number {
  const ms = expiraEm.getTime() - agora.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
}

export type SituacaoDaAtribuicao = 'ativa' | 'expirada' | 'sem_prazo'

/**
 * A situação de uma atribuição.
 *
 * Note o que **não** está aqui: `substituida`. Substituição é do ciclo — o
 * navegador passou a pertencer a outro parceiro —, e não do negócio. A
 * atribuição da Contabilidade de Carlos continua sendo de João mesmo depois de
 * Maria aparecer; é isso que a regra "a atribuição pertence ao negócio, não ao
 * cliente" significa na prática. O ciclo mostra a substituição; a atribuição
 * mostra a validade dela.
 */
export function situacaoDaAtribuicao(
  expiraEm: Date | null,
  agora: Date = new Date(),
): SituacaoDaAtribuicao {
  if (!expiraEm) return 'sem_prazo'
  return expiraEm.getTime() > agora.getTime() ? 'ativa' : 'expirada'
}

export const ROTULO_SITUACAO: Record<SituacaoDaAtribuicao, string> = {
  ativa: 'Indicação válida',
  expirada: 'Prazo encerrado',
  sem_prazo: 'Sem prazo registrado',
}
