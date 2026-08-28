import type { PapelDoCiclo } from '@/features/consultorias/constants/ciclo'
import { avaliarAlteracao } from '@/features/consultorias/lib/ciclo'
import {
  dataLocalDoInstante,
  horaDeMinutos,
  minutosLocaisDoInstante,
} from '@/features/consultorias/lib/tempo'
import { janelaDaVideochamada } from '@/features/videochamada/lib/janela'
import type { AtendimentoConsultoriaDTO } from '../types/atendimento'

/**
 * Monta o bloco de consultoria do Atendimento — ou `null`, que é o normal.
 *
 * ## Por que a janela é calculada aqui, no servidor
 *
 * Porque ela precisa ser **a mesma** que a ação de entrada aplica. Se a tela
 * recalculasse "dez minutos antes" por conta própria, bastaria alguém mudar a
 * constante num lado para o botão prometer um horário que o servidor recusa.
 * Vem daqui pronta, da mesma função, e a tela só compara com o relógio local
 * para decidir o que desenhar.
 *
 * Ela **não** autoriza nada: um navegador com o relógio adiantado desenha o
 * botão liberado e continua levando `fora_da_janela` no clique.
 *
 * As duas consultas de Atendimento — a do Cliente e a do Profissional —
 * compartilham esta função de propósito: os dois lados precisam ver a mesma
 * janela, e duplicar a conta seria autorizar que discordassem.
 */
export function consultoriaDoAtendimento(registro: {
  consultoriaId: string | null
  consultoriaInicioEm: Date | null
  consultoriaFimEm: Date | null
  consultoriaTimezone: string | null
  consultoriaDuracaoMinutos: number | null
  consultoriaStatus: string | null
  consultoriaMotivoCancelamento: string | null
  consultoriaValorCentavos: number | null
}, papel: PapelDoCiclo = 'prestador'): AtendimentoConsultoriaDTO | null {
  if (
    !registro.consultoriaId ||
    !registro.consultoriaInicioEm ||
    !registro.consultoriaFimEm
  ) {
    return null
  }

  const fuso = registro.consultoriaTimezone ?? 'America/Sao_Paulo'
  const janela = janelaDaVideochamada({
    inicioEm: registro.consultoriaInicioEm,
    fimEm: registro.consultoriaFimEm,
  })

  return {
    agendamentoId: registro.consultoriaId,
    status: registro.consultoriaStatus ?? 'agendada',
    motivoCancelamento: registro.consultoriaMotivoCancelamento,
    inicioEm: registro.consultoriaInicioEm.toISOString(),
    fimEm: registro.consultoriaFimEm.toISOString(),
    timezone: fuso,
    duracaoMinutos: registro.consultoriaDuracaoMinutos ?? 0,
    janelaAbreEm: janela.abreEm.toISOString(),
    janelaFechaEm: janela.fechaEm.toISOString(),
    data: dataLocalDoInstante(registro.consultoriaInicioEm, fuso),
    inicio: horaDeMinutos(
      minutosLocaisDoInstante(registro.consultoriaInicioEm, fuso),
    ),
    fim: horaDeMinutos(minutosLocaisDoInstante(registro.consultoriaFimEm, fuso)),
    valorCentavos: registro.consultoriaValorCentavos ?? 0,
    podeAlterar: avaliarAlteracao(
      { inicioEm: registro.consultoriaInicioEm, status: registro.consultoriaStatus ?? 'agendada' },
      papel,
      new Date(),
    ).pode,
    podeConcluir:
      papel === 'prestador' &&
      (registro.consultoriaStatus ?? 'agendada') === 'agendada' &&
      Date.now() >= registro.consultoriaFimEm.getTime(),
  }
}
