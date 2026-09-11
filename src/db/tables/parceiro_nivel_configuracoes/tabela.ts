import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Uma versão publicada da configuração de níveis.
 *
 * ## Publicar, não editar
 *
 * Salvar na Gestão cria uma versão nova; nenhuma é reescrita. A vigente é a de
 * maior `versao`. Assim cada nível calculado e cada comissão gerada podem dizer
 * sob qual versão nasceram, e mudar a regra amanhã não apaga o que valia ontem.
 *
 * Os números da regra — percentual e mínimo de clientes por nível — ficam em
 * `parceiro_nivel_regras`, uma linha por nível desta versão. Aqui fica o que é
 * da versão inteira: a proteção contra queda, em dias.
 */
export const parceiroNivelConfiguracoes = pgTable(
  'parceiro_nivel_configuracoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versao: integer('versao').notNull(),
    /** Dias de proteção concedidos a cada subida de nível. Zero: sem proteção. */
    protecaoDias: integer('protecao_dias').notNull(),
    /** Quem publicou. Nulo na versão inicial, semeada pela migration. */
    criadaPor: uuid('criada_por').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    vigenteDesde: timestamp('vigente_desde').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    versaoUnica: uniqueIndex('parceiro_nivel_configuracoes_versao_unica').on(t.versao),
    versaoPositiva: check(
      'parceiro_nivel_configuracoes_versao_positiva',
      sql`${t.versao} > 0`,
    ),
    protecaoValida: check(
      'parceiro_nivel_configuracoes_protecao_valida',
      sql`${t.protecaoDias} >= 0 and ${t.protecaoDias} <= 3650`,
    ),
  }),
)
