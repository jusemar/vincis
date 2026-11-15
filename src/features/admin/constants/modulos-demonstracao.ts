/**
 * Módulos do painel profissional que ainda exibem dados fictícios.
 *
 * "Mensagens" (`tickets`) e "Financeiro" (`financial`) mostram conteúdo de
 * demonstração — chamados e transações inventados. Um profissional real não
 * pode tomar números fictícios por movimentação dele, então esses módulos ficam
 * **ocultos por padrão** em qualquer build (produção incluída) e visíveis só:
 *
 * - em `next dev` (desenvolvimento local); ou
 * - num ambiente que declare `NEXT_PUBLIC_EXIBIR_MODULOS_DEMONSTRACAO=true`
 *   (ex.: homologação, se quiser continuar vendo as telas).
 *
 * A variável é `NEXT_PUBLIC_` de propósito: não é segredo, e os menus são
 * componentes de cliente. O padrão seguro é ocultar — a produção não precisa
 * definir nada. Quando um módulo passar a usar dados reais, basta tirá-lo
 * desta lista.
 */
export const MODULOS_DEMONSTRACAO = ['tickets', 'financial'] as const

const exibirDemonstracoes =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_EXIBIR_MODULOS_DEMONSTRACAO === 'true'

/** O módulo (id do item de menu / `?pagina=`) está oculto neste ambiente? */
export function moduloDemonstracaoOculto(id: string): boolean {
  return !exibirDemonstracoes && (MODULOS_DEMONSTRACAO as readonly string[]).includes(id)
}
