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
  /** Os instantes absolutos, em ISO — para ordenar e comparar sem ambiguidade. */
  inicioEm: string
  fimEm: string
  /** O identificador IANA. A tela o exibe quando pode fazer diferença. */
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  /** `agendada` (de pé) ou `cancelada` (desfeita, mas preservada). */
  status: string
  /**
   * O cancelamento, quando houve — os três dados juntos, ou nenhum.
   *
   * `canceladoPorPapel` é derivado no servidor comparando quem cancelou com as
   * partes do contrato, e não um rótulo gravado: assim a tela diz "cancelada
   * pelo profissional" sem inferir pela presença do motivo, que é opcional para
   * o Cliente.
   */
  canceladoEm: string | null
  canceladoPorPapel: 'cliente' | 'prestador' | null
  motivoCancelamento: string | null
  /** Quantas vezes mudou de horário. Zero na esmagadora maioria. */
  remarcacoes: number
  /** Quando o Profissional declarou a consultoria realizada. Nulo até lá. */
  concluidoEm: string | null
  /**
   * A avaliação do Cliente, quando já existe.
   *
   * Vem da mesma tabela que alimenta a reputação pública — não há uma segunda
   * nota para consultorias. Nula enquanto o Cliente não avaliou, e é essa
   * nulidade que a tela usa para escolher entre mostrar as estrelas e oferecer
   * o botão de avaliar.
   */
  avaliacao: { nota: number; comentario: string | null } | null
  /**
   * Já dá para concluir?
   *
   * Verdadeiro só depois do término contratado, e só enquanto a consultoria
   * está de pé. Calculado no servidor, com o relógio do servidor — e serve
   * para desenhar: a ação recheca tudo no clique.
   */
  podeConcluir: boolean
  /**
   * Já passou do prazo em que esta pessoa pode mexer?
   *
   * Calculado no servidor, com o relógio do servidor, e usado só para desenhar:
   * a autorização real acontece de novo no clique. Vem pronto para a tela não
   * precisar reimplementar a regra dos prazos — foi assim que a Etapa 8 evitou
   * que o botão prometesse o que a ação recusa.
   */
  podeAlterar: boolean
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
