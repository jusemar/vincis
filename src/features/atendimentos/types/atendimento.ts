import type {
  AcessoAtendimento,
  FinalidadeArquivo,
  OrigemItemChecklist,
  VisibilidadeChecklist,
  EscopoMensagem,
  OrigemArquivo,
  PapelManifestacao,
  PapelParticipante,
  PrioridadeAtendimento,
  StatusAtendimento,
} from '../constants/atendimento'

/**
 * Uma linha do Protocolo.
 *
 * Chega ao navegador **já filtrada** pelo servidor: o que a pessoa não pode
 * ler não é selecionado, e por isso não existe neste objeto para ser
 * descoberto por quem inspecionar a página.
 */
export type AtendimentoManifestacaoDTO = {
  id: string
  papelAutor: PapelManifestacao
  conteudo: string
  autorId: string
  autorNome: string
  /** Esta linha é de quem está lendo. */
  autoria: boolean
  respondeManifestacaoId: string | null
  arquivo: { id: string; nome: string } | null
  criadoEm: string
}

/**
 * Uma etapa do checklist do Atendimento.
 *
 * A lista do Cliente traz só as etapas públicas — a etapa interna não é
 * selecionada na consulta dele e por isso não existe no objeto que chega ao
 * navegador.
 */
export type AtendimentoChecklistItemDTO = {
  id: string
  titulo: string
  concluido: boolean
  visibilidade: VisibilidadeChecklist
  origem: OrigemItemChecklist
  ordem: number
}

export type AtendimentoMensagemDTO = {
  id: string
  escopo: EscopoMensagem
  conteudo: string
  autorId: string
  autorNome: string
  /** O autor é o Cliente proprietário do Atendimento. */
  autorEhCliente: boolean
  criadoEm: string
}

/** Datas viajam como ISO: o DTO atravessa a fronteira servidor → cliente. */
export type AtendimentoArquivoDTO = {
  id: string
  nome: string
  tipoMime: string
  tamanhoBytes: number
  origem: OrigemArquivo
  /** `entrega_final` é o documento que fecha o serviço. */
  finalidade: FinalidadeArquivo
  remetenteNome: string
  criadoEm: string
}

/**
 * O fecho do Atendimento, quando já houve um.
 *
 * Vem das colunas do próprio Atendimento, e não de uma leitura do histórico: é o
 * que permite ao portal do Cliente mostrar data, autor e observação sem precisar
 * encontrar — e interpretar — a linha certa da linha do tempo.
 */
export type ConclusaoDoAtendimentoDTO = {
  em: string
  /** Quem concluiu. Pode não ser o responsável principal. */
  porNome: string | null
  observacaoFinal: string | null
  /** Quantos arquivos foram marcados como entrega final. */
  arquivosDeEntrega: number
}

export type AtendimentoEventoDTO = {
  id: string
  tipo: string
  descricao: string
  criadoEm: string
}

/**
 * O que esta pessoa ainda não leu na Conversa deste Atendimento.
 *
 * Por canal, porque o clique no badge precisa saber qual aba abrir — e o total,
 * porque o card mostra um número só. Mensagem escrita pela própria pessoa nunca
 * entra na conta.
 */
export type NaoLidasDoAtendimentoDTO = {
  cliente: number
  interno: number
  total: number
  /** Canal onde está a primeira não lida. Nulo quando não há nenhuma. */
  canalPrimeira: 'cliente' | 'interno' | null
  primeiraNaoLidaId: string | null
}

export type AtendimentoParticipanteDTO = {
  usuarioId: string
  nome: string
  papel: PapelParticipante
}

/** Dados da contratação de origem. Nulo quando o Atendimento nasceu sem uma. */
export type AtendimentoContratacaoDTO = {
  id: string
  nomeServico: string
  modeloPreco: string
  valorCentavos: number | null
  prazoEstimadoDias: number | null
  status: string
  criadaEm: string
}

export type AtendimentoOperacionalDTO = {
  id: string
  protocolo: string
  titulo: string
  categoria: string
  status: StatusAtendimento
  prioridade: PrioridadeAtendimento
  acesso: AcessoAtendimento
  criadoEm: string
  atualizadoEm: string
  prazoEm: string | null
  responsavel: { id: string; nome: string }
  /**
   * O Cliente do Atendimento.
   *
   * `codigo` é o identificador da carteira (`CLI-XXXXXXXX`) — o mesmo que a
   * tela de Clientes mostra. É por ele que a busca encontra todos os
   * protocolos de uma pessoa sem depender de como o nome foi digitado. Nulo
   * quando o Atendimento não está ligado a uma ficha de carteira.
   */
  cliente: { usuarioId: string; nome: string; codigo: string | null }
  contratacao: AtendimentoContratacaoDTO | null
  participantes: AtendimentoParticipanteDTO[]
  eventos: AtendimentoEventoDTO[]
  mensagens: AtendimentoMensagemDTO[]
  /** Protocolo, no recorte de quem consultou. */
  manifestacoes: AtendimentoManifestacaoDTO[]
  /** Checklist completo: etapas públicas e internas. */
  checklist: AtendimentoChecklistItemDTO[]
  arquivos: AtendimentoArquivoDTO[]
  /** Transições disponíveis a partir do status atual. */
  acoes: { rotulo: string; destino: StatusAtendimento; encerra: boolean }[]
  /** Nulo enquanto o serviço está em execução. */
  conclusao: ConclusaoDoAtendimentoDTO | null
  /** Leitura da Conversa, do ponto de vista de quem consultou. */
  naoLidas: NaoLidasDoAtendimentoDTO
}

/**
 * O que o Cliente enxerga do próprio Atendimento.
 *
 * É um DTO à parte, e não o de cima com campos escondidos: assim nenhuma nota
 * interna ou dado de equipe chega a existir no objeto que atravessa para o
 * navegador do Cliente.
 */
export type AtendimentoDoClienteDTO = {
  id: string
  protocolo: string
  titulo: string
  categoria: string
  status: StatusAtendimento
  /**
   * Prioridade decidida pela equipe.
   *
   * Chega ao Cliente como informação, nunca como controle: ele acompanha em que
   * fila o serviço dele está, mas quem move a fila é quem executa.
   */
  prioridade: PrioridadeAtendimento
  criadoEm: string
  prazoEm: string | null
  prestador: { nome: string }
  contratacao: AtendimentoContratacaoDTO | null
  eventos: AtendimentoEventoDTO[]
  mensagens: AtendimentoMensagemDTO[]
  /** O Cliente lê o Protocolo inteiro: as próprias manifestações e todas as respostas. */
  manifestacoes: AtendimentoManifestacaoDTO[]
  /** Só as etapas públicas: o roteiro interno da equipe não vem para cá. */
  checklist: AtendimentoChecklistItemDTO[]
  arquivos: AtendimentoArquivoDTO[]
  /** A entrega, quando o serviço já foi concluído. Nulo enquanto não foi. */
  conclusao: ConclusaoDoAtendimentoDTO | null
}
