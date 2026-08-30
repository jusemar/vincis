import type { LinhaComposicao } from '../types/precificacao'

/**
 * O nome que cada parcela recebe na explicação do preço.
 *
 * O motor devolve o **tipo** da linha, não o texto — o preço não depende de
 * como ele é chamado, e uma tela em outro idioma ou um PDF de proposta chamaria
 * a mesma parcela de outra coisa. Os textos abaixo são exatamente os que a
 * página já mostrava em "Como chegamos nesse valor?".
 *
 * O acréscimo por funcionário muda de nome conforme o grupo, e isso não é
 * detalhe estético: na rotina contábil ele é custo de folha, na jurídica é
 * exposição trabalhista.
 */
export function rotuloDaLinha(linha: LinhaComposicao, grupo: string): string {
  switch (linha.tipo) {
    case 'base':
      return 'Preço base'
    case 'funcionarios':
      return grupo === 'juridico'
        ? 'Risco trabalhista da equipe'
        : `Funcionários (${linha.quantidade ?? 0})`
    case 'notas_fiscais':
      return 'Emissão de notas fiscais'
    case 'faturamento':
      return 'Volume de faturamento'
    case 'desconto_combo':
      return 'Desconto do combo'
    case 'adicional':
    case 'componente':
      return linha.rotulo ?? ''
  }
}
