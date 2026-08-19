import type { FiltersState, Protocol, Status } from '../types/atendimentos'

/**
 * Critérios que a tela aplica sobre a lista única de Atendimentos.
 *
 * É um objeto só porque quadro, lista e contadores precisam enxergar
 * exatamente o mesmo recorte: quem filtra é esta função, e os três leem o
 * resultado dela.
 */
export type CriteriosDoQuadro = {
  busca: string
  somenteMeus: boolean
  /** Sessão atual, para o filtro "Meus". */
  usuarioId?: string
  altaPrioridade: boolean
  vencendoHoje: boolean
  filtros: FiltersState
}

/** Rótulo que o cálculo de prazo usa para o vencimento de hoje. */
const VENCE_HOJE = 'Vence hoje'

/** Sem acento e em minúsculas: "Jurídico" e "juridico" são a mesma busca. */
function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * A busca procura em três campos, e só neles: nome do Cliente, número do
 * protocolo e código do Cliente (`CLI-XXXXXXXX`).
 *
 * Título e descrição ficam de fora de propósito — quem procura "Marina" quer os
 * atendimentos da Marina, não todo texto que por acaso cite o nome dela. Os três
 * campos são comparados separadamente: procurar por código nunca traz um
 * resultado que casou pelo nome.
 */
export function protocoloAtendeBusca(protocolo: Protocol, termo: string) {
  const alvo = normalizar(termo)
  if (!alvo) return true

  const nome = normalizar(protocolo.client)
  // O `#` é decoração: `#2026-0003` e `2026-0003` são a mesma procura.
  const numero = normalizar(protocolo.number).replace('#', '')
  const codigo = normalizar(protocolo.clientCode ?? '')

  return (
    nome.includes(alvo) ||
    numero.includes(alvo.replace('#', '')) ||
    (codigo.length > 0 && codigo.includes(alvo))
  )
}

/**
 * Recorte visível do quadro.
 *
 * Busca, "Meus", chips de atalho e painel de filtros são aplicados aqui, numa
 * passagem só. Kanban, Lista e contadores consomem o retorno — é isso que
 * garante que os números do topo digam respeito aos cards que estão na tela.
 */
export function filtrarProtocolos(
  protocolos: Protocol[],
  criterios: CriteriosDoQuadro,
): Protocol[] {
  const { busca, somenteMeus, usuarioId, altaPrioridade, vencendoHoje, filtros } =
    criterios

  return protocolos.filter((protocolo) => {
    if (!protocoloAtendeBusca(protocolo, busca)) return false
    // "u1" é a Ana Lima dos mocks; `usuarioId` é a pessoa de verdade logada. Os
    // dois convivem enquanto a tela mistura mock e real.
    if (
      somenteMeus &&
      !protocolo.assignees.some((a) => a.id === 'u1' || a.id === usuarioId)
    ) {
      return false
    }
    if (altaPrioridade && protocolo.priority !== 'alta') return false
    if (vencendoHoje && protocolo.deadlineLabel !== VENCE_HOJE) return false
    if (filtros.status.length && !filtros.status.includes(protocolo.status)) {
      return false
    }
    if (
      filtros.priority.length &&
      !filtros.priority.includes(protocolo.priority)
    ) {
      return false
    }
    if (
      filtros.category.length &&
      !filtros.category.includes(protocolo.category)
    ) {
      return false
    }
    if (filtros.access.length && !filtros.access.includes(protocolo.access)) {
      return false
    }
    if (
      filtros.deadline.length &&
      !filtros.deadline.includes(protocolo.deadline)
    ) {
      return false
    }
    if (
      filtros.assignee.length &&
      !protocolo.assignees.some((a) => filtros.assignee.includes(a.id))
    ) {
      return false
    }
    return true
  })
}

/**
 * Indicadores do topo, calculados sobre a lista já filtrada.
 *
 * `andamento` e `aguardandoCliente` são contados separadamente porque são
 * estados diferentes: num, a equipe está trabalhando; no outro, o Atendimento
 * parou esperando o Cliente. Somar os dois esconderia justamente a fila que
 * precisa de cobrança.
 */
export function contarIndicadores(protocolos: Protocol[]) {
  const porStatus = (status: Status) =>
    protocolos.filter((protocolo) => protocolo.status === status).length

  return {
    total: protocolos.length,
    novos: porStatus('novo'),
    andamento: porStatus('andamento'),
    aguardandoCliente: porStatus('aguardando-cliente'),
    concluidos: porStatus('concluido'),
  }
}

/**
 * Quantos cards cada página mostra.
 *
 * A Lista é uma tabela e comporta dez linhas sem rolar demais. A coluna do
 * quadro é estreita e alta: seis cards já preenchem a altura visível, e o resto
 * vem no "Ver mais" — assim uma coluna com cem Atendimentos não desenha cem
 * cards de uma vez.
 */
export const TAMANHO_PAGINA_LISTA = 10
export const TAMANHO_PAGINA_COLUNA = 6

/**
 * Recorte de uma página.
 *
 * Recebe a lista **já filtrada** e devolve só a fatia visível. Os indicadores
 * do topo continuam lendo a lista inteira: paginar é sobre quanto se desenha de
 * uma vez, não sobre quantos Atendimentos existem.
 */
export function paginar<T>(itens: T[], pagina: number, tamanho: number) {
  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho))
  const atual = Math.min(Math.max(1, pagina), totalPaginas)
  const inicio = (atual - 1) * tamanho
  return {
    itens: itens.slice(inicio, inicio + tamanho),
    pagina: atual,
    totalPaginas,
    total: itens.length,
    primeiro: itens.length === 0 ? 0 : inicio + 1,
    ultimo: Math.min(inicio + tamanho, itens.length),
  }
}
