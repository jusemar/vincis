import { integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

/**
 * Os níveis do Programa de Parceiros — a estrutura, não a regra.
 *
 * Código, nome e ordem: Bronze, Prata e Ouro nesta fase. Percentual e mínimo de
 * clientes **não** moram aqui: são configuração da Gestão, versionada em
 * `parceiro_nivel_configuracoes` e `parceiro_nivel_regras`. O nível de menor
 * ordem é a base, o que todo parceiro tem sem exigir nada.
 */
export const parceiroNiveis = pgTable(
  'parceiro_niveis',
  {
    codigo: varchar('codigo', { length: 20 }).primaryKey(),
    nome: varchar('nome', { length: 40 }).notNull(),
    /** Posição na trilha. A menor é a base. */
    ordem: integer('ordem').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // Ordem ambígua tornaria "o maior nível atingido" indefinido.
    ordemUnica: uniqueIndex('parceiro_niveis_ordem_unica').on(t.ordem),
  }),
)
