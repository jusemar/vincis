/**
 * A reputação pública de um Prestador.
 *
 * Um único formato para todas as superfícies. `media` é o número exato,
 * `mediaEmDecimos` é ele arredondado e vezes dez — a convenção que as telas
 * aprovadas já dividem por dez para exibir —, e `total` é o que separa "ainda
 * não foi avaliado" de "foi avaliado com nota baixa". Sem avaliações, as duas
 * médias são nulas de propósito: `0` ali seria uma reputação péssima afirmada
 * por ninguém.
 */
export type ReputacaoDoPrestador = {
  prestadorId: string
  media: number | null
  mediaEmDecimos: number | null
  total: number
}

/** Um card de "Comentários de clientes" no perfil público. */
export type AvaliacaoPublicaDTO = {
  id: string
  nota: number
  comentario: string
  /** Identidade pública do Cliente. Nunca e-mail, telefone ou documento. */
  autor: string
  criadoEm: string
}

/** Uma faixa do gráfico de distribuição de notas. */
export type DistribuicaoDeNotas = {
  nota: number
  total: number
  percentual: number
}

/**
 * A avaliação que o próprio Cliente fez, devolvida para o portal dele.
 *
 * `criadoEm` e `atualizadoEm` viajam separados porque a edição preserva o
 * primeiro: a data da avaliação é quando ela foi dada, não quando foi ajustada.
 */
export type MinhaAvaliacaoDTO = {
  id: string
  nota: number
  comentario: string | null
  criadoEm: string
  atualizadoEm: string
}
