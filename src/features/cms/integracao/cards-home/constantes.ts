import {
  ROTA_BUSCA_CONTABILIDADE,
  ROTA_BUSCA_JURIDICA,
  ROTA_SERVICOS_AVULSOS,
  ROTAS_INSTITUCIONAIS,
} from '@/features/institucional/constants/rotas'

/**
 * Listas fechadas dos Cards da Home (seção de serviços da página inicial).
 *
 * Ficam na integração, e não no núcleo, porque são da Vincis: os estilos são os
 * três visuais que a Home já tinha e as rotas são endereços reais deste site.
 * A tabela `cms_cards_home` repete as listas de estilo e de tipo de destino num
 * `check`: o banco recusa o que a validação deixasse passar por engano.
 */

/**
 * Estilos visuais permitidos. Cada chave aponta para um conjunto de classes
 * fixo no código (`features/home/constants/cards-servicos.ts`) — o Gestor
 * escolhe um nome, nunca escreve CSS.
 */
export const ESTILOS_CARD_HOME = ['destaque', 'esmeralda', 'ambar'] as const
export type EstiloCardHome = (typeof ESTILOS_CARD_HOME)[number]

export const ROTULO_ESTILO_CARD_HOME: Record<EstiloCardHome, string> = {
  destaque: 'Cor da marca',
  esmeralda: 'Verde',
  ambar: 'Âmbar',
}

/** Card original que usava cada estilo — referência para quem escolhe. */
export const EXEMPLO_ESTILO_CARD_HOME: Record<EstiloCardHome, string> = {
  destaque: 'Contabilidade 100% digital',
  esmeralda: 'Assessoria legal',
  ambar: 'Abra sua empresa em dias',
}

/** Para onde o card leva: uma página do CMS ou uma rota do sistema. */
export const TIPOS_DESTINO_CARD_HOME = ['pagina', 'rota'] as const
export type TipoDestinoCardHome = (typeof TIPOS_DESTINO_CARD_HOME)[number]

/**
 * Rotas internas que um card pode usar. Todas existem em `src/app` e são
 * públicas; as de busca usam os filtros que a própria página de profissionais
 * lê (`features/profissionais/constants/busca-url.ts`).
 *
 * Lista fechada de propósito: um endereço livre permitiria link externo,
 * `javascript:` ou rota inexistente. Rota nova entra aqui, com o rótulo.
 */
export const ROTAS_INTERNAS_CARD_HOME = [
  { rota: ROTA_BUSCA_CONTABILIDADE, rotulo: 'Busca de profissionais — Contabilidade' },
  { rota: ROTA_BUSCA_JURIDICA, rotulo: 'Busca de profissionais — Assistência jurídica' },
  { rota: ROTA_SERVICOS_AVULSOS, rotulo: 'Serviços avulsos — pedido de orçamento' },
  { rota: '/profissionais', rotulo: 'Busca de profissionais — todas as áreas' },
  { rota: '/precos', rotulo: 'Planos e preços' },
  { rota: '/como-funciona', rotulo: 'Como funciona' },
  { rota: '/parceiros', rotulo: 'Programa de Parceiros' },
  { rota: ROTAS_INSTITUCIONAIS.contato, rotulo: 'Contato' },
  { rota: ROTAS_INSTITUCIONAIS.centralDeAjuda, rotulo: 'Central de Ajuda' },
] as const

export type RotaInternaCardHome = (typeof ROTAS_INTERNAS_CARD_HOME)[number]['rota']

const ROTAS_PERMITIDAS: ReadonlySet<string> = new Set(
  ROTAS_INTERNAS_CARD_HOME.map(({ rota }) => rota),
)

export function rotaInternaPermitida(rota: string): rota is RotaInternaCardHome {
  return ROTAS_PERMITIDAS.has(rota)
}

export function rotuloRotaInterna(rota: string) {
  return ROTAS_INTERNAS_CARD_HOME.find((item) => item.rota === rota)?.rotulo ?? null
}

export const LIMITES_CARD_HOME = {
  selo: 40,
  titulo: 80,
  /** O título aceita quebra de linha (o visual original usa duas linhas). */
  linhasTitulo: 3,
  descricao: 240,
  textoBotao: 40,
  rota: 120,
  /** Teto de cards não excluídos: a seção é vitrine, e a Gestão lista todos de uma vez. */
  quantidade: 50,
} as const
