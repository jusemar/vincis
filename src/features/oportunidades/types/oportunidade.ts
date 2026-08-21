import type { EtapaComercial } from '@/features/pagamentos/lib/etapa-comercial'

/**
 * Formas de leitura das Oportunidades.
 *
 * Existem dois DTOs distintos, e a diferença entre eles **é** a regra de
 * privacidade escrita em tipo: o prestador enxerga a solicitação e a própria
 * proposta; o Cliente enxerga a solicitação e todas as propostas recebidas.
 * Não há um tipo único com campos opcionais justamente para que nenhuma tela
 * possa, por descuido, receber a lista alheia.
 */

/** Um anexo, no formato que a tela precisa para oferecer o download. */
export type AnexoOportunidadeDTO = {
  id: string
  nome: string
  tipoMime: string
  tamanhoBytes: number
  /** Rota autorizada. Nunca a URL do armazenamento. */
  url: string
}

/** Um passo da negociação, como as duas pontas o leem. */
export type ContrapropostaDTO = {
  id: string
  valorCentavos: number
  mensagem: string | null
  status: string
  criadoEm: string
  respondidaEm: string | null
}

/** A proposta que o próprio prestador enviou. Nunca a de outro. */
export type MinhaPropostaDTO = {
  id: string
  mensagem: string
  valorCentavos: number | null
  prazoEstimadoDias: number | null
  status: string
  criadoEm: string
  /** Validade comercial. Nula nas propostas anteriores a esta etapa. */
  validaAte: string | null
  /** Já venceu ou já foi aceita — em ambos os casos não aceita mais ação. */
  vigente: boolean
  valorAcordadoCentavos: number | null
  aceitaEm: string | null
  /** Aguardando resposta deste prestador, quando existir. */
  contrapropostaPendente: ContrapropostaDTO | null
  /** Rodadas anteriores, da mais antiga para a mais recente. */
  historicoContrapropostas: ContrapropostaDTO[]
}

/** Como o prestador vê uma oportunidade. */
export type OportunidadeParaPrestadorDTO = {
  id: string
  categoria: string
  especialidades: string[]
  titulo: string
  descricao: string
  abrangencia: string
  /** Referência informada pelo Cliente. Nulo = não informado. */
  valorPretendidoCentavos: number | null
  status: string
  criadoEm: string
  /** Fim do prazo global — o teto da validade de qualquer proposta. */
  expiraEm: string | null
  /**
   * Nome do Cliente — e só o nome.
   *
   * Telefone, WhatsApp, e-mail e endereço não são consultados nesta tela. O
   * contato é consequência da contratação, não da vitrine.
   */
  clienteNome: string
  /** O prestador marcou "não tenho interesse". Decisão dele, só dele. */
  dispensada: boolean
  /**
   * Pagamento e protocolo do acordo — **só para quem fechou**.
   *
   * Nulos para todos os demais prestadores, e não por filtro de tela: a
   * consulta nem devolve a linha da solicitação encerrada para quem não venceu.
   * O concorrente não descobre que houve acordo, por quanto, com quem, nem se
   * foi pago.
   */
  pagoEm: string | null
  valorPagoCentavos: number | null
  atendimento: AtendimentoDaOportunidadeDTO | null
  anexos: AnexoOportunidadeDTO[]
  /** A proposta deste prestador, quando já enviada. */
  minhaProposta: MinhaPropostaDTO | null
}

/**
 * O cartão público de quem propôs.
 *
 * Resolvido pelo relacionamento na hora de exibir, e não copiado para a
 * proposta: nome, avatar e reputação mudam com o tempo, e uma cópia congelada
 * mostraria ao Cliente um profissional que não existe mais assim. Só entra o
 * que já é público no perfil — nada de telefone, e-mail ou endereço.
 */
export type PerfilPublicoDaPropostaDTO = {
  nome: string
  avatarUrl: string | null
  /** Especialidade ou área principal, quando houver. */
  destaque: string | null
  /** Média em estrelas (0–5) e quantidade. Nula quando não há avaliação. */
  avaliacaoMedia: number | null
  totalAvaliacoes: number
  /** Rota do perfil público, montada pela plataforma. */
  perfilUrl: string
}

/** Uma proposta recebida, como o Cliente dono da oportunidade a vê. */
export type PropostaRecebidaDTO = {
  id: string
  prestadorId: string
  prestadorNome: string
  prestadorCidade: string | null
  prestadorEstado: string | null
  prestadorTipoProfissional: string | null
  perfilPublico: PerfilPublicoDaPropostaDTO
  mensagem: string
  valorCentavos: number | null
  prazoEstimadoDias: number | null
  status: string
  criadoEm: string
  validaAte: string | null
  /** Pode ser aceita ou contraposta agora? */
  vigente: boolean
  valorAcordadoCentavos: number | null
  aceitaEm: string | null
  contrapropostaPendente: ContrapropostaDTO | null
  historicoContrapropostas: ContrapropostaDTO[]
}

/**
 * O pagamento do acordo, como o Cliente o vê.
 *
 * `origem` viaja de propósito: enquanto ela disser `simulado`, a tela precisa
 * dizer isso também. Esconder a natureza do registro seria a única forma de o
 * Cliente confundir teste com cobrança.
 */
export type PagamentoDoAcordoDTO = {
  referencia: string
  valorCentavos: number
  aprovadoEm: string
  origem: string
}

/** O Atendimento que nasceu do acordo pago. */
export type AtendimentoDaOportunidadeDTO = {
  id: string
  protocolo: string
}

/** Como o Cliente vê a própria oportunidade. */
export type OportunidadeDoClienteDTO = {
  id: string
  categoria: string
  especialidades: string[]
  titulo: string
  descricao: string
  abrangencia: string
  valorPretendidoCentavos: number | null
  /** `aberta` | `expirada` | `encerrada` | `cancelada`, já derivado do prazo. */
  status: string
  criadoEm: string
  /** Fim do prazo global. Nulo nas solicitações anteriores a esta etapa. */
  expiraEm: string | null
  /** A solicitação ainda aceita aceite e contraproposta? */
  ativa: boolean
  anexos: AnexoOportunidadeDTO[]
  totalPropostas: number
  /**
   * Quantos prestadores marcaram "não tenho interesse".
   *
   * Só o número. Quem dispensou não é identificado ao Cliente: a decisão é
   * sobre a agenda do prestador, não sobre a pessoa que pediu orçamento.
   */
  totalSemInteresse: number
  propostas: PropostaRecebidaDTO[]
  /**
   * Etapa comercial derivada — ver `features/pagamentos/lib/etapa-comercial`.
   *
   * Não é uma segunda coluna de status: `status` responde "ainda recebe
   * propostas?" e esta responde "onde estamos no caminho até o Atendimento?".
   */
  etapa: EtapaComercial
  /** Pagamento aprovado, quando já houve. */
  pagamento: PagamentoDoAcordoDTO | null
  /** O Atendimento aberto pelo pagamento, quando já existe. */
  atendimento: AtendimentoDaOportunidadeDTO | null
}
