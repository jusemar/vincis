import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Conversa dentro da própria Oportunidade.
 *
 * ## Por que não deu para reaproveitar `atendimento_mensagens`
 *
 * Porque ela tem `atendimento_id not null references atendimentos`: a conversa
 * do Atendimento **é** do Atendimento, e um Atendimento só nasce de um
 * pagamento aprovado. Usá-la aqui exigiria abrir um Atendimento fictício antes
 * de existir contratação — um protocolo, um Kanban, uma avaliação e uma
 * cobrança pendurados numa conversa que não é nada disso. A dependência é
 * estrutural, e contorná-la seria mentir para o resto da plataforma.
 *
 * O que **foi** reaproveitado é tudo o mais: a leitura vive em
 * `atendimento_leituras` (escopo `oportunidade`, canal `conversa`), o aviso sai
 * por `notificacoes`, o tempo real sai pelo canal do usuário, e a autorização é
 * a mesma `obterVinculoComOportunidade` que decide todo o resto do módulo.
 *
 * ## O mínimo, e só o mínimo
 *
 * Quatro colunas de conteúdo. Não há `escopo` (não existe nota interna: são
 * duas pessoas), não há anexo (a Oportunidade já tem `oportunidade_arquivos`),
 * não há valor (valor comercial mora na proposta, e esta conversa existe
 * justamente onde não há proposta), não há status de entrega.
 *
 * Quem pode escrever aqui não é decidido por esta tabela: é o Cliente dono e o
 * Profissional destinatário, conferidos na Server Action a cada mensagem.
 */
export const oportunidadeMensagens = pgTable(
  'oportunidade_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oportunidadeId: uuid('oportunidade_id')
      .notNull()
      .references(() => oportunidades.id, { onDelete: 'cascade' }),
    /**
     * Quem escreveu.
     *
     * Não existe `ehCliente` ao lado: o papel de cada pessoa vem do vínculo com
     * a Oportunidade, e duplicá-lo aqui criaria duas verdades sobre a mesma
     * coisa. É a mesma decisão que `atendimento_mensagens` já tinha tomado.
     */
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    conteudo: text('conteudo').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // A pergunta é sempre "a conversa desta oportunidade, em ordem".
    conversaIdx: index('oportunidade_mensagens_conversa_idx').on(
      t.oportunidadeId,
      t.createdAt,
    ),
  }),
)
