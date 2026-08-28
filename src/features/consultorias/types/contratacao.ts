import type { ModalidadeConsultoria } from '../constants/consultoria'
import type { DataLocal } from '../lib/tempo'

/**
 * O resumo que o modal mostra — todo ele recalculado no servidor.
 *
 * É a resposta do servidor à pergunta "o que exatamente estou contratando?".
 * Nenhum campo aqui foi enviado pelo navegador, exceto a `descricao`, que é
 * texto da própria pessoa e volta só para a tela reexibi-lo.
 */
export type ResumoContratacaoDTO = {
  prestadorId: string
  prestadorNome: string
  consultoriaId: string
  titulo: string
  modalidade: ModalidadeConsultoria
  data: DataLocal
  inicio: string
  fim: string
  /** Os mesmos horários como instante absoluto — é o que a reserva grava. */
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  descricao: string
  clienteNome: string
}

/**
 * As respostas possíveis de `prepararContratacaoConsultoria`.
 *
 * União discriminada em vez de `{ sucesso, mensagem }` porque a tela reage de
 * forma diferente a cada caso — uma abre o login, outra manda escolher outro
 * horário, outra apenas informa. Com um booleano, essa decisão viraria
 * comparação de string de mensagem, que é como um texto reescrito quebra um
 * fluxo silenciosamente.
 */
export type ResultadoPreparacao =
  | { situacao: 'pronto'; resumo: ResumoContratacaoDTO }
  | { situacao: 'precisa_entrar'; mensagem: string }
  | { situacao: 'conta_nao_confirmada'; mensagem: string }
  | { situacao: 'conta_bloqueada'; mensagem: string }
  | { situacao: 'perfil_nao_pode_contratar'; mensagem: string }
  | { situacao: 'horario_indisponivel'; mensagem: string }
  | { situacao: 'dados_invalidos'; mensagem: string }

/** A reserva temporária como a tela precisa dela. */
export type ReservaDTO = {
  id: string
  /** Data local e horas já formatadas no fuso da agenda. */
  data: DataLocal
  inicio: string
  fim: string
  timezone: string
  inicioEm: Date
  fimEm: Date
  /** A autoridade do contador regressivo. Quem decide se venceu é o servidor. */
  expiraEm: Date
  duracaoMinutos: number
  valorCentavos: number
}

/** Toda resposta de `prepararContratacaoConsultoria` que não é "pronto". */
export type RecusaDeContratacao = Exclude<
  ResultadoPreparacao,
  { situacao: 'pronto' }
>

/**
 * As respostas de `reservarHorarioDaConsultoria`.
 *
 * Reaproveita as recusas da preparação porque são exatamente as mesmas — quem
 * não podia seguir para o pagamento também não pode reservar. `jaExistia`
 * distingue "acabei de reservar" de "você já tinha esta reserva": o segundo
 * caso é o clique duplo, o retry e o F5, e nele o relógio original é mantido.
 */
export type ResultadoReserva =
  | {
      situacao: 'reservado'
      resumo: ResumoContratacaoDTO
      reserva: ReservaDTO
      jaExistia: boolean
    }
  | RecusaDeContratacao

/**
 * As respostas de `pagarConsultoriaSimulado`.
 *
 * `confirmado` com `novo: false` é o F5 e o retry: a contratação já existia e a
 * resposta é a mesma de antes, com o mesmo protocolo. `recusado` carrega o
 * prazo restante porque a reserva continua de pé — o Cliente pode tentar de
 * novo enquanto ela durar.
 */
export type ResultadoPagamentoConsultoria =
  | {
      situacao: 'confirmado'
      novo: boolean
      agendamentoId: string
      atendimentoId: string
      protocolo: string
      referencia: string
      valorCentavos: number
      data: DataLocal
      inicio: string
      fim: string
      timezone: string
      duracaoMinutos: number
    }
  | { situacao: 'recusado'; mensagem: string; expiraEm: Date }
  | { situacao: 'reserva_expirada'; mensagem: string }
  | { situacao: 'precisa_entrar'; mensagem: string }
  | { situacao: 'conta_nao_confirmada'; mensagem: string }
  | { situacao: 'dados_invalidos'; mensagem: string }
  | { situacao: 'falhou'; mensagem: string }
