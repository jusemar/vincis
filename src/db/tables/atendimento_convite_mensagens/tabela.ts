import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentoConvites } from '../atendimento_convites/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Negociação privada do convite.
 *
 * É um **quarto** canal, separado do Protocolo, da Conversa Cliente e da
 * Conversa Interna — e a separação é por tabela, não por uma flag de interface.
 * O motivo é o alcance: a Conversa Interna é da equipe do Atendimento inteira, e
 * quanto se está pagando a um colaborador externo não é assunto dela; o
 * Protocolo é registro formal com o Cliente; e o Cliente nunca vê nada disto.
 *
 * A leitura é restrita a duas pessoas — quem convidou e quem foi convidado —, e
 * essa restrição é aplicada no SQL de quem consulta, não na renderização.
 *
 * `valorCentavos` fica ao lado do texto porque a proposta é um dado, não uma
 * frase: "faço por 800" precisa virar 80000 para que o aceite possa congelar o
 * valor acordado sem ninguém interpretar texto livre.
 */
export const atendimentoConviteMensagens = pgTable(
  'atendimento_convite_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conviteId: uuid('convite_id')
      .notNull()
      .references(() => atendimentoConvites.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    /**
     * `mensagem` é conversa; `proposta` e `contraproposta` carregam valor.
     *
     * Guardar o tipo evita ter de adivinhar pela presença do valor: uma
     * proposta de R$ 0 continua sendo uma proposta.
     */
    tipo: varchar('tipo', { length: 20 }).notNull().default('mensagem'),
    conteudo: text('conteudo').notNull(),
    /** Valor da proposta desta linha. Nulo nas mensagens sem valor. */
    valorCentavos: integer('valor_centavos'),
    /**
     * Valor que esta linha substituiu, do mesmo lado da mesa.
     *
     * É como a correção fica auditável sem apagar nada: quem digitou 9.500 em
     * vez de 950 envia o valor certo, e a linha nova guarda o que estava
     * valendo antes. As duas continuam no histórico, com autor e hora; só a
     * última vale para o aceite. Nulo na primeira proposta de cada lado, que
     * não substituiu valor nenhum.
     */
    valorAnteriorCentavos: integer('valor_anterior_centavos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    negociacaoIdx: index('atendimento_convite_mensagens_negociacao_idx').on(
      t.conviteId,
      t.createdAt,
    ),
  }),
)
