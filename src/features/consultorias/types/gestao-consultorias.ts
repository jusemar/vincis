/**
 * O que a Gestão enxerga de uma Consultoria Agendada.
 *
 * Repare no que **não** existe neste tipo: `descricao`. O assunto que o Cliente
 * escreveu não tem campo aqui — não é filtrado na tela, é ausente da estrutura.
 * Um campo opcional convidaria alguém a preenchê-lo um dia; a ausência não.
 *
 * Também não há `dailyRoomName`, `token` nem qualquer credencial: a
 * videochamada aparece como estado técnico (`salaCriada`) e janela de horário.
 */
export type ConsultoriaGestaoDTO = {
  id: string
  /** `AAAA-MM-DD` e `HH:MM` no fuso contratado. */
  data: string
  inicio: string
  fim: string
  inicioEm: string
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  status: string
  remarcacoes: number
  criadoEm: string
  atualizadoEm: string
  clienteNome: string
  prestadorNome: string
  prestadorId: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
  pagamentoReferencia: string | null
  avaliacaoNota: number | null
  /** Se a sala já foi provisionada. O nome dela nunca atravessa. */
  temSala: boolean
  /** Inconsistências estruturais, derivadas na leitura. Vazio é o normal. */
  problemas: string[]
}

export type DetalheConsultoriaGestaoDTO = ConsultoriaGestaoDTO & {
  servico: string
  canceladoEm: string | null
  motivoCancelamento: string | null
  concluidoEm: string | null
  remarcadoEm: string | null
  pagamento: {
    status: string
    referencia: string | null
    origem: string
    valorCentavos: number
    aprovadoEm: string
  } | null
  avaliacaoComentario: string | null
  videochamada: {
    salaCriada: boolean
    salaCriadaEm: string | null
    janelaAbreEm: string
    janelaFechaEm: string
  }
  /** O histórico técnico do Atendimento. Nunca mensagens nem arquivos. */
  eventos: { id: string; tipo: string; descricao: string; criadoEm: string }[]
}

export type IndicadoresConsultoriasDTO = {
  total: number
  agendadas: number
  concluidas: number
  canceladas: number
  proximas: number
  valorTotalCentavos: number
  avaliacoes: number
  mediaAvaliacoes: number | null
  comProblema: number
}
