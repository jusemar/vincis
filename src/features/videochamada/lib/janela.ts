import {
  MINUTOS_ANTES_DA_CONSULTORIA,
  MINUTOS_DE_TOLERANCIA,
  type SituacaoDaJanela,
} from '../constants/videochamada'

/**
 * A janela de acesso, calculada só com instantes absolutos.
 *
 * ## Por que não há fuso nenhum aqui
 *
 * Porque a decisão "pode entrar agora?" é uma comparação entre dois pontos na
 * linha do tempo, e pontos na linha do tempo não têm fuso. `inicio_em` já é o
 * instante correto — foi gravado assim quando a reserva prendeu o horário. O
 * `timezone` da consultoria serve para *escrever* "14:30" na tela; se ele
 * entrasse nesta conta, uma consultoria de São Paulo passaria a abrir em outro
 * momento conforme o servidor da Vercel estivesse em UTC ou não.
 *
 * ## Por que `fim_em` e não a duração de agora
 *
 * `fim_em` é o fim contratado, congelado no ato da compra. Recalcular a partir
 * da configuração atual do Profissional deixaria a janela de uma consultoria já
 * vendida mudar de tamanho porque ele mexeu na agenda depois.
 */
export type JanelaDaVideochamada = {
  /** Quando a entrada libera: `inicio_em` menos 10 minutos. */
  abreEm: Date
  /** Quando a entrada fecha: `fim_em` mais 15 minutos. */
  fechaEm: Date
}

const UM_MINUTO = 60_000

export function janelaDaVideochamada(consultoria: {
  inicioEm: Date
  fimEm: Date
}): JanelaDaVideochamada {
  return {
    abreEm: new Date(
      consultoria.inicioEm.getTime() - MINUTOS_ANTES_DA_CONSULTORIA * UM_MINUTO,
    ),
    fechaEm: new Date(
      consultoria.fimEm.getTime() + MINUTOS_DE_TOLERANCIA * UM_MINUTO,
    ),
  }
}

/**
 * Em que estado a janela está no instante `agora`.
 *
 * ## A fronteira, escolhida de propósito
 *
 * O intervalo é **fechado no início e aberto no fim**: `abreEm <= agora <
 * fechaEm`.
 *
 * - `14:19:59` → `antes`; `14:20:00` → `aberta` (o minuto prometido vale desde
 *   o primeiro instante dele);
 * - `15:44:59` → `aberta`; `15:45:00` → `encerrada`.
 *
 * Fechar no fim faria a tolerância durar "15 minutos e um instante", e um
 * intervalo meio-aberto é o único jeito de dois períodos consecutivos nunca se
 * sobreporem. É a mesma convenção que o gerador de horários da agenda usa.
 */
export function situacaoDaJanela(
  janela: JanelaDaVideochamada,
  agora: Date,
): SituacaoDaJanela {
  if (agora.getTime() < janela.abreEm.getTime()) return 'antes'
  if (agora.getTime() >= janela.fechaEm.getTime()) return 'encerrada'
  return 'aberta'
}

/** Atalho para quem só precisa do sim/não. */
export function janelaAberta(
  consultoria: { inicioEm: Date; fimEm: Date },
  agora: Date,
): boolean {
  return situacaoDaJanela(janelaDaVideochamada(consultoria), agora) === 'aberta'
}

/** Segundos até a janela abrir. Zero quando já abriu. Alimenta a contagem da tela. */
export function segundosAteAbrir(
  janela: JanelaDaVideochamada,
  agora: Date,
): number {
  return Math.max(
    0,
    Math.ceil((janela.abreEm.getTime() - agora.getTime()) / 1000),
  )
}
