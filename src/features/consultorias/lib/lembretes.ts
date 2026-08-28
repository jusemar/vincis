import { janelaAberta } from '@/features/videochamada/lib/janela'
import { faixaDoRestante, type TipoLembrete } from '../constants/lembretes'
import { dataLocalDoInstante, horaDeMinutos, minutosLocaisDoInstante } from './tempo'

/**
 * O texto do lembrete — que nunca afirma o que não é verdade.
 *
 * ## Por que a frase não vem pronta da faixa
 *
 * Porque a faixa diz "este é o lembrete de 1 hora", não "falta 1 hora". Uma
 * consultoria contratada com 40 minutos de antecedência cai na faixa de 1 hora
 * no primeiro disparo, e um texto fixo diria "em 1 hora" para quem tem 40
 * minutos. O tempo restante é **medido**, e é ele que escolhe as palavras.
 *
 * ## O caso do lembrete de 10 minutos
 *
 * A faixa dele tem folga (até 12 minutos) para o cron não perdê-la, mas a
 * porta da videochamada abre exatamente 10 minutos antes. Existe portanto uma
 * janela de dois minutos em que o lembrete sai e o acesso ainda não está
 * liberado — e prometer "já está disponível" ali seria mandar a pessoa bater
 * numa porta fechada. Por isso a frase consulta a janela de verdade, a mesma
 * função que autoriza a entrada, em vez de deduzir pela faixa.
 */

export type TextoDoLembrete = { titulo: string; resumo: string }

/** `28/08` e `14:30`, no fuso contratado — nunca no relógio do servidor. */
function quando(instante: Date, timezone: string) {
  const data = dataLocalDoInstante(instante, timezone)
  const [, mes, dia] = data.split('-')
  return {
    diaMes: `${dia}/${mes}`,
    hora: horaDeMinutos(minutosLocaisDoInstante(instante, timezone)),
    dataLocal: data,
  }
}

/**
 * "amanhã", "hoje" ou a data — decidido no fuso da consultoria.
 *
 * Comparar instantes daria a resposta errada na virada do dia: 23h de hoje e
 * 1h de amanhã distam duas horas e são dias diferentes. A comparação é entre
 * as datas locais, que é o que a pessoa entende por "amanhã".
 */
function referenciaDoDia(inicioEm: Date, agora: Date, timezone: string) {
  const doInicio = dataLocalDoInstante(inicioEm, timezone)
  const deHoje = dataLocalDoInstante(agora, timezone)
  if (doInicio === deHoje) return 'hoje'
  const amanha = dataLocalDoInstante(
    new Date(agora.getTime() + 24 * 60 * 60_000),
    timezone,
  )
  return doInicio === amanha ? 'amanhã' : null
}

/** Minutos restantes, arredondados para cima: 40s vira "1 minuto", não zero. */
function minutosRestantes(inicioEm: Date, agora: Date) {
  return Math.max(1, Math.ceil((inicioEm.getTime() - agora.getTime()) / 60_000))
}

export function textoDoLembrete({
  tipo,
  papel,
  outraParte,
  inicioEm,
  fimEm,
  timezone,
  agora,
}: {
  tipo: TipoLembrete
  papel: 'cliente' | 'prestador'
  /** O nome de quem está do outro lado. Montado no servidor. */
  outraParte: string
  inicioEm: Date
  fimEm: Date
  timezone: string
  agora: Date
}): TextoDoLembrete {
  const { diaMes, hora } = quando(inicioEm, timezone)
  const dia = referenciaDoDia(inicioEm, agora, timezone)
  const restante = minutosRestantes(inicioEm, agora)

  if (tipo === '10min') {
    // A porta está mesmo aberta? Quem responde é a regra da videochamada.
    const liberado = janelaAberta({ inicioEm, fimEm }, agora)
    const acesso = liberado
      ? 'O acesso à videochamada já está disponível.'
      : 'O acesso à videochamada abre 10 minutos antes.'
    return {
      titulo: 'Sua consultoria começa em instantes',
      resumo:
        papel === 'cliente'
          ? `Sua consultoria com ${outraParte} começa em ${restante} ${restante === 1 ? 'minuto' : 'minutos'}. ${acesso}`
          : `Sua consultoria com ${outraParte} começa em ${restante} ${restante === 1 ? 'minuto' : 'minutos'}. ${acesso}`,
    }
  }

  if (tipo === '1h') {
    const emQuanto =
      restante >= 55 && restante <= 65
        ? 'em 1 hora'
        : `em ${restante} ${restante === 1 ? 'minuto' : 'minutos'}`
    return {
      titulo: 'Consultoria em breve',
      resumo:
        papel === 'cliente'
          ? `Sua consultoria com ${outraParte} começa ${emQuanto}, às ${hora}.`
          : `Você tem uma consultoria com ${outraParte} ${emQuanto}, às ${hora}.`,
    }
  }

  const referencia = dia ? `${dia} às ${hora}` : `em ${diaMes} às ${hora}`
  return {
    titulo: 'Lembrete de consultoria',
    resumo:
      papel === 'cliente'
        ? `Sua consultoria com ${outraParte} começa ${referencia}.`
        : `Você tem uma consultoria com ${outraParte} ${referencia}.`,
  }
}

/**
 * A chave que impede o mesmo lembrete de sair duas vezes.
 *
 * ## Por que o horário entra na chave
 *
 * Porque remarcar cria um compromisso novo no mesmo registro. Uma chave feita
 * só de `agendamento + tipo` deixaria a consultoria movida de terça para quinta
 * **sem** lembrete — o de 24 horas do horário antigo já teria sido emitido e
 * bloquearia o do horário novo, silenciosamente. Com o instante de início
 * dentro dela, cada horário tem a sua própria série de lembretes, e os lembretes
 * já enviados do horário anterior continuam existindo no histórico sem
 * atrapalhar.
 */
export function chaveDoLembrete(
  tipoNotificacao: string,
  agendamentoId: string,
  tipo: TipoLembrete,
  inicioEm: Date,
): string {
  return `${tipoNotificacao}:${agendamentoId}:${tipo}:${inicioEm.toISOString()}`
}

export { faixaDoRestante }
