import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, notificacoes } from '@/db/schema'
import { condicaoAlcanceAtendimento } from '@/features/atendimentos/lib/autorizacao'
import { obterAudienciaDoAtendimento } from '@/features/atendimentos/lib/audiencia'
import { TIPOS_NOTIFICACAO } from '../constants/notificacao'
import { emitirNotificacoes } from './emitir'

const UM_DIA = 24 * 60 * 60 * 1000

/** Mesma janela de "vence em breve" que o badge do card usa. */
export const JANELA_AVISO_PRAZO_DIAS = 3

/** Um Atendimento em risco, no mínimo que o aviso precisa. */
type AtendimentoEmRisco = {
  id: string
  protocolo: string
  titulo: string
  prazoEm: Date | null
}

/**
 * Teto de Atendimentos processados por execução do agendador.
 *
 * Existe pelo mesmo motivo do lote de solicitações vencidas: a varredura roda
 * numa função serverless e não pode carregar a plataforma inteira na memória se
 * um dia o volume crescer. Não há paginação porque não é preciso — o que sobrar
 * é reencontrado na execução seguinte, e a chave de deduplicação garante que
 * ninguém receba o aviso duas vezes por isso.
 */
export const LOTE_AVISOS_DE_PRAZO = 500

/**
 * Emite o aviso de um conjunto de Atendimentos em risco.
 *
 * Miolo compartilhado pelas duas entradas — a varredura global do agendador e a
 * versão por pessoa. A regra de quem recebe, o texto e a chave de deduplicação
 * vivem aqui uma vez só: duas cópias divergiriam, e a que divergisse produziria
 * avisos duplicados justamente por não usar a mesma chave.
 */
async function avisarSobre(emRisco: AtendimentoEmRisco[], agora: Date) {
  let criadas = 0
  for (const atendimento of emRisco) {
    const vencido = atendimento.prazoEm !== null && atendimento.prazoEm < agora
    const audiencia = await obterAudienciaDoAtendimento(db, atendimento.id)
    if (!audiencia) continue

    // Um aviso por Atendimento, por pessoa, por dia. O dia entra na chave para
    // que o lembrete possa voltar amanhã se o prazo continuar vencido — sem
    // ele, o aviso valeria para sempre e a cobrança sumiria depois da primeira.
    const dia = agora.toISOString().slice(0, 10)

    criadas += await emitirNotificacoes(db, {
      // Prazo é cobrança da equipe. O Cliente não é avisado de um
      // compromisso interno que ele não tem como cumprir.
      destinatarios: audiencia.equipe,
      // Nasce sem autor: ninguém provocou, o relógio andou. Um `autorId`
      // aqui faria a pessoa deixar de receber o aviso do próprio prazo.
      autorId: null,
      tipo: TIPOS_NOTIFICACAO.prazoProximo,
      titulo: vencido
        ? `${atendimento.protocolo} está com o prazo vencido`
        : `${atendimento.protocolo} vence em breve`,
      resumo: atendimento.titulo,
      recursoTipo: 'atendimento',
      recursoId: atendimento.id,
      atendimentoId: atendimento.id,
      protocolo: atendimento.protocolo,
      chaveDedupe: `${TIPOS_NOTIFICACAO.prazoProximo}:${atendimento.id}:${dia}`,
      destino: {
        pagina: 'atendimentos',
        atendimento: atendimento.protocolo,
        aba: 'info',
      },
    })
  }
  return criadas
}

/** Condição comum: tem prazo, ele está próximo ou passou, e o caso está vivo. */
function condicaoPrazoEmRisco(limiteProximo: Date) {
  return and(
    isNotNull(atendimentos.prazoEm),
    lte(atendimentos.prazoEm, limiteProximo),
    // Atendimento encerrado não tem prazo a cobrar.
    sql`${atendimentos.status} not in ('concluido', 'recusado', 'cancelado')`,
  )
}

/**
 * Varre **toda** a plataforma e avisa cada equipe sobre os prazos dela.
 *
 * Esta é a entrada do agendador, e é a razão de o painel ter deixado de emitir
 * avisos ao ser aberto: prazo é a única coisa que pede atenção sem ninguém ter
 * feito nada, e usar a renderização de `/admin` como gatilho significava que
 * quem não entrasse no painel não era cobrado — e que entrar no painel criava
 * registros, o que uma renderização não deveria fazer.
 *
 * A audiência de cada Atendimento continua sendo resolvida um a um, e continua
 * sendo só a equipe daquele caso: a varredura é global, o alcance de cada aviso
 * não é.
 *
 * Idempotente pela mesma chave de sempre. Rodar de hora em hora produz um aviso
 * por Atendimento, por pessoa, por dia — não vinte e quatro.
 */
export async function processarAvisosDePrazo(agora = new Date()) {
  const limiteProximo = new Date(agora.getTime() + JANELA_AVISO_PRAZO_DIAS * UM_DIA)

  const emRisco = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      prazoEm: atendimentos.prazoEm,
    })
    .from(atendimentos)
    .where(condicaoPrazoEmRisco(limiteProximo))
    .orderBy(asc(atendimentos.prazoEm))
    .limit(LOTE_AVISOS_DE_PRAZO)

  if (!emRisco.length) return 0
  return avisarSobre(emRisco, agora)
}

/**
 * Avisa **uma pessoa** sobre os prazos da carteira dela.
 *
 * Continua existindo depois do agendador porque responde a outra pergunta: a
 * varredura global cobre a plataforma no ritmo do relógio, esta cobre uma
 * carteira sob demanda. Ela **não** é mais chamada durante a renderização de
 * página nenhuma — foi justamente esse uso que o agendador substituiu.
 *
 * A repetição é evitada em dois níveis. A consulta das últimas 24 horas evita o
 * trabalho inútil; a **chave de deduplicação** por Atendimento e dia é o que
 * garante o resultado, porque ela é conferida pelo índice único do banco no
 * momento do insert. Só a consulta não bastava: duas execuções simultâneas liam
 * "ainda não avisei" antes de qualquer uma gravar, e o mesmo prazo virava dois
 * avisos idênticos (foi o que aconteceu no #2026-0009).
 */
export async function emitirAvisosDePrazo(usuarioId: string, agora = new Date()) {
  const limiteProximo = new Date(agora.getTime() + JANELA_AVISO_PRAZO_DIAS * UM_DIA)

  const emRisco = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      prazoEm: atendimentos.prazoEm,
    })
    .from(atendimentos)
    .where(
      and(
        condicaoAlcanceAtendimento(usuarioId),
        condicaoPrazoEmRisco(limiteProximo),
      ),
    )

  if (!emRisco.length) return 0

  const desde = new Date(agora.getTime() - UM_DIA)
  const recentes = await db
    .select({
      atendimentoId: notificacoes.atendimentoId,
      tipo: notificacoes.tipo,
    })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, usuarioId),
        inArray(
          notificacoes.atendimentoId,
          emRisco.map(({ id }) => id),
        ),
        inArray(notificacoes.tipo, [TIPOS_NOTIFICACAO.prazoProximo]),
        gte(notificacoes.createdAt, desde),
      ),
    )

  const jaAvisados = new Set(
    recentes.map((linha) => `${linha.atendimentoId}:${linha.tipo}`),
  )

  return avisarSobre(
    emRisco.filter(
      (atendimento) =>
        !jaAvisados.has(`${atendimento.id}:${TIPOS_NOTIFICACAO.prazoProximo}`),
    ),
    agora,
  )
}
