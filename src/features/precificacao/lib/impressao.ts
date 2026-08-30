import type { TabelaPrecificacao } from '../types/precificacao'

/**
 * A "impressão" de uma seção: o retrato dos valores que o formulário abriu.
 *
 * Serve a um problema concreto e pequeno: dois Gestores com a mesma tela
 * aberta. Sem nada, o segundo a salvar apagaria em silêncio o que o primeiro
 * acabou de decidir — e ninguém saberia. Com isto, a action recalcula a
 * impressão dentro da transação e recusa a gravação quando ela não bate,
 * pedindo que a página seja recarregada.
 *
 * É de propósito o mais simples que resolve: não trava linha nenhuma, não cria
 * coluna de versão e não impede ninguém de editar. Compara valores, que é
 * exatamente o que importa — reeditar para o mesmo número não é conflito.
 */
export type SecaoPrecificacao =
  | 'precos_base'
  | 'funcionarios'
  | 'notas_fiscais'
  | 'faturamento'
  | 'adicionais'
  | 'descontos'
  | `fatores:${string}`

export function impressaoDaSecao(
  tabela: TabelaPrecificacao,
  secao: SecaoPrecificacao,
): string {
  if (secao.startsWith('fatores:')) {
    const codigo = secao.slice('fatores:'.length)
    const dimensao = tabela.dimensoes.find((d) => d.codigo === codigo)
    return juntar(
      (dimensao?.opcoes ?? []).map(
        (o) => `${o.codigo}=${o.multiplicadorMilesimos ?? '-'}`,
      ),
    )
  }

  switch (secao) {
    case 'precos_base':
      return juntar([
        ...tabela.precosBase.map(
          (p) => `${p.grupo}/${p.regime}=${p.valorCentavos}`,
        ),
        ...tabela.servicos.map(
          (s) => `${s.codigo}*${s.multiplicadorMilesimos ?? '-'}`,
        ),
      ])
    case 'funcionarios':
    case 'notas_fiscais':
    case 'faturamento':
      return juntar(
        tabela.faixas
          .filter((f) => f.tipo === secao)
          .map((f) => `${f.grupo}/${f.codigo}=${f.valorCentavos}`),
      )
    case 'adicionais':
      return juntar(
        tabela.adicionais.map(
          (a) => `${a.codigo}=${a.valorMensalCentavos}/${a.ativo ? 1 : 0}`,
        ),
      )
    case 'descontos':
      return juntar(
        tabela.descontos.map((d) => `${d.codigo}=${d.descontoMilesimos}`),
      )
  }

  // O tipo inclui um literal de gabarito (`fatores:...`), então o TypeScript
  // não enxerga o switch como exaustivo. Cair aqui é seção inexistente, e
  // devolver string vazia faria qualquer impressão bater com qualquer outra.
  throw new Error(`Seção de precificação desconhecida: ${secao}`)
}

/** Ordenado, para que a impressão não dependa da ordem em que o banco leu. */
function juntar(partes: string[]): string {
  return [...partes].sort().join('|')
}
