import { alias } from 'drizzle-orm/pg-core'
import { and, eq, gt, lte } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, consultoriaAgendamentos, usuarios } from '@/db/schema'
import {
  faixaDoRestante,
  TETO_DA_FAIXA,
} from '@/features/consultorias/constants/lembretes'
import { chaveDoLembrete, textoDoLembrete } from '@/features/consultorias/lib/lembretes'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes } from '@/features/notificacoes/lib/emitir'

const clienteConta = alias(usuarios, 'lembrete_cliente')
const prestadorConta = alias(usuarios, 'lembrete_prestador')

/**
 * Os lembretes das consultorias que estão chegando.
 *
 * ## Por que o cron pode errar o horário e nada se perde
 *
 * Cada tipo de lembrete tem uma faixa de tempo restante, não um instante. O
 * disparo pergunta "em que faixa esta consultoria está agora?" e emite o
 * lembrete daquela faixa — se ele ainda não saiu. Como as faixas são contíguas
 * e a mais estreita tem doze minutos, qualquer cron que rode a cada dez minutos
 * acerta todas.
 *
 * ## Por que repetir o disparo não repete o aviso
 *
 * A garantia não é uma consulta prévia — duas execuções simultâneas passariam
 * pela consulta antes de qualquer uma gravar, que foi exatamente como o mesmo
 * prazo virou dois avisos idênticos noutra parte da plataforma. Quem garante é
 * o índice único de `notificacoes` sobre a chave de dedupe: o segundo insert é
 * descartado pelo banco.
 *
 * ## Por que a consulta é estreita
 *
 * O `where` já exclui canceladas, concluídas, as que já começaram e as que
 * estão a mais de 25 horas de distância. O que sobra é o punhado de
 * consultorias que realmente podem receber lembrete neste disparo — não a
 * tabela inteira filtrada em memória.
 *
 * ## O que este processo **não** decide
 *
 * Nada crítico. Reserva, cancelamento, remarcação e acesso à videochamada não
 * dependem dele: se o cron não rodar por um dia, ninguém perde uma consulta,
 * apenas deixa de ser lembrado dela.
 */
export async function processarLembretesDeConsultoria(
  agora = new Date(),
): Promise<number> {
  const horizonte = new Date(agora.getTime() + TETO_DA_FAIXA['24h'])

  const proximas = await db
    .select({
      id: consultoriaAgendamentos.id,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
      timezone: consultoriaAgendamentos.timezone,
      clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
      prestadorId: consultoriaAgendamentos.prestadorId,
      clienteNome: clienteConta.nome,
      prestadorNome: prestadorConta.nome,
      atendimentoId: atendimentos.id,
      protocolo: atendimentos.protocolo,
    })
    .from(consultoriaAgendamentos)
    .innerJoin(
      clienteConta,
      eq(clienteConta.id, consultoriaAgendamentos.clienteUsuarioId),
    )
    .innerJoin(
      prestadorConta,
      eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
    )
    .leftJoin(
      atendimentos,
      eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
    )
    .where(
      and(
        // Só as de pé: cancelada e concluída não são lembradas.
        eq(consultoriaAgendamentos.status, 'agendada'),
        // Ainda não começou, e está dentro do horizonte da faixa mais larga.
        gt(consultoriaAgendamentos.inicioEm, agora),
        lte(consultoriaAgendamentos.inicioEm, horizonte),
      ),
    )

  let emitidos = 0

  for (const consultoria of proximas) {
    const faixa = faixaDoRestante(consultoria.inicioEm.getTime() - agora.getTime())
    if (!faixa) continue

    const comum = {
      tipo: TIPOS_NOTIFICACAO.consultoriaLembrete,
      recursoTipo: 'atendimento' as const,
      recursoId: consultoria.atendimentoId ?? consultoria.id,
      atendimentoId: consultoria.atendimentoId,
      protocolo: consultoria.protocolo,
      destino: {
        pagina: 'atendimentos' as const,
        atendimento: consultoria.protocolo ?? '',
      },
      /**
       * O instante de início entra na chave: remarcar gera uma série nova de
       * lembretes, e os do horário antigo não bloqueiam os do novo.
       */
      chaveDedupe: chaveDoLembrete(
        TIPOS_NOTIFICACAO.consultoriaLembrete,
        consultoria.id,
        faixa,
        consultoria.inicioEm,
      ),
    }

    /**
     * Dois avisos, um para cada lado, com textos diferentes.
     *
     * `autorId: null` porque este fato não tem autor — é o relógio. Passar uma
     * das partes como autora faria `emitirNotificacoes` descartá-la dos
     * destinatários, e exatamente quem precisa ser lembrado ficaria sem aviso.
     */
    const paraCliente = textoDoLembrete({
      tipo: faixa,
      papel: 'cliente',
      outraParte: consultoria.prestadorNome,
      inicioEm: consultoria.inicioEm,
      fimEm: consultoria.fimEm,
      timezone: consultoria.timezone,
      agora,
    })
    emitidos += await emitirNotificacoes(db, {
      ...comum,
      destinatarios: [consultoria.clienteUsuarioId],
      autorId: null,
      titulo: paraCliente.titulo,
      resumo: paraCliente.resumo,
    })

    const paraPrestador = textoDoLembrete({
      tipo: faixa,
      papel: 'prestador',
      outraParte: consultoria.clienteNome,
      inicioEm: consultoria.inicioEm,
      fimEm: consultoria.fimEm,
      timezone: consultoria.timezone,
      agora,
    })
    emitidos += await emitirNotificacoes(db, {
      ...comum,
      destinatarios: [consultoria.prestadorId],
      autorId: null,
      titulo: paraPrestador.titulo,
      resumo: paraPrestador.resumo,
    })
  }

  return emitidos
}
