import { pgEnum } from 'drizzle-orm/pg-core'

export const empresaTipoEnum = pgEnum('empresa_tipo', [
  'cliente',
  'prestadora',
])

export const empresaStatusEnum = pgEnum('empresa_status', [
  'ativo',
  'bloqueado',
])

export const usuarioStatusEnum = pgEnum('usuario_status', [
  'pendente_email',
  'ativo',
  'bloqueado',
])
