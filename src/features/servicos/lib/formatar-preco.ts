import type { ModeloPreco } from '../schemas/servico'

/**
 * Rótulo de preço exibido no perfil público.
 *
 * Reproduz exatamente as formas que a vitrine já usava — `A partir de R$ 100`,
 * `R$ 180,00/h`, `Sob orçamento` — para que a troca de dados mockados por dados
 * reais não mude uma vírgula do que aparece na tela.
 */
export function rotuloPreco(
  modeloPreco: ModeloPreco,
  valorCentavos: number | null,
): string {
  if (modeloPreco === 'sob_orcamento' || valorCentavos === null) {
    return 'Sob orçamento'
  }
  const valor = valorCentavos / 100
  // Sem espaço depois de `R$`: é exatamente a forma usada na vitrine aprovada
  // (`A partir de R$100`, `R$180,00/h`). Mudar isso alteraria o visual.
  if (modeloPreco === 'por_hora') {
    return `R$${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    })}/h`
  }
  const formatado = `R$${valor.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
  })}`
  return modeloPreco === 'a_partir_de' ? `A partir de ${formatado}` : formatado
}

/** Texto do botão. Orçamento não é contratação direta. */
export function rotuloAcao(modeloPreco: ModeloPreco): string {
  if (modeloPreco === 'sob_orcamento') return 'Solicitar orçamento'
  if (modeloPreco === 'por_hora') return 'Agendar consultoria'
  return 'Contratar agora'
}
