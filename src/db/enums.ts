import { pgEnum } from 'drizzle-orm/pg-core'

export const empresaTipoEnum = pgEnum('empresa_tipo', [
  'cliente',
  'prestadora',
])

export const empresaStatusEnum = pgEnum('empresa_status', [
  'ativo',
  'bloqueado',
])

export const empresaSegmentoEnum = pgEnum('empresa_segmento', [
  'advocacia',
  'contabilidade',
])

export const empresaMembroStatusEnum = pgEnum('empresa_membro_status', [
  'ativo',
  'bloqueado',
  'removido',
])

export const usuarioStatusEnum = pgEnum('usuario_status', [
  'pendente_email',
  'ativo',
  'bloqueado',
])
