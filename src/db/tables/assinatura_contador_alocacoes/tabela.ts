import { sql } from 'drizzle-orm'
import { check, foreignKey, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { assinaturas } from '../assinaturas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Histórico do contador parceiro responsável por um plano contábil da Vincis.
 *
 * ## Histórico, não estado
 *
 * O responsável **atual** é `assinaturas.prestador_id`. Esta tabela só recebe
 * inserções: cada linha diz "a partir daqui, o responsável passou de A para B,
 * por decisão de quem e por quê". Nada é atualizado nem apagado — trocar de
 * contador não reescreve quem atendeu antes.
 *
 * ## Não é convite
 *
 * `atendimento_convites`, `colaboracoes_cliente` e `convites_empresa` são
 * convites de **colaboração** (ajuda num Atendimento, acesso a um cliente,
 * entrada na equipe de um escritório): pedem aceite, expiram e não transferem
 * responsabilidade. Alocação é decisão do cliente (na contratação) ou da
 * Gestão Vincis — não depende de aceite do contador.
 */
export const assinaturaContadorAlocacoes = pgTable(
  'assinatura_contador_alocacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assinaturaId: uuid('assinatura_id')
      .notNull()
      .references(() => assinaturas.id),
    /** Nulo na primeira alocação (antes não havia responsável). */
    contadorAnteriorId: uuid('contador_anterior_id'),
    /**
     * Nulo = o plano ficou **sem** contador: o cliente devolveu a escolha à
     * Vincis porque o contador dele lotou antes do novo Pix. Volta para
     * "Aguardando alocação de contador".
     */
    contadorNovoId: uuid('contador_novo_id'),
    /** `cliente` — escolhido na contratação; `gestor` — alocado/trocado pela Gestão. */
    origem: varchar('origem', { length: 20 }).notNull(),
    /** Quem decidiu: o próprio cliente ou o Gestor. */
    alteradoPorId: uuid('alterado_por_id').notNull(),
    /** Justificativa do Gestor, quando informada. */
    motivo: text('motivo'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // Nomes explícitos: os gerados passariam de 63 caracteres (limite do Postgres).
    contadorAnteriorFk: foreignKey({
      columns: [t.contadorAnteriorId],
      foreignColumns: [usuarios.id],
      name: 'assinatura_contador_alocacoes_anterior_fk',
    }),
    contadorNovoFk: foreignKey({
      columns: [t.contadorNovoId],
      foreignColumns: [usuarios.id],
      name: 'assinatura_contador_alocacoes_novo_fk',
    }),
    alteradoPorFk: foreignKey({
      columns: [t.alteradoPorId],
      foreignColumns: [usuarios.id],
      name: 'assinatura_contador_alocacoes_alterado_por_fk',
    }),
    assinaturaIdx: index('assinatura_contador_alocacoes_assinatura_idx').on(t.assinaturaId, t.createdAt),
    contadorIdx: index('assinatura_contador_alocacoes_contador_idx').on(t.contadorNovoId),
    origemValida: check(
      'assinatura_contador_alocacoes_origem_valida',
      sql`${t.origem} in ('cliente', 'gestor')`,
    ),
    trocaReal: check(
      'assinatura_contador_alocacoes_troca_real',
      sql`(${t.contadorNovoId} is not null and (${t.contadorAnteriorId} is null or ${t.contadorAnteriorId} <> ${t.contadorNovoId}))
        or (${t.contadorNovoId} is null and ${t.contadorAnteriorId} is not null)`,
    ),
  }),
)
