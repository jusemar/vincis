/**
 * Abrangência da solicitação.
 *
 * Uma coluna só, com dois significados possíveis: `BR` quer dizer "em qualquer
 * lugar do país" e a UF quer dizer "neste estado". Cidade digitada à mão saiu
 * do fluxo de propósito — texto livre gera "Sao Paulo", "são paulo" e "SP
 * capital" como três lugares diferentes, e nenhum filtro sério se sustenta em
 * cima disso.
 *
 * Na interface aparece exatamente `BR`, sem legenda ao lado: é o código, e é
 * assim que ele deve ser lido.
 */

export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export type UfBrasil = (typeof UFS_BRASIL)[number]

/** `BR` primeiro: é a abrangência mais ampla e o padrão do formulário. */
export const ABRANGENCIAS = ['BR', ...UFS_BRASIL] as const

export type Abrangencia = (typeof ABRANGENCIAS)[number]

export const ABRANGENCIA_PADRAO: Abrangencia = 'BR'

export function abrangenciaValida(valor: string): valor is Abrangencia {
  return (ABRANGENCIAS as readonly string[]).includes(valor)
}
