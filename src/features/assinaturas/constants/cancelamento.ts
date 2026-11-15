/**
 * Cancelamento do plano recorrente contábil da Vincis.
 *
 * Cancelar **encerra aquela relação recorrente** — não exclui o cliente, não
 * mexe na conta, não apaga histórico, pagamento, competência nem o contador
 * que foi responsável. Também não é reembolso: estorno é outra regra.
 *
 * Arquivo puro (sem banco): usado pela tela do cliente, pela Gestão e pelo
 * servidor.
 */

/** Sugestões para o motivo da Gestão. O campo é livre; estas só agilizam. */
export const MOTIVOS_SUGERIDOS_CANCELAMENTO = [
  'Solicitação do cliente',
  'Encerramento da empresa',
  'Questão administrativa',
  'Inadimplência',
] as const

export const TAMANHO_MAXIMO_MOTIVO_CANCELAMENTO = 500

export const ORIGENS_CANCELAMENTO = ['cliente', 'gestor'] as const
export type OrigemCancelamento = (typeof ORIGENS_CANCELAMENTO)[number]

export const ROTULO_ORIGEM_CANCELAMENTO: Record<OrigemCancelamento, string> = {
  cliente: 'Cancelado pelo cliente',
  gestor: 'Cancelado pela Vincis',
}

/** O que o cliente lê antes de confirmar. */
export const AVISOS_CANCELAMENTO_CLIENTE = [
  'O plano recorrente será encerrado.',
  'Não haverá novas cobranças nem novos meses deste plano.',
  'Sua conta Vincis continua ativa — você pode contratar de novo quando quiser.',
  'O histórico, os pagamentos e os meses já prestados são preservados.',
  'Meses futuros deixam de ser prestados, mesmo se já pagos. Não há reembolso automático.',
] as const

/** Plano aguardando pagamento: o Pix já gerado deixa de valer para ativá-lo. */
export const AVISO_PIX_PENDENTE =
  'Se você já gerou um Pix para este plano, não pague: ele não ativará mais o plano.'

export function formatarDataCancelamento(data: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(data))
}
