import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

/**
 * Cadastro por celular em andamento (antes de a conta existir).
 *
 * 1. Pedido: o código de 6 dígitos vai por SMS; aqui fica só o hash dele,
 *    ligado a esta linha, com validade de 5 minutos.
 * 2. Código certo: `verificado_em` + uma autorização de uso único (hash), por
 *    15 minutos, para concluir o cadastro (nome, tipo de conta e senha).
 * 3. Conclusão: a conta nasce com o celular verificado; `concluido_em` fecha a
 *    linha. Um novo pedido para o mesmo número invalida (`invalidado_em`) os
 *    anteriores.
 *
 * Os erros de código são contados na auditoria (mesma regra da recuperação de
 * senha), para que solicitação inexistente e real se comportem igual.
 */
export const cadastrosCelular = pgTable(
  'cadastros_celular',
  {
    id: uuid('id').primaryKey(),
    /** DDD + número, só dígitos (regra de `usuarios/lib/telefone.ts`). */
    celular: varchar('celular', { length: 20 }).notNull(),
    codigoHash: varchar('codigo_hash', { length: 64 }).notNull(),
    expiraEm: timestamp('expira_em').notNull(),
    verificadoEm: timestamp('verificado_em'),
    autorizacaoHash: varchar('autorizacao_hash', { length: 64 }),
    autorizacaoExpiraEm: timestamp('autorizacao_expira_em'),
    concluidoEm: timestamp('concluido_em'),
    invalidadoEm: timestamp('invalidado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    porCelular: index('cadastros_celular_celular_idx').on(t.celular, t.createdAt),
  }),
)
