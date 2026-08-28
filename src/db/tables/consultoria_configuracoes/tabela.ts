import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * A consultoria agendada de um Profissional.
 *
 * ## Uma por prestador, e a garantia é do banco
 *
 * Nesta versão cada Profissional tem **uma** consultoria padrão. `prestador_id`
 * é único — não um índice parcial por `ativa`, porque desligar a consultoria
 * não é apagá-la: as faixas semanais, as exceções e (no futuro) os
 * agendamentos continuam pendurados nesta linha. Um índice parcial permitiria
 * uma segunda linha ativa nascer ao lado da desligada e deixaria duas agendas
 * disputando o mesmo prestador. `ativa = false` é a forma de tirar do ar.
 *
 * O dia em que existir catálogo de consultorias, o índice único sai e nasce uma
 * coluna de identificação — nenhuma das outras tabelas precisa mudar, porque
 * todas apontam para esta linha e não para o prestador.
 *
 * ## O dono é `usuarios.id`
 *
 * O mesmo id que o perfil público recebe em `?prestador=` e que `servicos`,
 * `atendimentos` e `contratacoes_servico` já usam como `prestador_id`. A ficha
 * de habilitação vive em `perfis_profissionais` e é consultada por junção —
 * apontar para ela aqui criaria um segundo conceito de "dono" e faria a agenda
 * sumir se a ficha fosse refeita.
 *
 * ## Tempo
 *
 * `timezone` é IANA e é a **única** referência para interpretar as faixas e as
 * exceções: nada nesta agenda depende do fuso do Node, do banco ou do
 * navegador. Os minutos são inteiros porque toda a aritmética de slot acontece
 * em minutos do dia local — fração de minuto não existe em agenda.
 *
 * `valor_centavos` segue o padrão financeiro do projeto: inteiro, nunca ponto
 * flutuante.
 */
export const consultoriaConfiguracoes = pgTable(
  'consultoria_configuracoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descricaoCurta: varchar('descricao_curta', { length: 280 }).notNull(),
    /**
     * Como a consultoria acontece.
     *
     * Só existe `online` nesta versão, e o valor fica gravado em vez de ser
     * suposto: quando houver presencial, as linhas antigas continuam dizendo a
     * verdade sobre si mesmas. Sem `check` de propósito — a lista de
     * modalidades é vocabulário de produto (`constants/consultoria.ts`), e
     * prendê-la no banco obrigaria uma migration para cada valor novo, que é
     * exatamente o que `atendimentos.status` já evita.
     */
    modalidade: varchar('modalidade', { length: 20 }).notNull().default('online'),
    valorCentavos: integer('valor_centavos').notNull(),
    duracaoMinutos: integer('duracao_minutos').notNull(),
    /**
     * Folga depois de cada consulta, em minutos.
     *
     * Zero é válido e é o padrão: quem não quer respiro entre atendimentos não
     * precisa configurar nada.
     */
    intervaloMinutos: integer('intervalo_minutos').notNull().default(0),
    /** Quanto tempo antes do início o Cliente ainda consegue contratar. */
    antecedenciaMinimaMinutos: integer('antecedencia_minima_minutos')
      .notNull()
      .default(120),
    /** Até quantos dias à frente a agenda se abre. Nunca ilimitado. */
    horizonteDias: integer('horizonte_dias').notNull().default(60),
    /** Identificador IANA (ex.: `America/Sao_Paulo`). Nunca vazio. */
    timezone: varchar('timezone', { length: 64 })
      .notNull()
      .default('America/Sao_Paulo'),
    ativa: boolean('ativa').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma consultoria padrão por Profissional, garantido pelo banco e não pela
    // tela que só mostra um formulário.
    prestadorUnico: uniqueIndex('consultoria_configuracoes_prestador_unico').on(
      t.prestadorId,
    ),
    // Os limites que não podem depender do Zod: uma escrita direta no banco,
    // um script de importação ou um bug futuro esbarram aqui antes de produzir
    // agenda impossível (slot de duração zero geraria laço infinito).
    valorPositivo: check(
      'consultoria_configuracoes_valor_positivo',
      sql`valor_centavos > 0`,
    ),
    duracaoPositiva: check(
      'consultoria_configuracoes_duracao_valida',
      sql`duracao_minutos > 0 and duracao_minutos <= 480`,
    ),
    intervaloValido: check(
      'consultoria_configuracoes_intervalo_valido',
      sql`intervalo_minutos >= 0 and intervalo_minutos <= 240`,
    ),
    antecedenciaValida: check(
      'consultoria_configuracoes_antecedencia_valida',
      sql`antecedencia_minima_minutos >= 0 and antecedencia_minima_minutos <= 43200`,
    ),
    horizonteValido: check(
      'consultoria_configuracoes_horizonte_valido',
      sql`horizonte_dias > 0 and horizonte_dias <= 365`,
    ),
    timezonePreenchido: check(
      'consultoria_configuracoes_timezone_preenchido',
      sql`length(btrim(timezone)) > 0`,
    ),
  }),
)
