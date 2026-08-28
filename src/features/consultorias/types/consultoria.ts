import type { ModalidadeConsultoria, TipoExcecao } from '../constants/consultoria'
import type { DataLocal } from '../lib/tempo'

/**
 * Formas que atravessam a fronteira do servidor.
 *
 * O que **não** está aqui é tão deliberado quanto o que está: o `motivo` de uma
 * exceção é anotação interna do Profissional ("consulta médica", "audiência do
 * processo X") e nunca acompanha a agenda pública. O Cliente precisa saber que
 * o horário não existe, não por quê.
 */

/** A consultoria como o perfil público a enxerga. */
export type ConsultoriaPublicaDTO = {
  id: string
  prestadorId: string
  titulo: string
  descricaoCurta: string
  modalidade: ModalidadeConsultoria
  valorCentavos: number
  duracaoMinutos: number
  timezone: string
  /** Necessários para a tela saber até onde navegar e o que já está fora. */
  horizonteDias: number
  antecedenciaMinimaMinutos: number
}

/** Um dia com pelo menos um horário livre. */
export type DiaDisponivelDTO = {
  data: DataLocal
  totalSlots: number
}

/** Um horário contratável. `HH:MM` para a tela, instante para o servidor. */
export type HorarioDisponivelDTO = {
  inicio: string
  fim: string
  inicioEm: Date
  fimEm: Date
}

/**
 * Resposta das consultas de agenda.
 *
 * `consultoria: null` é informação, não erro: significa "este Profissional não
 * tem consultoria configurada e ativa". A tela mostra ausência — nunca um preço
 * ou uma disponibilidade inventados.
 */
export type AgendaDeDiasDTO = {
  consultoria: ConsultoriaPublicaDTO | null
  dias: DiaDisponivelDTO[]
}

/**
 * Um mês do calendário público.
 *
 * `hoje` e `ultimoDia` são as bordas da navegação, resolvidas **no fuso da
 * agenda**. Sem eles o navegador teria de adivinhar o dia corrente do
 * Profissional a partir do próprio relógio — que é a origem clássica do dia
 * que aparece habilitado num fuso e desabilitado em outro. Nulos quando não há
 * consultoria: não existe agenda para limitar.
 */
export type AgendaDoMesDTO = {
  consultoria: ConsultoriaPublicaDTO | null
  mes: { ano: number; mes: number }
  dias: DiaDisponivelDTO[]
  hoje: DataLocal | null
  ultimoDia: DataLocal | null
}

export type AgendaDoDiaDTO = {
  consultoria: ConsultoriaPublicaDTO | null
  data: DataLocal
  horarios: HorarioDisponivelDTO[]
}

/** A configuração como o próprio Profissional a edita. */
export type ConsultoriaDoPrestadorDTO = ConsultoriaPublicaDTO & {
  intervaloMinutos: number
  ativa: boolean
  faixas: FaixaSemanalDoPrestadorDTO[]
  excecoes: ExcecaoDoPrestadorDTO[]
}

export type FaixaSemanalDoPrestadorDTO = {
  id: string
  diaSemana: number
  horaInicio: string
  horaFim: string
}

export type ExcecaoDoPrestadorDTO = {
  id: string
  data: DataLocal
  tipo: TipoExcecao
  horaInicio: string | null
  horaFim: string | null
  /** Só aparece para o dono da agenda. Nunca na consulta pública. */
  motivo: string | null
}

/**
 * O que o Cliente escolheu no card.
 *
 * Estado de interface, e nada além disso: nesta etapa selecionar não reserva
 * nem grava. A forma já carrega tudo que a contratação vai precisar — quem,
 * quando, por quanto tempo e por quanto —, para que a etapa do modal não
 * precise refazer as consultas nem confiar em valores remontados no navegador.
 * O servidor, quando a hora chegar, revalida tudo isto de qualquer forma.
 */
export type SelecaoDeConsultoria = {
  prestadorId: string
  consultoriaId: string
  titulo: string
  /** Data local da agenda, `AAAA-MM-DD`. */
  data: DataLocal
  /** `HH:MM` no fuso da agenda. */
  inicio: string
  fim: string
  /** Os mesmos horários como instante absoluto. */
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  modalidade: ModalidadeConsultoria
}
