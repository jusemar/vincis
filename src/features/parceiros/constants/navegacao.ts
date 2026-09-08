/**
 * Seções do módulo Parceiros.
 *
 * Lista única e plana: ela alimenta o submenu do menu lateral da Área do
 * Cliente, a gaveta do celular e o resolvedor de conteúdo. Um registro só é o
 * que impede um item de existir no menu e não ter tela — ou o contrário.
 *
 * O módulo é puro de propósito (sem React e sem ícones) porque quem o consome
 * vai do servidor ao componente de menu. Quem desenha escolhe o ícone pelo id.
 *
 * Cada seção é uma rota de verdade (`/cliente/parceiros/<id>`), servida pela
 * página dinâmica do módulo. O id é o próprio slug — um lugar só define o menu,
 * o endereço e o conteúdo.
 */

export type SecaoParceiro = {
  /** Valor de `?secao=`. Também identifica o ícone no desenho. */
  id: string
  rotulo: string
}

export const SECOES_PARCEIRO: readonly SecaoParceiro[] = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'meu-link', rotulo: 'Meu link' },
  { id: 'cupons', rotulo: 'Cupons' },
  { id: 'leads', rotulo: 'Leads' },
  { id: 'materiais', rotulo: 'Materiais' },
  { id: 'clientes-indicados', rotulo: 'Clientes indicados' },
  { id: 'comissoes', rotulo: 'Comissões' },
  { id: 'niveis', rotulo: 'Níveis e benefícios' },
  { id: 'campanhas', rotulo: 'Campanhas' },
  { id: 'ranking', rotulo: 'Ranking' },
  { id: 'comunidade', rotulo: 'Comunidade' },
  { id: 'academia', rotulo: 'Academia' },
  { id: 'configuracoes', rotulo: 'Configurações' },
]

export const SECAO_PADRAO = 'dashboard'

/** Seção pedida na URL, ou o Dashboard quando o valor não existe. */
export function secaoValida(valor: string | null | undefined): string {
  return SECOES_PARCEIRO.some((secao) => secao.id === valor)
    ? (valor as string)
    : SECAO_PADRAO
}

export function rotuloDaSecao(id: string): string {
  return SECOES_PARCEIRO.find((secao) => secao.id === id)?.rotulo ?? 'Parceiros'
}

/** Raiz do módulo dentro da Área do Cliente. Também é o Dashboard. */
export const ROTA_PARCEIROS = '/cliente/parceiros'

/** Endereço de uma seção. O Dashboard é a própria raiz, sem sufixo. */
export function rotaDaSecao(id: string): string {
  return id === SECAO_PADRAO ? ROTA_PARCEIROS : `${ROTA_PARCEIROS}/${id}`
}

/**
 * Seção correspondente a um caminho.
 *
 * A raiz é o Dashboard; qualquer outro segmento é validado contra o registro —
 * um slug desconhecido devolve `null` para que a página responda 404 em vez de
 * renderizar o Dashboard num endereço que não existe.
 */
export function secaoDaRota(caminho: string): string | null {
  if (caminho === ROTA_PARCEIROS) return SECAO_PADRAO
  if (!caminho.startsWith(`${ROTA_PARCEIROS}/`)) return null

  const slug = caminho.slice(ROTA_PARCEIROS.length + 1).split('/')[0]
  return SECOES_PARCEIRO.some((secao) => secao.id === slug) ? slug : null
}
