/**
 * Status operacionais do quadro.
 *
 * `recusado` e `cancelado` são estados de encerramento excepcional: existem no
 * fluxo, mas não ocupam coluna no Kanban — ficam acessíveis pelo filtro de
 * Status e pela visualização em lista, para não alargar a tela aprovada.
 */
export type Status =
  | "novo"
  | "andamento"
  | "aguardando-cliente"
  | "aguardando-assinatura"
  | "concluido"
  | "recusado"
  | "cancelado";
export type Priority = "alta" | "media" | "baixa";
export type Deadline = "normal" | "proximo" | "vencido";
/**
 * Categoria exibida no badge.
 *
 * É o rótulo real da categoria do serviço, não uma tradução para um conjunto
 * fechado: `Consultoria` continua sendo Consultoria. As cinco conhecidas ficam
 * declaradas porque têm cor própria; qualquer outra é aceita e cai no estilo
 * neutro do mesmo design system.
 */
export type Category =
  | "Fiscal"
  | "RH"
  | "Jurídico"
  | "Societário"
  | "Contábil"
  | (string & {});
export type Access = "privado" | "compartilhado";

export interface Assignee {
  id: string;
  name: string;
  initials: string;
  color: string;
}

/**
 * Origem do card exibido no Kanban.
 *
 * `mock` são os cards de demonstração que ainda vivem em constantes; `real` são
 * Atendimentos persistidos no banco. Enquanto os dois convivem na mesma tela,
 * este campo é o que separa um do outro — e é também o gancho para remover os
 * mocks depois sem tocar em mais nada.
 */
export type ProtocolOrigin = "mock" | "real";

/** Arquivo realmente anexado ao Atendimento. `url` é a rota autorizada. */
export interface RealFile {
  id: string;
  name: string;
  typeLabel: string;
  sizeLabel: string;
  dateLabel: string;
  senderLabel: string;
  url: string;
  /** Marcado como entrega final na conclusão do Atendimento. */
  isDelivery: boolean;
}

/**
 * O fecho do Atendimento, quando já houve um.
 *
 * Vem das colunas do próprio Atendimento — data, autor e observação —, e não de
 * uma leitura do histórico. O painel usa isto para dizer, na aba Informações e
 * na de Arquivos, o que foi entregue e por quem.
 */
export interface RealConclusion {
  atLabel: string;
  byName: string | null;
  note: string | null;
  filesCount: number;
}

/** Evento verdadeiro do histórico, com data real. */
export interface RealEvent {
  id: string;
  text: string;
  time: string;
}

/** Mensagem real da conversa. `internal` separa o canal da equipe. */
export interface RealMessage {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  time: string;
  internal: boolean;
  /** Escrita pela pessoa logada — alinha a bolha à direita, como no mock. */
  me: boolean;
}

/**
 * Uma linha do Protocolo, já recortada pelo servidor.
 *
 * O que chega aqui é só o que a pessoa logada pode ler: a manifestação do
 * Cliente e as respostas dela própria. A resposta de outro participante não
 * viaja até esta tela.
 */
export interface RealManifestation {
  id: string;
  author: string;
  initials: string;
  color: string;
  text: string;
  time: string;
  /** Manifestação do Cliente (a solicitação) ou resposta de um participante. */
  fromClient: boolean;
  /** Escrita pela pessoa logada. */
  me: boolean;
  answersId: string | null;
  attachment: { name: string } | null;
}

/**
 * Etapa real do checklist do Atendimento.
 *
 * `internal` marca a etapa que é organização da equipe: ela aparece no painel
 * com a marca de interna e não é enviada para o portal do Cliente.
 */
export interface RealChecklistItem {
  id: string;
  label: string;
  done: boolean;
  internal: boolean;
  origin: "catalogo" | "equipe" | "solicitacao";
}

/** Transição oferecida no painel, vinda da máquina de estados do servidor. */
export interface RealAction {
  rotulo: string;
  destino: string;
  encerra: boolean;
}

/**
 * Informações reais da contratação por trás do Atendimento.
 *
 * Campos que ainda não existem no backend ficam `null` de propósito: a tela
 * mostra o estado vazio em vez de inventar um valor plausível.
 */
export interface RealInfo {
  protocol: string;
  service: string;
  client: string;
  /** Código da carteira (`CLI-XXXXXXXX`), quando o Cliente tem ficha. */
  clientCode: string | null;
  priceLabel: string | null;
  priceModelLabel: string | null;
  hiredAtLabel: string | null;
  deadlineLabel: string | null;
  /**
   * Prazo em `aaaa-mm-dd`, do jeito que o `<input type="date">` precisa.
   *
   * Fica ao lado do rótulo formatado porque são usos diferentes: um é para ler,
   * o outro é para editar. Nulo quando o Atendimento está sem prazo definido.
   */
  deadlineDate: string | null;
  statusLabel: string;
  responsibleName: string;
  /**
   * Id do responsável atual.
   *
   * Passou a importar quando os participantes viraram reais: a lista "Equipe
   * com acesso" precisa distinguir quem responde pelo Atendimento de quem foi
   * atribuído ou aceitou um convite — antes rotulava todo mundo de Responsável.
   */
  responsibleId: string;
}

/**
 * Leitura real da Conversa, por canal.
 *
 * É o que dá sentido à pílula vermelha nos Atendimentos reais: o número vem do
 * que **esta** pessoa ainda não leu, e `canalPrimeira`/`primeiraNaoLidaId` são
 * o que permite ao clique abrir a aba certa e rolar até a mensagem certa.
 */
export interface RealUnread {
  cliente: number;
  interno: number;
  total: number;
  canalPrimeira: "cliente" | "interno" | null;
  primeiraNaoLidaId: string | null;
}

/**
 * Solicitação de ajuste do Cliente sobre o Atendimento concluído.
 *
 * Aparece no Protocolo do painel — é lá que a manifestação formal dela foi
 * registrada — e é por ali que quem responde pelo Atendimento decide. Não é
 * card do Kanban, não é coluna nova e não é outro Atendimento: enquanto está
 * `pendente`, o protocolo continua exatamente onde estava.
 */
export interface RealAdjustment {
  id: string;
  status: "pendente" | "aceita" | "recusada" | "encerrada";
  statusLabel: string;
  reason: string;
  /** Resposta de quem analisou. Nula enquanto o pedido está pendente. */
  answer: string | null;
  requesterName: string;
  reviewerName: string | null;
  reviewedAtLabel: string | null;
  createdAtLabel: string;
  /** Anexo do Cliente. `url` é a mesma rota autorizada dos demais arquivos. */
  attachment: { name: string; url: string } | null;
}

export interface RealProtocolData {
  atendimentoId: string;
  info: RealInfo;
  files: RealFile[];
  events: RealEvent[];
  messages: RealMessage[];
  /** Protocolo — separado da Conversa, sem nenhum dado em comum. */
  manifestations: RealManifestation[];
  /** Checklist real, na ordem definida pela equipe. */
  checklist: RealChecklistItem[];
  actions: RealAction[];
  unread: RealUnread;
  /** Nulo enquanto o Atendimento não foi concluído. */
  conclusion: RealConclusion | null;
  /** Solicitação de ajuste mais recente. Nula quando nunca houve uma. */
  adjustment: RealAdjustment | null;
}

export interface Protocol {
  id: string;
  number: string;
  title: string;
  client: string;
  /**
   * Código do Cliente na carteira (`CLI-XXXXXXXX`).
   *
   * A busca procura por ele além do nome e do protocolo: digitar o código traz
   * todos os atendimentos daquele Cliente. Ausente nos mocks, que não têm ficha.
   */
  clientCode?: string | null;
  category: Category;
  priority: Priority;
  deadline: Deadline;
  deadlineLabel: string;
  status: Status;
  messages: number;
  files: number;
  /**
   * Mensagens ainda não lidas — a pílula vermelha do card.
   *
   * Nos Atendimentos reais vem de `atendimento_leituras`, calculado para a
   * pessoa logada. Nos mocks continua sendo o número estático de sempre, que é
   * o que permite comparar as duas origens lado a lado nesta fase. Ausente ou
   * zero, o card não desenha a pílula.
   */
  unread?: number;
  access: Access;
  assignees: Assignee[];
  progress?: { done: number; total: number };
  description?: string;
  createdAt: string;
  /** Última movimentação. Nos mocks não existe: a lista cai em `createdAt`. */
  updatedAtLabel?: string;
  /** Ausente nos mocks, que são a maioria hoje. */
  origin?: ProtocolOrigin;
  /** Só existe quando `origin === "real"`. */
  real?: RealProtocolData;
}

/**
 * Onde o painel deve abrir.
 *
 * Existe porque abrir um Atendimento passou a ter mais de um destino: o clique
 * comum no card mostra o que sempre mostrou, mas o clique na pílula vermelha —
 * e o clique numa notificação — precisam cair numa aba, num canal e às vezes
 * numa mensagem específica.
 */
export interface FocoDoPainel {
  aba: "protocolo" | "conversa" | "arquivos" | "historico" | "info";
  canal?: "cliente" | "interno";
  /** Mensagem a destacar e para a qual rolar. Nulo quando não há alvo. */
  mensagemId?: string | null;
}

export interface ColumnDef {
  id: Status;
  title: string;
  accent: string;
}

export interface FiltersState {
  status: Status[];
  priority: Priority[];
  category: Category[];
  access: Access[];
  deadline: ("vencido" | "proximo" | "normal")[];
  assignee: string[];
  dateFrom: string;
  dateTo: string;
}

export interface NewProtocolData {
  client: string;
  category: Category;
  title: string;
  description: string;
  priority: Priority;
  deadline: string;
  access: Access;
  assignees: Assignee[];
  checklist: string[];
  files: { name: string; size: string }[];
}