/**
 * Vocabulário do Atendimento.
 *
 * Fica em constantes fechadas para que o valor gravado no banco não varie
 * conforme o arquivo que escreve.
 */

export const STATUS_ATENDIMENTO = [
  'novo',
  'em_andamento',
  'aguardando_cliente',
  'aguardando_assinatura',
  'concluido',
  'recusado',
  'cancelado',
] as const
export type StatusAtendimento = (typeof STATUS_ATENDIMENTO)[number]

export const STATUS_INICIAL_ATENDIMENTO: StatusAtendimento = 'novo'

/**
 * Estados terminais.
 *
 * De onde não se volta por transição livre. Reabertura, se um dia existir, será
 * uma regra própria — com motivo, autorização e registro — e não o simples
 * caminho de volta de um menu.
 */
export const STATUS_TERMINAIS: StatusAtendimento[] = [
  'concluido',
  'recusado',
  'cancelado',
]

/** Rótulos oficiais. Mesmos textos que a tela aprovada já exibia. */
export const ROTULO_STATUS_ATENDIMENTO: Record<StatusAtendimento, string> = {
  novo: 'Novo',
  em_andamento: 'Em andamento',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_assinatura: 'Aguardando assinatura',
  concluido: 'Concluído',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
}

export const PRIORIDADES_ATENDIMENTO = ['alta', 'media', 'baixa'] as const
export type PrioridadeAtendimento = (typeof PRIORIDADES_ATENDIMENTO)[number]

export const ACESSOS_ATENDIMENTO = ['privado', 'compartilhado'] as const
export type AcessoAtendimento = (typeof ACESSOS_ATENDIMENTO)[number]

/** Papéis dentro do Atendimento. Convidados entram como `convidado`. */
export const PAPEIS_PARTICIPANTE = ['responsavel', 'convidado'] as const
export type PapelParticipante = (typeof PAPEIS_PARTICIPANTE)[number]

/**
 * Situações de um convite de colaboração no Atendimento.
 *
 * `pendente` e `aceito` são os estados "vivos" — os únicos que ocupam o índice
 * de unicidade no banco. Os demais liberam o convidado para receber um convite
 * novo naquele mesmo Atendimento.
 */
export const STATUS_CONVITE_ATENDIMENTO = [
  'pendente',
  'aceito',
  'recusado',
  'expirado',
  'revogado',
] as const
export type StatusConviteAtendimento =
  (typeof STATUS_CONVITE_ATENDIMENTO)[number]

export const ROTULO_STATUS_CONVITE: Record<StatusConviteAtendimento, string> = {
  pendente: 'Aguardando resposta',
  aceito: 'Aceito',
  recusado: 'Recusado',
  expirado: 'Expirado',
  revogado: 'Cancelado',
}

/**
 * Estados de uma solicitação de ajuste feita pelo Cliente.
 *
 * Pertencem à **solicitação**, e não ao Atendimento: nenhum deles vira coluna
 * do Kanban. Enquanto o pedido está `pendente` o Atendimento continua exatamente
 * onde estava — `concluido` —, porque quem reabre é a decisão de alguém
 * autorizado, nunca o ato de pedir.
 *
 * - `pendente`: aguardando análise. É o único estado que ocupa o índice de
 *   unicidade — um pedido em aberto por Atendimento;
 * - `aceita`: analisada e aceita; o Atendimento foi reaberto;
 * - `recusada`: analisada e recusada; o Atendimento seguiu concluído;
 * - `encerrada`: o ciclo terminou — o Atendimento aceito foi concluído de novo.
 */
export const STATUS_SOLICITACAO_AJUSTE = [
  'pendente',
  'aceita',
  'recusada',
  'encerrada',
] as const
export type StatusSolicitacaoAjuste = (typeof STATUS_SOLICITACAO_AJUSTE)[number]

export const ROTULO_STATUS_AJUSTE: Record<StatusSolicitacaoAjuste, string> = {
  pendente: 'Em análise',
  aceita: 'Aceita',
  recusada: 'Recusada',
  encerrada: 'Encerrada',
}

/**
 * Teto do motivo do Cliente e da resposta de quem analisa.
 *
 * O mesmo do Protocolo: os dois textos viram manifestação formal lá, e um teto
 * maior aqui produziria um texto que o Protocolo cortaria depois.
 */
export const TAMANHO_MAXIMO_MOTIVO_AJUSTE = 8000
export const TAMANHO_MAXIMO_RESPOSTA_AJUSTE = 8000

/**
 * Mínimo da justificativa de recusa.
 *
 * Recusar sem dizer por quê deixa o Cliente sem nada sobre o que agir. Não é
 * uma medida de qualidade do texto — é a diferença entre uma resposta e um
 * silêncio formalizado.
 */
export const TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA = 10

/**
 * Tipos de linha da negociação.
 *
 * `proposta` é sempre de quem convidou e `contraproposta` de quem foi
 * convidado — as duas carregam valor. `mensagem` é o resto da conversa, sem
 * valor nenhum: perguntar prazo não é oferecer preço.
 */
export const TIPOS_MENSAGEM_NEGOCIACAO = [
  'mensagem',
  'proposta',
  'contraproposta',
] as const
export type TipoMensagemNegociacao = (typeof TIPOS_MENSAGEM_NEGOCIACAO)[number]

/**
 * Validade do convite de colaboração no Atendimento.
 *
 * Menor que a dos 14 dias da colaboração por Cliente de propósito: aqui existe
 * um Atendimento com prazo correndo, e um convite esquecido por duas semanas
 * seguraria trabalho que precisa andar.
 */
export const DIAS_VALIDADE_CONVITE_ATENDIMENTO = 7

/** Teto do texto de escopo e de cada linha da negociação. */
export const TAMANHO_MAXIMO_ESCOPO_CONVITE = 2000
export const TAMANHO_MAXIMO_MENSAGEM_NEGOCIACAO = 2000

/**
 * Teto do valor negociável, em centavos (R$ 10.000.000,00).
 *
 * Existe para que um erro de digitação não vire um acordo absurdo gravado, e
 * para manter o número dentro de um `integer` do Postgres com folga.
 */
export const VALOR_MAXIMO_NEGOCIACAO_CENTAVOS = 1_000_000_000

/**
 * Recursos que têm controle de leitura.
 *
 * `atendimento` cobre os dois canais da Conversa; `convite` cobre a negociação
 * privada. São escopos diferentes porque as regras de acesso são diferentes: a
 * Conversa é da equipe do Atendimento, a negociação é só das duas pontas do
 * convite.
 *
 * `oportunidade` entrou por essa mesma porta, e não por uma coluna
 * `visualizada_em`: a pergunta "quem já abriu isto?" é por pessoa, e uma coluna
 * na oportunidade só conseguiria contar a história de uma delas. A tabela foi
 * desenhada com `escopo` + `recurso_id` exatamente para receber um terceiro
 * recurso sem migração — e nenhuma chegou a ser necessária.
 */
export const ESCOPOS_LEITURA = [
  'atendimento',
  'convite',
  'oportunidade',
] as const
export type EscopoLeitura = (typeof ESCOPOS_LEITURA)[number]

/**
 * Canais dentro de cada escopo.
 *
 * `negociacao` é o único do escopo `convite`, e `solicitacao` o único do escopo
 * `oportunidade` — ali não há dois canais para separar, mas a coluna faz parte
 * do índice único da marca e precisa de um valor que diga o que ela é.
 */
export const CANAIS_LEITURA = [
  'cliente',
  'interno',
  'negociacao',
  'solicitacao',
] as const
export type CanalLeitura = (typeof CANAIS_LEITURA)[number]

export const ORIGENS_ARQUIVO = ['cliente', 'prestador', 'sistema'] as const
export type OrigemArquivo = (typeof ORIGENS_ARQUIVO)[number]

/**
 * Para que serve o arquivo dentro do Atendimento.
 *
 * `anexo` é o documento que circula durante a execução; `entrega_final` é o que
 * foi entregue na conclusão do serviço. A distinção é o que permite ao portal
 * do Cliente destacar a entrega sem adivinhar qual dos anexos é o resultado.
 */
export const FINALIDADES_ARQUIVO = ['anexo', 'entrega_final'] as const
export type FinalidadeArquivo = (typeof FINALIDADES_ARQUIVO)[number]

/**
 * Canais da conversa.
 *
 * `cliente` é compartilhado com o Cliente proprietário; `interno` é da equipe e
 * nunca sai dela.
 */
export const ESCOPOS_MENSAGEM = ['cliente', 'interno'] as const
export type EscopoMensagem = (typeof ESCOPOS_MENSAGEM)[number]

/**
 * Papel de quem escreve no Protocolo.
 *
 * É o papel **naquele Atendimento**, não a identidade da pessoa: o mesmo
 * Profissional é `participante` num Atendimento e poderia ser `cliente` em
 * outro, se contratasse um serviço.
 */
export const PAPEIS_MANIFESTACAO = ['cliente', 'participante'] as const
export type PapelManifestacao = (typeof PAPEIS_MANIFESTACAO)[number]

/**
 * Quem lê cada manifestação.
 *
 * `participantes_e_cliente` — manifestação do Cliente: todos com acesso ao
 * Atendimento precisam ver para poder responder.
 *
 * `autor_e_cliente` — resposta de participante: chega ao Cliente e fica visível
 * apenas para quem escreveu. Um participante não vê a resposta de outro.
 */
export const VISIBILIDADES_MANIFESTACAO = [
  'participantes_e_cliente',
  'autor_e_cliente',
] as const
export type VisibilidadeManifestacao =
  (typeof VISIBILIDADES_MANIFESTACAO)[number]

/**
 * Quem enxerga cada etapa do checklist.
 *
 * `cliente` é etapa que o Cliente acompanha no portal; `interno` é organização
 * da equipe e não sai dela. A separação é a mesma ideia dos canais da conversa.
 */
export const VISIBILIDADES_CHECKLIST = ['cliente', 'interno'] as const
export type VisibilidadeChecklist = (typeof VISIBILIDADES_CHECKLIST)[number]

/**
 * De onde veio a etapa.
 *
 * `catalogo` é a cópia feita na contratação, `equipe` é a etapa criada dentro
 * do Atendimento e `solicitacao` é a que nasceu de um pedido formal ao Cliente.
 */
export const ORIGENS_ITEM_CHECKLIST = ['catalogo', 'equipe', 'solicitacao'] as const
export type OrigemItemChecklist = (typeof ORIGENS_ITEM_CHECKLIST)[number]

/** Teto de etapas por Atendimento: checklist é roteiro, não caderno. */
export const LIMITE_ITENS_CHECKLIST = 40

/**
 * Teto da observação final da conclusão.
 *
 * O mesmo do Protocolo: a observação vira manifestação formal lá, e um limite
 * maior aqui só produziria um texto que o Protocolo cortaria depois.
 */
export const TAMANHO_MAXIMO_OBSERVACAO_FINAL = 8000

/** Teto de arquivos escolhidos como entrega numa conclusão. */
export const LIMITE_ARQUIVOS_ENTREGA = 20

/** Eventos de histórico. Só fatos consumados entram aqui. */
export const TIPOS_EVENTO_ATENDIMENTO = {
  servicoContratado: 'servico_contratado',
  atendimentoCriado: 'atendimento_criado',
  responsavelDefinido: 'responsavel_definido',
  arquivoAnexado: 'arquivo_anexado',
  statusAlterado: 'status_alterado',
  prioridadeAlterada: 'prioridade_alterada',
  prazoDefinido: 'prazo_definido',
  protocoloAberto: 'protocolo_aberto',
  manifestacaoCliente: 'manifestacao_cliente',
  respostaProtocolo: 'resposta_protocolo',
  checklistCriado: 'checklist_criado',
  checklistItemAdicionado: 'checklist_item_adicionado',
  checklistItemConcluido: 'checklist_item_concluido',
  checklistItemReaberto: 'checklist_item_reaberto',
  checklistItemRemovido: 'checklist_item_removido',
  solicitacaoAoCliente: 'solicitacao_ao_cliente',
  atendimentoConcluido: 'atendimento_concluido',
  entregaFinalRegistrada: 'entrega_final_registrada',
  atendimentoAvaliado: 'atendimento_avaliado',
  ajusteSolicitado: 'ajuste_solicitado',
  ajusteAceito: 'ajuste_aceito',
  ajusteRecusado: 'ajuste_recusado',
  atendimentoReaberto: 'atendimento_reaberto',
  participanteAtribuido: 'participante_atribuido',
  participanteRemovido: 'participante_removido',
  conviteEnviado: 'convite_enviado',
  conviteAceito: 'convite_aceito',
  conviteRecusado: 'convite_recusado',
  conviteRevogado: 'convite_revogado',
  /**
   * O ciclo da Consultoria Agendada, no histórico do protocolo.
   *
   * Ficam aqui, e não numa tabela própria de consultoria, porque o Atendimento
   * já é a fonte histórica da plataforma: é onde o Cliente e o Profissional
   * procuram "o que aconteceu com isto". Eventos são imutáveis — remarcar
   * acrescenta uma linha, nunca reescreve a anterior, e é isso que permite
   * reconstruir a sequência inteira de horários pelos quais a consulta passou.
   */
  consultoriaRemarcada: 'consultoria_remarcada',
  consultoriaCancelada: 'consultoria_cancelada',
  consultoriaConcluida: 'consultoria_concluida',
} as const

export type TipoEventoAtendimento =
  (typeof TIPOS_EVENTO_ATENDIMENTO)[keyof typeof TIPOS_EVENTO_ATENDIMENTO]

/**
 * Categorias reais que a plataforma conhece hoje.
 *
 * O Atendimento guarda a categoria **do serviço**, sem tradução: `consultoria`
 * é Consultoria, e não um "Contábil" de conveniência. Categoria desconhecida
 * cai num rótulo neutro em vez de virar outra coisa.
 */
export const ROTULO_CATEGORIA_ATENDIMENTO: Record<string, string> = {
  contabil: 'Contábil',
  fiscal: 'Fiscal',
  juridico: 'Jurídico',
  societario: 'Societário',
  rh: 'RH',
  consultoria: 'Consultoria',
}

export function rotuloCategoria(categoria: string) {
  return (
    ROTULO_CATEGORIA_ATENDIMENTO[categoria] ??
    // Sem rótulo cadastrado, mostra a própria categoria capitalizada — é o dado
    // verdadeiro, e deixa visível que falta configuração.
    categoria.charAt(0).toUpperCase() + categoria.slice(1)
  )
}
