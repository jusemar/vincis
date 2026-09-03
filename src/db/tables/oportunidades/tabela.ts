import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Oportunidade: um Cliente procurando alguém para um trabalho.
 *
 * É a etapa **anterior** à contratação, e por isso não é `contratacoes_servico`
 * nem `atendimentos`. Aqui ainda não existe prestador escolhido, não existe
 * preço e não existe trabalho em execução — existe uma necessidade descrita
 * por alguém que não sabe a quem recorrer. Guardá-la no Atendimento obrigaria a
 * inventar um `prestador_id` para uma solicitação que, por definição, ainda não
 * tem dono.
 *
 * A categoria é a mesma do cadastro profissional — o Cliente escolhe entre as
 * categorias que os prestadores realmente declaram, e é ela que decide quem
 * enxerga a solicitação, através de `lib/compatibilidade`. As `especialidades`
 * são um recorte opcional dentro da categoria, vindo do mesmo vocabulário
 * fechado que a busca pública usa: servem para o prestador entender o pedido,
 * e não para estreitar quem o recebe.
 *
 * `abrangencia` guarda `BR` (país inteiro) ou a UF. Substituiu o par
 * cidade/estado da primeira versão: cidade digitada à mão produz três grafias
 * para o mesmo lugar e nenhum filtro confiável.
 *
 * Nenhum dado de contato mora aqui — telefone, e-mail e endereço do Cliente
 * continuam onde estavam, fora do alcance desta tela.
 *
 * ## Duas portas de entrada, uma tabela
 *
 * `visibilidade` distingue a solicitação **pública** — nascida em
 * `/profissionais`, que todo prestador compatível enxerga — da **privada**,
 * nascida no perfil de alguém e dirigida só a ele. Uma tabela paralela
 * duplicaria propostas, contrapropostas, anexos, pagamento e Atendimento: os
 * dois fluxos são a mesma negociação, e a única diferença real é **quem
 * alcança** a solicitação. Essa diferença cabe em duas colunas.
 *
 * `destinatario_id` é o Profissional escolhido. A restrição abaixo é do banco,
 * e não da tela: privada sem destinatário seria uma solicitação que ninguém
 * pode responder, e pública com destinatário seria uma regra de acesso
 * silenciosamente diferente da que a vitrine aplica.
 *
 * ## Origem: por onde a pessoa entrou
 *
 * `origem` responde a uma pergunta que `visibilidade` não responde: *o que a
 * pessoa estava fazendo quando pediu isto?*. As duas são independentes — a
 * solicitação nascida na simulação de preços é privada **e** vem da simulação,
 * e uma futura origem qualquer poderá ser pública. Separar as perguntas é o que
 * permite medir conversão por origem sem reinterpretar a regra de acesso.
 *
 * `simulacao` é o retrato do que o cliente viu no configurador do Profissional
 * no instante do clique — respostas, rótulos, preço e hora. Fica **aqui**, e
 * congelado, porque a tabela de preços que o gerou pertence ao Profissional e
 * ele pode republicá-la cinco minutos depois: recalcular na leitura mostraria a
 * ele e ao cliente números que ninguém chegou a ver. É `jsonb` e não colunas
 * porque a grade que produz o retrato é configurável no banco — uma coluna por
 * pergunta obrigaria uma migração a cada dimensão nova da precificação.
 */
export const oportunidades = pgTable(
  'oportunidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Conta do Cliente. Vem sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Categoria do cadastro profissional. Ver `CATEGORIAS_OPORTUNIDADE`. */
    categoria: varchar('categoria', { length: 30 }).notNull(),
    /**
     * `publica` | `privada`. Nasce pública.
     *
     * O padrão preserva as solicitações que já existiam: todas elas são
     * públicas, e nenhuma linha precisou ser reescrita.
     */
    visibilidade: varchar('visibilidade', { length: 10 })
      .notNull()
      .default('publica'),
    /**
     * O Profissional a quem a solicitação privada foi dirigida.
     *
     * Nulo nas públicas — nelas ainda não existe destinatário, que é
     * exatamente o que a etapa significa. Sem `on delete cascade`: a
     * solicitação é do Cliente e o histórico dele não desaparece porque a
     * outra ponta saiu.
     */
    destinatarioId: uuid('destinatario_id').references(() => usuarios.id),
    /**
     * Especialidades escolhidas dentro da categoria. Opcional e validado contra
     * o vocabulário fechado da taxonomia — texto livre não entra aqui.
     */
    especialidades: text('especialidades').array().notNull().default([]),
    /** Resumo em uma linha, gerado a partir da descrição na criação. */
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descricao: text('descricao').notNull(),
    /** `BR` ou a sigla da UF. Nunca cidade. */
    abrangencia: varchar('abrangencia', { length: 2 }).notNull().default('BR'),
    /**
     * Quanto o Cliente pretende investir, em centavos.
     *
     * Referência informada por ele, e nada além disso: não é teto, não é preço
     * e não impede proposta de valor diferente. Nulo quando não informado —
     * zero seria um orçamento declarado que ninguém declarou.
     */
    valorPretendidoCentavos: integer('valor_pretendido_centavos'),
    /**
     * `aberta` | `expirada` | `encerrada` | `cancelada`. Nasce aberta.
     *
     * `expirada` e `cancelada` são estados diferentes de propósito: cancelar é
     * ato de alguém, expirar é o relógio. Confundi-los apagaria a diferença
     * entre "desisti" e "ninguém fechou a tempo".
     */
    status: varchar('status', { length: 20 }).notNull().default('aberta'),
    /**
     * Por que a solicitação foi encerrada. Nulo enquanto ela não foi.
     *
     * `encerrada` sempre significou uma coisa só — parou de receber propostas —
     * e passou a ter duas causas possíveis: o acordo fechado e a recusa do
     * destinatário de uma solicitação **privada**. As duas param a distribuição
     * do mesmo jeito, então continuam sendo o mesmo `status`; o que muda é a
     * história que o Cliente lê, e história é motivo, não estado.
     *
     * Foi por isso que nem `cancelada` (ato do Cliente) nem `expirada` (o
     * relógio) serviram: nenhuma das duas descreve "o profissional escolhido
     * disse que não vai propor".
     *
     * Valores: `acordo` | `sem_interesse`.
     */
    motivoEncerramento: varchar('motivo_encerramento', { length: 20 }),
    /**
     * Fim do prazo global, calculado na criação a partir da configuração da
     * Gestão. Congelado: mudar a configuração depois não deve reabrir nem
     * encurtar solicitações que já estavam em curso.
     */
    expiraEm: timestamp('expira_em'),
    encerradaEm: timestamp('encerrada_em'),
    /**
     * De onde veio o pedido. Ver `ORIGENS_OPORTUNIDADE`.
     *
     * O padrão `solicitacao` preserva tudo que já existia: toda solicitação
     * gravada até aqui nasceu de um formulário, e nenhuma linha precisou ser
     * reescrita para continuar significando o mesmo.
     */
    origem: varchar('origem', { length: 24 }).notNull().default('solicitacao'),
    /**
     * O retrato da simulação de preços. Nulo em toda origem que não a produz.
     *
     * O preço guardado aqui é o que **foi exibido**, e nada além disso: não é
     * proposta vinculante, cobrança, pedido nem obrigação de pagamento. Quem
     * quiser propor um valor usa `oportunidade_propostas`, que é onde valor
     * comercial mora.
     */
    simulacao: jsonb('simulacao'),
    /**
     * Impressão digital da intenção: profissional + respostas + preço exibido.
     *
     * Existe para que o clique repetido não vire uma segunda solicitação
     * idêntica — e é o índice único parcial abaixo, e não uma consulta antes do
     * insert, que garante isso: duas requisições simultâneas passariam pelas
     * duas consultas antes de qualquer uma gravar. Nulo quando a origem não
     * tem o que repetir.
     */
    chaveIntencao: varchar('chave_intencao', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A vitrine do prestador é sempre "as abertas e no prazo da minha
    // categoria, mais recentes primeiro".
    vitrineIdx: index('oportunidades_vitrine_idx').on(
      t.categoria,
      t.status,
      t.createdAt,
    ),
    // A lista do Cliente é "as minhas, mais recentes primeiro".
    clienteIdx: index('oportunidades_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    // A caixa do destinatário é "as dirigidas a mim, mais recentes primeiro".
    destinatarioIdx: index('oportunidades_destinatario_idx').on(
      t.destinatarioId,
      t.status,
      t.createdAt,
    ),
    /**
     * Visibilidade e destinatário andam juntos — garantia do banco.
     *
     * Sem isto, um caminho novo que esquecesse de gravar o destinatário criaria
     * uma solicitação "privada" que nenhuma consulta entrega a ninguém, e um
     * que gravasse destinatário numa pública abriria uma regra de acesso que a
     * vitrine não conhece.
     */
    /**
     * Uma intenção viva por cliente, por profissional, por simulação.
     *
     * Parcial de propósito, e a condição é o que separa "clicou duas vezes" de
     * "voltou meses depois": enquanto a solicitação está **aberta**, repetir a
     * mesma simulação não cria nada; assim que ela é encerrada, recusada ou
     * expirada, a mesma pessoa pode demonstrar interesse de novo — e uma
     * simulação diferente tem outra chave, então nunca esbarra aqui.
     */
    intencaoUnica: uniqueIndex('oportunidades_intencao_unica')
      .on(t.clienteUsuarioId, t.destinatarioId, t.chaveIntencao)
      .where(sql`chave_intencao is not null and status = 'aberta'`),
    /**
     * Origem e retrato andam juntos — garantia do banco.
     *
     * Uma solicitação de simulação sem o retrato seria um lead sem o que o
     * cliente viu, que é a única coisa que ela tem a mais que as outras. E ela
     * é sempre privada: a simulação acontece na página de **uma** pessoa, e
     * distribuí-la para a categoria inteira trocaria a escolha do cliente por
     * outra.
     */
    origemSimulacaoCoerente: check(
      'oportunidades_origem_simulacao',
      sql`origem <> 'simulacao_preco' or (simulacao is not null and visibilidade = 'privada')`,
    ),
    visibilidadeCoerente: check(
      'oportunidades_visibilidade_destinatario',
      sql`(visibilidade = 'publica' and destinatario_id is null) or (visibilidade = 'privada' and destinatario_id is not null)`,
    ),
  }),
)
