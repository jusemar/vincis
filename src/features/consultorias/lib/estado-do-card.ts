import { type MesDaAgenda, compararMeses, somarMeses } from './mes'
import type { DataLocal } from './tempo'
import type { HorarioDisponivelDTO } from '../types/consultoria'

/**
 * As decisões de interface do card, fora do componente.
 *
 * Três regras vivem aqui, e não espalhadas por handlers de clique:
 *
 * 1. trocar de mês descarta a escolha inteira — o dia 14 de agosto não é o dia
 *    14 de setembro;
 * 2. escolher outro dia descarta o horário — 14:30 de terça não vale para
 *    quinta;
 * 3. o botão só habilita quando o horário escolhido ainda está na lista que o
 *    servidor devolveu.
 *
 * Todas puras, todas testáveis sem navegador. Esquecer qualquer uma delas
 * deixaria o botão habilitado apontando para um instante que o Cliente nunca
 * selecionou — que é o defeito que a etapa de contratação herdaria.
 *
 * **Nada aqui decide disponibilidade.** Quais dias e quais horários existem é
 * resposta do servidor; este módulo só cuida do que já foi escolhido.
 */

export type EstadoDoCard = {
  mes: MesDaAgenda
  data: DataLocal | null
  horario: string | null
}

export type LimitesDeMes = { minimo: MesDaAgenda; maximo: MesDaAgenda }

export function estadoInicial(mes: MesDaAgenda): EstadoDoCard {
  return { mes, data: null, horario: null }
}

/**
 * Para onde a seta leva, ou `null` quando ela não deveria levar a lugar nenhum.
 *
 * Devolver `null` em vez de deixar navegar e voltar vazio é o que mantém a seta
 * coerente com o que ela faz: fora dos limites, ela está desabilitada.
 */
export function mesNavegavel(
  mes: MesDaAgenda,
  passos: number,
  limites: LimitesDeMes,
): MesDaAgenda | null {
  const destino = somarMeses(mes, passos)
  if (compararMeses(destino, limites.minimo) < 0) return null
  if (compararMeses(destino, limites.maximo) > 0) return null
  return destino
}

export function podeNavegar(
  mes: MesDaAgenda,
  passos: number,
  limites: LimitesDeMes,
): boolean {
  return mesNavegavel(mes, passos, limites) !== null
}

export function trocarMes(
  estado: EstadoDoCard,
  destino: MesDaAgenda,
): EstadoDoCard {
  return estadoInicial(destino)
}

/**
 * Escolhe o dia. Dia indisponível não muda nada — nem a seleção anterior.
 *
 * O `disponivel` vem de fora porque quem sabe disso é a resposta do servidor.
 */
export function selecionarDia(
  estado: EstadoDoCard,
  data: DataLocal,
  disponivel: boolean,
): EstadoDoCard {
  if (!disponivel) return estado
  return { mes: estado.mes, data, horario: null }
}

export function selecionarHorario(
  estado: EstadoDoCard,
  inicio: string,
): EstadoDoCard {
  if (!estado.data) return estado
  return { ...estado, horario: inicio }
}

/** O horário escolhido, conferido contra a lista atual do servidor. */
export function horarioEscolhido(
  estado: EstadoDoCard,
  horarios: HorarioDisponivelDTO[],
): HorarioDisponivelDTO | undefined {
  if (!estado.data || !estado.horario) return undefined
  return horarios.find((horario) => horario.inicio === estado.horario)
}

/** A condição do botão `Agendar consultoria`: data **e** horário válidos. */
export function podeAgendar(
  estado: EstadoDoCard,
  horarios: HorarioDisponivelDTO[],
): boolean {
  return horarioEscolhido(estado, horarios) !== undefined
}
