/**
 * Natureza de uma proposta de orçamento (`oportunidade_propostas.natureza`).
 *
 * Arquivo puro (sem banco): usado pelo formulário do prestador, pela tela do
 * Cliente e pelo servidor.
 *
 * - `avulsa`: serviço pontual. Pago pela Vincis (Pix), com comissão Vincis
 *   obrigatória.
 * - `recorrente`: relação contábil recorrente do contador **Autônomo**.
 *   Cliente e contador negociam e pagam diretamente — a Vincis não emite Pix,
 *   não cobra, não comissiona e não cria plano.
 *
 * É sempre uma escolha explícita do prestador — nunca inferida do texto.
 */
export const NATUREZAS_PROPOSTA = ['avulsa', 'recorrente'] as const
export type NaturezaProposta = (typeof NATUREZAS_PROPOSTA)[number]

export const ROTULO_NATUREZA_PROPOSTA: Record<NaturezaProposta, { titulo: string; descricao: string }> = {
  avulsa: {
    titulo: 'Serviço avulso',
    descricao: 'Trabalho pontual, pago pelo cliente com Pix pela Vincis.',
  },
  recorrente: {
    titulo: 'Relação contábil recorrente',
    descricao: 'Acompanhamento contínuo, com pagamento combinado diretamente entre vocês, sem Pix da Vincis.',
  },
}

export const MENSAGEM_RECORRENTE_SO_AUTONOMO =
  'Proposta recorrente é exclusiva do contador Autônomo. Envie como serviço avulso.'

/** Só o contador Autônomo propõe relação recorrente direta. */
export function podeProporRecorrente(
  tipoProfissional: string | null | undefined,
  modeloContratacao: string | null | undefined,
): boolean {
  return tipoProfissional === 'contabilidade' && modeloContratacao === 'autonomo'
}
