import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
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
  /**
   * O identificador público do prestador, no formato `PRO-XXXXXX`.
   *
   * O `id` é uuid e serve ao banco: expô-lo numa tela pública entregaria a
   * chave técnica de uma linha a quem só precisa citar o profissional. Este
   * código existe para ser lido, ditado e conferido — o parceiro vê no card do
   * negócio o mesmo código que aparece no perfil público.
   *
   * Nulo só nas linhas anteriores a esta coluna; o código nasce no cadastro e
   * nunca muda, porque um identificador que muda não identifica.
   */
  codigoPublico: varchar('codigo_publico', { length: 12 }).unique(),
  tipoProfissional: varchar('tipo_profissional', { length: 20 }).notNull(),
  numeroRegistro: varchar('numero_registro', { length: 50 }),
  estadoRegistro: varchar('estado_registro', { length: 2 }),
  areasAtuacao: text('areas_atuacao').array().notNull().default([]),
  apresentacao: text('apresentacao').notNull(),
  avatarUrl: text('avatar_url'),
  /**
   * Foto grande do perfil público (topo do card da direita). Independente de
   * `avatar_url`, que segue sendo a foto dos cards de `/profissionais`: trocar
   * ou remover uma nunca toca na outra. Nula = o perfil não mostra foto grande.
   */
  fotoDestaqueUrl: text('foto_destaque_url'),
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
  /**
   * Colaborador que também atua como **prestador público** (aparece na
   * listagem e tem perfil público). Falso por padrão: a conta de colaborador
   * nasce para trabalhar dentro de escritórios, e ninguém vira vitrine sem
   * escolher. Para o Profissional não se aplica — o público dele é decidido
   * pela análise do cadastro.
   */
  vitrinePublica: boolean('vitrine_publica').notNull().default(false),
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
  /**
   * Modelo comercial do profissional **contábil**, definido pelo gestor:
   *
   * - `vincis`: o cliente contrata e paga pela Vincis, que administra a
   *   contratação e remunera o profissional pelas regras da plataforma;
   * - `autonomo`: independente — anuncia o perfil, conversa, e a relação
   *   recorrente (negociação e pagamento) é direta entre cliente e
   *   profissional, sem Pix, repasse ou comissão da Vincis;
   * - nulo: **não definido**. Cadastros antigos não são classificados por
   *   palpite; enquanto nulo, nada público é exibido e o fluxo existente segue.
   *
   * Não se aplica à advocacia nem às outras categorias (o CHECK abaixo recusa
   * valor fora de `tipo_profissional = 'contabilidade'`).
   */
  modeloContratacao: varchar('modelo_contratacao', { length: 20 }),
  /**
   * Capacidade máxima de clientes recorrentes do contador parceiro
   * (`modelo_contratacao = 'vincis'`), definida pelo Gestor.
   *
   * Nula = sem limite definido. Conta só vínculos realmente ativos (plano
   * `ativa`, ou seja, com pagamento confirmado) — ver
   * `features/assinaturas/queries/carteira-do-contador.ts`. No limite, o
   * contador continua com os clientes atuais e deixa de receber novos; nada é
   * removido automaticamente. Ignorada em qualquer outro modelo.
   */
  capacidadeClientesRecorrentes: integer('capacidade_clientes_recorrentes'),
  /**
   * Endereço público amigável: `/profissionais/<slug_publico>`.
   *
   * Gerado uma única vez a partir dos dados públicos (nome ou escritório,
   * profissão e cidade) e **nunca** recalculado: trocar de nome ou de cidade não
   * quebra links já compartilhados. Nulo até a primeira vez que o perfil é
   * publicado/aberto; o endereço antigo `/perfil-profissional?prestador=<id>`
   * redireciona para cá. Regras em `features/perfis/lib/slug-perfil.ts`.
   */
  slugPublico: varchar('slug_publico', { length: 160 }),
  /**
   * Retirado da vitrine pública pela Gestão (perfil de teste, por exemplo).
   *
   * Não exclui nada: o cadastro, os atendimentos e o acesso do dono continuam.
   * O perfil só deixa a busca, a Home, o sitemap e o índice dos buscadores.
   * Voltar é zerar esta coluna (Gestão → Usuários). Nulo = visível.
   */
  ocultoVitrineEm: timestamp('oculto_vitrine_em'),
  motivoOcultacaoVitrine: varchar('motivo_ocultacao_vitrine', { length: 255 }),
  enviadoEm: timestamp('enviado_em'),
  analisadoEm: timestamp('analisado_em'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  usuarioUnique: uniqueIndex('perfis_profissionais_usuario_unique').on(t.usuarioId),
  slugPublicoUnico: uniqueIndex('perfis_profissionais_slug_publico_unique').on(t.slugPublico),
  statusIdx: index('perfis_profissionais_status_idx').on(t.statusAnalise),
  tipoIdx: index('perfis_profissionais_tipo_idx').on(t.tipoProfissional),
  // Toda listagem pública e toda pesquisa de convite filtram por tipo + status.
  tipoPrestadorIdx: index('perfis_profissionais_tipo_prestador_idx').on(
    t.tipoPrestador,
    t.statusAnalise,
  ),
  modeloContratacaoValido: check(
    'perfis_profissionais_modelo_contratacao_valido',
    sql`${t.modeloContratacao} is null or (${t.tipoProfissional} = 'contabilidade' and ${t.modeloContratacao} in ('vincis', 'autonomo'))`,
  ),
  capacidadePositiva: check(
    'perfis_profissionais_capacidade_positiva',
    sql`${t.capacidadeClientesRecorrentes} is null or ${t.capacidadeClientesRecorrentes} > 0`,
  ),
}))
