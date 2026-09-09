/**
 * O ciclo de uma solicitação de saque.
 *
 * `solicitado` é o único que esta fatia produz: o parceiro pediu, o valor ficou
 * reservado e o Gestor tratará o pagamento depois. Os outros três existem no
 * vocabulário para que o fluxo do Gestor não precise de migração de dados —
 * mas nada aqui os escreve, e nenhuma tela os anuncia como se acontecessem.
 */
export const STATUS_SAQUE = ['solicitado', 'pago', 'recusado', 'cancelado'] as const
export type StatusSaque = (typeof STATUS_SAQUE)[number]

export const ROTULO_SAQUE: Record<StatusSaque, string> = {
  solicitado: 'Solicitado',
  pago: 'Pago',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
}

export const TOM_SAQUE: Record<
  StatusSaque,
  'neutro' | 'info' | 'sucesso' | 'atencao'
> = {
  solicitado: 'info',
  pago: 'sucesso',
  recusado: 'atencao',
  cancelado: 'neutro',
}

/*
  Não existe aqui uma lista de "estados que seguram o dinheiro".

  Quem responde isso é `parceiro_saque_itens.liberado_em`, que é também o que o
  índice único do banco cobre. Uma constante paralela seria uma segunda
  definição de "reservado", livre para divergir da que o banco aplica.
*/

export function statusSaqueValido(valor: string): valor is StatusSaque {
  return (STATUS_SAQUE as readonly string[]).includes(valor)
}
