import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Cadastro do prestador de serviço.
 *
 * A tabela nasceu para o Profissional regulamentado (contador/advogado) e por
 * isso mantém o nome histórico, mas hoje guarda os dois tipos de prestador da
 * plataforma. Quem separa os dois é `tipo_prestador`:
 *
 * - `profissional`: pessoa com habilitação técnica regulamentada. Passa por
 *   análise e só opera com `status_analise = 'aprovado'`.
 * - `colaborador`: pessoa com conhecimento técnico sem habilitação
 *   regulamentada. Não informa registro (CRC/OAB), não envia comprovante e não
 *   passa por análise de habilitação — opera com `status_analise = 'ativo'`.
 *
 * A distinção existe justamente para que o Colaborador nunca precise de um
 * `status_analise = 'aprovado'` artificial para entrar no /admin.
 */
export const perfisProfissionais = pgTable('perfis_profissionais', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  // Discriminador do tipo de prestador. O default preserva as linhas legadas,
  // todas criadas quando só existia o cadastro de profissional regulamentado.
  tipoPrestador: varchar('tipo_prestador', { length: 20 })
    .notNull()
    .default('profissional'),
  tipoProfissional: varchar('tipo_profissional', { length: 20 }).notNull(),
  numeroRegistro: varchar('numero_registro', { length: 50 }),
  estadoRegistro: varchar('estado_registro', { length: 2 }),
  areasAtuacao: text('areas_atuacao').array().notNull().default([]),
  apresentacao: text('apresentacao').notNull(),
  avatarUrl: text('avatar_url'),
  nomeAtuacao: varchar('nome_atuacao', { length: 255 }).notNull(),
  modalidadeAtuacao: varchar('modalidade_atuacao', { length: 20 }).notNull(),
  cidade: varchar('cidade', { length: 120 }).notNull(),
  estado: varchar('estado', { length: 2 }).notNull(),
  cep: varchar('cep', { length: 8 }),
  logradouro: varchar('logradouro', { length: 255 }),
  numero: varchar('numero', { length: 30 }),
  complemento: varchar('complemento', { length: 120 }),
  bairro: varchar('bairro', { length: 120 }),
  tempoExperiencia: integer('tempo_experiencia'),
  anoInicioAtuacao: integer('ano_inicio_atuacao'),
  formacao: varchar('formacao', { length: 255 }),
  instituicaoEnsino: varchar('instituicao_ensino', { length: 255 }),
  anoFormacao: integer('ano_formacao'),
  especialidades: text('especialidades').array().notNull().default([]),
  certificacoes: text('certificacoes').array().notNull().default([]),
  valorHoraCentavos: integer('valor_hora_centavos'),
  avaliacaoMedia: integer('avaliacao_media'),
  totalAvaliacoes: integer('total_avaliacoes').notNull().default(0),
  disponivelAtendimento: boolean('disponivel_atendimento').notNull().default(true),
  regimesAtendidos: text('regimes_atendidos').array().notNull().default([]),
  /**
   * Conteúdo livre do bloco "Sobre" do perfil público.
   *
   * Opcionais e sem default: vazios, o bloco público não mostra placeholder
   * nem título preso a uma categoria — simplesmente não aparece. `sobreTitulo`
   * substitui o rótulo antes fixo ("Especialista em rotinas fiscais...");
   * o próprio kicker "Sobre o Contador/Advogado/..." é derivado de
   * `tipoProfissional` na camada de apresentação, não gravado aqui.
   */
  sobreTitulo: varchar('sobre_titulo', { length: 160 }),
  sobreTexto: text('sobre_texto'),
  comprovanteRegistroChave: text('comprovante_registro_chave'),
  comprovanteRegistroNomeOriginal: varchar('comprovante_registro_nome_original', { length: 255 }),
  comprovanteRegistroTipo: varchar('comprovante_registro_tipo', { length: 100 }),
  comprovanteRegistroTamanho: integer('comprovante_registro_tamanho'),
  comprovanteRegistroEnviadoEm: timestamp('comprovante_registro_enviado_em'),
  telefoneContato: varchar('telefone_contato', { length: 20 }).notNull(),
  emailProfissional: varchar('email_profissional', { length: 255 }).notNull(),
  statusAnalise: varchar('status_analise', { length: 30 }).notNull().default('rascunho'),
  observacaoAnalise: text('observacao_analise'),
  enviadoEm: timestamp('enviado_em'),
  analisadoEm: timestamp('analisado_em'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  usuarioUnique: uniqueIndex('perfis_profissionais_usuario_unique').on(t.usuarioId),
  statusIdx: index('perfis_profissionais_status_idx').on(t.statusAnalise),
  tipoIdx: index('perfis_profissionais_tipo_idx').on(t.tipoProfissional),
  // Toda listagem pública e toda pesquisa de convite filtram por tipo + status.
  tipoPrestadorIdx: index('perfis_profissionais_tipo_prestador_idx').on(
    t.tipoPrestador,
    t.statusAnalise,
  ),
}))
