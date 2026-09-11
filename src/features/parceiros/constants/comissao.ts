/**
 * O ciclo de vida da comissão do parceiro.
 *
 * `gerada` é o direito que nasceu com a contratação efetiva, antes de o serviço
 * terminar. `disponivel` é o serviço concluído pelo prestador. `cancelada` é a
 * contratação cancelada antes disso. `paga` existe para quando houver pagamento
 * ao parceiro — nada nesta fatia o produz, e é de propósito: saque, saldo e
 * extrato são outra conversa, com outras regras.
 */
export const STATUS_COMISSAO = [
  'gerada',
  'disponivel',
  'paga',
  'cancelada',
] as const
export type StatusComissao = (typeof STATUS_COMISSAO)[number]

export const ROTULO_COMISSAO: Record<StatusComissao, string> = {
  gerada: 'Gerada',
  disponivel: 'Disponível',
  paga: 'Paga',
  cancelada: 'Cancelada',
}

/** O tom de cada estado na interface, no vocabulário dos primitivos. */
export const TOM_COMISSAO: Record<
  StatusComissao,
  'neutro' | 'info' | 'sucesso' | 'atencao'
> = {
  gerada: 'info',
  disponivel: 'sucesso',
  paga: 'sucesso',
  cancelada: 'neutro',
}

/** Avulsa: um negócio do catálogo. Recorrente: um mês de assinatura Vincis. */
export const TIPOS_COMISSAO = ['avulso', 'recorrente'] as const
export type TipoComissao = (typeof TIPOS_COMISSAO)[number]

export const ROTULO_TIPO_COMISSAO: Record<TipoComissao, string> = {
  avulso: 'Avulsa',
  recorrente: 'Recorrente',
}

export function tipoComissaoValido(valor: string): valor is TipoComissao {
  return (TIPOS_COMISSAO as readonly string[]).includes(valor)
}

export function statusComissaoValido(valor: string): valor is StatusComissao {
  return (STATUS_COMISSAO as readonly string[]).includes(valor)
}
