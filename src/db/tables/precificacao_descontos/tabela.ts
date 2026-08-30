import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'
import { precificacaoServicos } from '../precificacao_servicos/tabela'

/**
 * Os dois abatimentos que a Vincis concede: fechar por mais tempo e juntar
 * serviços.
 *
 * Vivem na mesma tabela porque são a mesma operação — um percentual sobre o
 * mensal já calculado — e porque a tela do Gestor mostra os dois lado a lado
 * como "descontos". O que os separa é `tipo`, e o `check` impede a linha
 * híbrida: período tem `meses` e não tem serviço; combo tem serviço e não tem
 * `meses`.
 *
 * O período mensal está aqui com desconto zero, e não escondido no código. É
 * ele que dá ao configurador a lista de prazos a exibir — tirá-lo obrigaria a
 * tela a inventar de volta a primeira linha do card.
 *
 * `desconto_milesimos` segue a unidade da família: o número real × 1000. 8% é
 * `80`, 15% é `150`. A referência à `precificacao_servicos` é o que também
 * impede o Pacote Empresarial de ser apagado enquanto o desconto dele existir.
 */
export const precificacaoDescontos = pgTable(
  'precificacao_descontos',
  {
    /** `mensal`, `seis_meses`, `doze_meses`, `combo`. */
    codigo: varchar('codigo', { length: 30 }).primaryKey(),
    /** `periodo` ou `combo`. */
    tipo: varchar('tipo', { length: 20 }).notNull(),
    rotulo: varchar('rotulo', { length: 120 }).notNull(),
    /** Duração do compromisso. Só em `periodo`. */
    meses: integer('meses'),
    /** Serviço composto a que o abatimento pertence. Só em `combo`. */
    servicoCodigo: varchar('servico_codigo', { length: 30 }).references(
      () => precificacaoServicos.codigo,
    ),
    /** Fração × 1000. 150 = 15%. */
    descontoMilesimos: integer('desconto_milesimos').notNull(),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    tipoConhecido: check(
      'precificacao_descontos_tipo_conhecido',
      sql`${t.tipo} in ('periodo', 'combo')`,
    ),
    formaCoerente: check(
      'precificacao_descontos_forma_coerente',
      sql`(${t.tipo} = 'periodo' and ${t.meses} > 0 and ${t.servicoCodigo} is null)
          or (${t.tipo} = 'combo' and ${t.meses} is null and ${t.servicoCodigo} is not null)`,
    ),
    // Abaixo de zero seria acréscimo disfarçado de desconto; 1000 (100%)
    // zeraria a mensalidade.
    descontoValido: check(
      'precificacao_descontos_valido',
      sql`${t.descontoMilesimos} >= 0 and ${t.descontoMilesimos} < 1000`,
    ),
  }),
)
