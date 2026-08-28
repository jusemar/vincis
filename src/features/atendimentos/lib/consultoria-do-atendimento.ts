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
}): AtendimentoConsultoriaDTO | null {
  if (
    !registro.consultoriaId ||
    !registro.consultoriaInicioEm ||
    !registro.consultoriaFimEm
  ) {
    return null
  }

  const janela = janelaDaVideochamada({
    inicioEm: registro.consultoriaInicioEm,
    fimEm: registro.consultoriaFimEm,
  })

  return {
    agendamentoId: registro.consultoriaId,
    inicioEm: registro.consultoriaInicioEm.toISOString(),
    fimEm: registro.consultoriaFimEm.toISOString(),
    timezone: registro.consultoriaTimezone ?? 'America/Sao_Paulo',
    duracaoMinutos: registro.consultoriaDuracaoMinutos ?? 0,
    janelaAbreEm: janela.abreEm.toISOString(),
    janelaFechaEm: janela.fechaEm.toISOString(),
  }
}
