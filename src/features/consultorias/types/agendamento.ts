/**
 * As consultorias contratadas, na forma que as áreas autenticadas consomem.
 *
 * Dois DTOs em vez de um, e a diferença entre eles é deliberada: o do
 * Profissional carrega a `descricao` — o assunto que o Cliente escreveu, que é
 * exatamente o que ele precisa para se preparar — e o do Cliente não. Não é
 * sigilo em relação a quem escreveu; é que o texto já vive dentro do Protocolo
 * do Atendimento, e repeti-lo em três telas criaria três lugares para ele
 * divergir. Uma consulta que devolvesse os dois formatos obrigaria cada tela a
 * lembrar de não renderizar o campo que não é dela.
 */

/** Campos comuns às duas visões. Horas de parede no fuso da consultoria. */
type BaseDoAgendamento = {
  id: string
  /** `AAAA-MM-DD` no fuso gravado na consultoria. */
  data: string
  /** `HH:MM` no mesmo fuso. */
  inicio: string
  fim: string
  /** O instante absoluto, em ISO — para ordenar e comparar sem ambiguidade. */
  inicioEm: string
  /** O identificador IANA. A tela o exibe quando pode fazer diferença. */
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  /** `agendada` é o único estado desta fase. */
  status: string
  /** `aprovado`, ou `null` enquanto não houver pagamento vinculado. */
  pagamentoStatus: string | null
  /** O Atendimento operacional. Nulo só num vínculo quebrado. */
  atendimentoId: string | null
  /** `#AAAA-NNNN`. É por ele que a Área do Cliente abre o Atendimento. */
  protocolo: string | null
}

export type ConsultoriaDoClienteDTO = BaseDoAgendamento & {
  prestadorNome: string
}

export type ConsultoriaDoPrestadorDTO2 = BaseDoAgendamento & {
  clienteNome: string
  /** O assunto completo, sem corte. Quem trunca é a tela. */
  descricao: string
}
