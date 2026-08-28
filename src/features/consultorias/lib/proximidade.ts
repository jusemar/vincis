import { janelaAberta } from '@/features/videochamada/lib/janela'
import { dataLocalDoInstante } from './tempo'

/**
 * "Amanhã", "Hoje", "Em breve", "Videochamada disponível".
 *
 * ## Por que isto não é o cron
 *
 * Porque é apresentação, e apresentação não se agenda. O cron manda notificação
 * — um fato que sai uma vez e fica registrado. Isto aqui é o rótulo que a tela
 * desenha a cada render a partir do relógio de quem está olhando; agendar isso
 * significaria a tela mostrar "Hoje" até alguém rodar uma rotina.
 *
 * ## Por que "amanhã" é uma comparação de datas locais
 *
 * Porque 23h de hoje e 1h de amanhã distam duas horas e são dias diferentes.
 * Comparar instantes acertaria a distância e erraria o dia — que é justamente o
 * que a pessoa quer saber ao ler "amanhã".
 *
 * ## O rótulo não abre porta nenhuma
 *
 * "Videochamada disponível" é desenho: quem autoriza a entrada continua sendo o
 * servidor, com a janela da Etapa 8. Um navegador com o relógio adiantado
 * desenha o rótulo e leva `fora_da_janela` no clique.
 */

export const PROXIMIDADES = [
  'disponivel',
  'em_breve',
  'hoje',
  'amanha',
  'distante',
  'passada',
] as const
export type Proximidade = (typeof PROXIMIDADES)[number]

export const ROTULO_PROXIMIDADE: Record<Proximidade, string> = {
  disponivel: 'Videochamada disponível',
  em_breve: 'Em breve',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  distante: '',
  passada: '',
}

/** "Em breve" começa uma hora antes — perto o bastante para largar o que se está fazendo. */
const LIMIAR_EM_BREVE_MS = 60 * 60_000

export function proximidadeDaConsultoria(
  consultoria: { inicioEm: Date; fimEm: Date; timezone: string },
  agora: Date,
): Proximidade {
  // A porta aberta manda em tudo: é a informação mais acionável que existe.
  if (janelaAberta(consultoria, agora)) return 'disponivel'
  if (consultoria.fimEm.getTime() <= agora.getTime()) return 'passada'

  const restante = consultoria.inicioEm.getTime() - agora.getTime()
  if (restante <= 0) return 'disponivel'
  if (restante <= LIMIAR_EM_BREVE_MS) return 'em_breve'

  const doInicio = dataLocalDoInstante(consultoria.inicioEm, consultoria.timezone)
  const deHoje = dataLocalDoInstante(agora, consultoria.timezone)
  if (doInicio === deHoje) return 'hoje'

  const amanha = dataLocalDoInstante(
    new Date(agora.getTime() + 24 * 60 * 60_000),
    consultoria.timezone,
  )
  return doInicio === amanha ? 'amanha' : 'distante'
}
