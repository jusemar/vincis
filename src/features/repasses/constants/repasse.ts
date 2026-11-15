/**
 * Vocabulário do repasse manual ao profissional.
 *
 * O repasse é **manual**: a Vincis recebe 100% pela própria conta e, depois de
 * o serviço ser prestado, transfere a parte do profissional por fora da
 * plataforma. Aqui não há Pix de saída, split nem transferência pela Efí — só
 * o controle do que é devido, do que já pode sair e do que já saiu.
 */

export const ORIGENS_REPASSE = ['servico', 'acordo', 'consultoria', 'competencia'] as const
export type OrigemRepasse = (typeof ORIGENS_REPASSE)[number]

export const SITUACOES_REPASSE = ['aguardando_liberacao', 'disponivel', 'repassado', 'em_revisao'] as const
export type SituacaoRepasse = (typeof SITUACOES_REPASSE)[number]

export const ROTULO_SITUACAO_REPASSE: Record<SituacaoRepasse, string> = {
  aguardando_liberacao: 'Aguardando liberação',
  disponivel: 'Disponível para repasse',
  repassado: 'Repassado',
  em_revisao: 'Em revisão',
}

export const ROTULO_ORIGEM_REPASSE: Record<OrigemRepasse, string> = {
  servico: 'Serviço avulso',
  acordo: 'Orçamento aceito',
  consultoria: 'Consultoria',
  competencia: 'Plano recorrente',
}

/**
 * Por que um valor está em revisão. Nenhum desses casos libera nem devolve
 * dinheiro sozinho: a Gestão analisa e decide fora do sistema.
 */
export const MOTIVOS_REVISAO = [
  'pagamento_estornado',
  'sem_percentual_registrado',
  'percentuais_divergentes',
  'sem_profissional',
  'contratacao_cancelada',
  'atendimento_cancelado',
  'atendimento_recusado',
  'encerrado_sem_conclusao',
  'consulta_cancelada',
  'competencia_cancelada',
] as const
export type MotivoRevisao = (typeof MOTIVOS_REVISAO)[number]

export const ROTULO_MOTIVO_REVISAO: Record<MotivoRevisao, string> = {
  pagamento_estornado: 'Pagamento estornado',
  sem_percentual_registrado: 'Pagamento sem percentual de comissão registrado',
  percentuais_divergentes: 'Pagamentos do mesmo mês com percentuais diferentes',
  sem_profissional: 'Serviço prestado sem profissional identificado',
  contratacao_cancelada: 'Contratação cancelada',
  atendimento_cancelado: 'Atendimento cancelado',
  atendimento_recusado: 'Atendimento recusado',
  encerrado_sem_conclusao: 'Atendimento encerrado sem conclusão',
  consulta_cancelada: 'Consulta cancelada',
  competencia_cancelada: 'Mês pago antecipadamente e cancelado',
}

export const REPASSES_POR_PAGINA = 20

/** Limites do registro do repasse (comprovante = id da transferência, E2E etc.). */
export const COMPROVANTE_MAX = 200
export const OBSERVACAO_MAX = 1000
