/**
 * As áreas da Área do Cliente, e onde cada uma mora.
 *
 * Registro único: o menu lateral, a navegação do celular, o título do
 * cabeçalho e o redirecionamento das URLs antigas leem daqui. É o mesmo desenho
 * que a área administrativa usa em `features/admin/constants/recursos` — e pela
 * mesma razão: quando o menu e a rota são escritos em dois lugares, um item
 * some de um e continua no outro.
 *
 * ## Rotas de verdade, não abas
 *
 * Cada área é uma página do App Router (`/cliente`, `/cliente/orcamentos`, …).
 * Antes tudo vivia em `/cliente?aba=`, o que fazia cinco páginas
 * compartilharem uma só entrada, um só carregamento de dados e um só endereço
 * canônico. Query continua existindo para o que de fato é parâmetro de uma
 * página — `?filtro=`, `?pagar=`, `?atendimento=` —, nunca para escolher a
 * página.
 *
 * O módulo é puro (sem React, sem `next/*`) porque tanto o servidor quanto os
 * componentes de `use client` decidem com ele.
 */

export type AreaCliente = {
  id: string
  rotulo: string
  rota: string
  /**
   * Só agrupa filhos; não é destino.
   *
   * Vale para Parceiros: clicar nele abre e fecha a lista de seções, e quem
   * navega são elas. Um agrupador que também navega faria a seta e o rótulo
   * disputarem o mesmo clique.
   */
  agrupador?: boolean
}

export const ROTA_CLIENTE = '/cliente'
export const ROTA_PARCEIROS = '/cliente/parceiros'

export const AREAS_CLIENTE: readonly AreaCliente[] = [
  { id: 'visao', rotulo: 'Visão geral', rota: ROTA_CLIENTE },
  { id: 'orcamentos', rotulo: 'Orçamentos', rota: '/cliente/orcamentos' },
  { id: 'atendimentos', rotulo: 'Atendimentos', rota: '/cliente/atendimentos' },
  { id: 'parceiros', rotulo: 'Parceiros', rota: ROTA_PARCEIROS, agrupador: true },
  { id: 'conta', rotulo: 'Minha conta', rota: '/cliente/conta' },
]

/** O caminho está dentro do Programa de Parceiros? */
export function ehRotaDeParceiros(caminho: string): boolean {
  return caminho === ROTA_PARCEIROS || caminho.startsWith(`${ROTA_PARCEIROS}/`)
}

/**
 * Área a que um caminho pertence.
 *
 * Compara pela rota e pelos filhos dela, nunca por `startsWith` cru: sem isso
 * uma futura `/cliente/orcamentos-antigos` herdaria a marcação de outra área
 * por acidente. A Visão geral é a raiz e por isso exige igualdade exata.
 */
export function areaDaRota(caminho: string): AreaCliente | undefined {
  return AREAS_CLIENTE.find(({ rota }) =>
    rota === ROTA_CLIENTE
      ? caminho === ROTA_CLIENTE
      : caminho === rota || caminho.startsWith(`${rota}/`),
  )
}

/**
 * Equivalência das URLs antigas (`/cliente?aba=…`).
 *
 * Existe só para redirecionar links já compartilhados; nenhuma tela monta
 * endereço assim. A fonte de verdade é a rota.
 */
export const ROTA_DA_ABA_LEGADA: Record<string, string> = {
  visao: ROTA_CLIENTE,
  orcamentos: '/cliente/orcamentos',
  atendimentos: '/cliente/atendimentos',
  parceiros: ROTA_PARCEIROS,
  conta: '/cliente/conta',
}
