/**
 * Estados editoriais.
 *
 * Duas camadas, de propósito:
 * - **publicação** (do artigo): o que o público vê — `nao_publicado`,
 *   `publicado`, `despublicado`, `arquivado`;
 * - **versão** (do texto): o que está em análise — `rascunho`,
 *   `aguardando_aprovacao`, `devolvida`, `rejeitada`, `aprovada`, `descartada`.
 *
 * Assim um artigo publicado pode ter uma revisão "Aguardando aprovação" sem
 * sair do ar nem trocar o texto aprovado. A situação mostrada às pessoas é
 * derivada das duas em `lib/fluxo-editorial.ts`.
 */
export const STATUS_PUBLICACAO = ['nao_publicado', 'publicado', 'despublicado', 'arquivado'] as const
export type StatusPublicacao = (typeof STATUS_PUBLICACAO)[number]

export const STATUS_VERSAO = [
  'rascunho',
  'aguardando_aprovacao',
  'devolvida',
  'rejeitada',
  'aprovada',
  'descartada',
] as const
export type StatusVersao = (typeof STATUS_VERSAO)[number]

/** Versões "em aberto": no máximo uma por artigo (índice único parcial). */
export const STATUS_VERSAO_EM_ABERTO: readonly StatusVersao[] = ['rascunho', 'aguardando_aprovacao', 'devolvida']

/** Situação exibida (painel do autor e Gestão). */
export const SITUACOES_EDITORIAIS = [
  'rascunho',
  'aguardando_aprovacao',
  'devolvido',
  'rejeitado',
  'publicado',
  'despublicado',
  'arquivado',
] as const
export type SituacaoEditorial = (typeof SITUACOES_EDITORIAIS)[number]

export const ROTULO_SITUACAO: Record<SituacaoEditorial, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  devolvido: 'Devolvido para ajustes',
  rejeitado: 'Rejeitado',
  publicado: 'Publicado',
  despublicado: 'Despublicado',
  arquivado: 'Arquivado',
}

/** Ações do histórico editorial (`conhecimento_decisoes.acao`). Lista fechada. */
export const ACOES_EDITORIAIS = {
  criado: 'criado',
  enviado: 'enviado',
  envioCancelado: 'envio_cancelado',
  revisaoIniciada: 'revisao_iniciada',
  revisaoDescartada: 'revisao_descartada',
  aprovado: 'aprovado',
  devolvido: 'devolvido',
  rejeitado: 'rejeitado',
  despublicado: 'despublicado',
  republicado: 'republicado',
  arquivado: 'arquivado',
  destacado: 'destacado',
  destaqueRemovido: 'destaque_removido',
} as const
export type AcaoEditorial = (typeof ACOES_EDITORIAIS)[keyof typeof ACOES_EDITORIAIS]

export const ROTULO_ACAO_EDITORIAL: Record<AcaoEditorial, string> = {
  criado: 'Artigo criado',
  enviado: 'Enviado para aprovação',
  envio_cancelado: 'Envio cancelado pelo autor',
  revisao_iniciada: 'Revisão iniciada',
  revisao_descartada: 'Revisão descartada',
  aprovado: 'Aprovado e publicado',
  devolvido: 'Devolvido para ajustes',
  rejeitado: 'Rejeitado',
  despublicado: 'Despublicado',
  republicado: 'Publicado novamente',
  arquivado: 'Arquivado',
  destacado: 'Destacado na Central',
  destaque_removido: 'Destaque removido',
}

export const AREAS_BUSCA = ['contabilidade', 'advocacia'] as const
export type AreaBusca = (typeof AREAS_BUSCA)[number]
