/**
 * Vocabulário dos comunicados institucionais.
 *
 * Um comunicado é a Vincis falando com quem usa a plataforma. Ele não descreve
 * a operação de ninguém: não cita protocolo, Cliente nem Atendimento. Essa
 * fronteira é o motivo de o mural existir separado do sino (atenção pessoal) e
 * do Histórico (auditoria de um Atendimento).
 */

export const TIPOS_COMUNICADO = [
  'novidade',
  'aviso',
  'manutencao',
  'sistema',
  'destaque',
] as const

export type TipoComunicado = (typeof TIPOS_COMUNICADO)[number]

export const ROTULO_TIPO_COMUNICADO: Record<TipoComunicado, string> = {
  novidade: 'Novidade',
  aviso: 'Aviso',
  manutencao: 'Manutenção',
  sistema: 'Sistema',
  destaque: 'Destaque',
}

/**
 * Quem enxerga o comunicado.
 *
 * Três valores bastam hoje e cobrem o pedido: um aviso sobre o portal do
 * Cliente não precisa ocupar espaço no Dashboard de quem presta serviço. A
 * lista é fechada de propósito — audiência livre viraria segmentação, e
 * segmentação é outro produto.
 */
export const AUDIENCIAS_COMUNICADO = ['todos', 'prestadores', 'clientes'] as const
export type AudienciaComunicado = (typeof AUDIENCIAS_COMUNICADO)[number]

export const ROTULO_AUDIENCIA_COMUNICADO: Record<AudienciaComunicado, string> = {
  todos: 'Todos',
  prestadores: 'Prestadores',
  clientes: 'Clientes',
}

export const STATUS_COMUNICADO = ['rascunho', 'publicado', 'arquivado'] as const
export type StatusComunicado = (typeof STATUS_COMUNICADO)[number]

export const ROTULO_STATUS_COMUNICADO: Record<StatusComunicado, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
}

/**
 * Aparência de cada tipo no card do Dashboard.
 *
 * São exatamente as classes que as linhas mockadas de "Atividade Recente" já
 * usam. O comunicado real precisa ser indistinguível do mock ao lado — é assim
 * que a comparação visual desta etapa faz sentido.
 */
export const VISUAL_TIPO_COMUNICADO: Record<
  TipoComunicado,
  { icone: string; fundo: string }
> = {
  novidade: { icone: '🚀', fundo: 'badge-info' },
  aviso: { icone: '⚠️', fundo: 'bg-warning/20' },
  manutencao: { icone: '🛠️', fundo: 'bg-warning/20' },
  sistema: { icone: '⚙️', fundo: 'badge-success' },
  destaque: { icone: '⭐', fundo: 'bg-yellow-500/20' },
}
