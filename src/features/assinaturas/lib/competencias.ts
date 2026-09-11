import { and, eq, inArray, max } from 'drizzle-orm'
import type { db as Banco } from '@/db/connection'
import { assinaturaCompetencias, assinaturas } from '@/db/schema'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante } from '@/features/consultorias/lib/tempo'
import { PERIODICIDADES, type Periodicidade } from '../constants/assinatura'
import {
  STATUS_NAO_PRESTADOS,
  competenciasNaContratacao,
} from '../constants/competencia'
import { periodoDaCompetencia } from './calendario'
import { distribuirCentavos } from './valores'

/** Aceita o banco ou a transação em curso. */
type Executor = Pick<typeof Banco, 'select' | 'insert' | 'update'>

/**
 * Estados do contrato em que ele ainda ganha meses.
 *
 * Contrato cancelado ou encerrado não produz competência nova — nem por
 * reprocessamento, nem por engano.
 */
const ASSINATURA_ABERTA = ['aguardando_pagamento', 'ativa']

function ehPeriodicidade(valor: string): valor is Periodicidade {
  return (PERIODICIDADES as readonly string[]).includes(valor)
}

async function carregar(executor: Executor, assinaturaId: string) {
  const [linha] = await executor
    .select({
      id: assinaturas.id,
      periodicidade: assinaturas.periodicidade,
      meses: assinaturas.meses,
      valorMensalCentavos: assinaturas.valorMensalCentavos,
      valorTotalCentavos: assinaturas.valorTotalCentavos,
      vigenciaInicio: assinaturas.vigenciaInicio,
      status: assinaturas.status,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
    .limit(1)
  return linha ?? null
}

/**
 * O período do mês, quando o contrato já tem vigência — e nulo quando não tem.
 *
 * A vigência é um instante; o mês de prestação é calendário. A conversão
 * acontece aqui, uma vez, no fuso da plataforma: o dia em que o contrato começou
 * é o dia em São Paulo, e não o dia em UTC.
 */
function periodo(vigenciaInicio: Date | null, numero: number) {
  if (!vigenciaInicio) return { periodoInicio: null, periodoFim: null }
  const inicio = dataLocalDoInstante(vigenciaInicio, TIMEZONE_PADRAO)
  const { inicio: periodoInicio, fim: periodoFim } = periodoDaCompetencia(
    inicio,
    numero,
  )
  return { periodoInicio, periodoFim }
}

/**
 * Cria as competências previstas de um contrato.
 *
 * ## Quantas
 *
 * Prazo fechado nasce com todos os meses — 6 ou 12. O mensal, contínuo, nasce só
 * com o primeiro: não há duração para prever, e as seguintes são materializadas
 * uma de cada vez por `materializarCompetenciaMensal`.
 *
 * ## Com que valor
 *
 * Prazo fechado reparte o **total contratado** entre os meses, sem criar nem
 * perder centavo: a soma das competências é exatamente o que o cliente aceitou.
 * O mensal usa o mensal congelado no contrato.
 *
 * ## Sem datas, sem pagamento
 *
 * Todas nascem `prevista`. As datas só existem se o contrato já tiver vigência —
 * que depende de pagamento real e hoje nunca existe na contratação.
 *
 * ## Reprocessar não duplica
 *
 * `on conflict do nothing` sobre o índice único `(assinatura_id, numero)`.
 * Chamar de novo, ou duas vezes ao mesmo tempo, não cria a segunda linha de
 * mês nenhum. Devolve quantas nasceram nesta chamada.
 */
export async function gerarCompetenciasPrevistas(
  executor: Executor,
  assinaturaId: string,
): Promise<number> {
  const assinatura = await carregar(executor, assinaturaId)
  if (
    !assinatura ||
    !ASSINATURA_ABERTA.includes(assinatura.status) ||
    !ehPeriodicidade(assinatura.periodicidade)
  ) {
    return 0
  }

  const quantidade = competenciasNaContratacao(
    assinatura.periodicidade,
    assinatura.meses,
  )
  const valores =
    assinatura.periodicidade === 'mensal'
      ? [assinatura.valorMensalCentavos]
      : distribuirCentavos(assinatura.valorTotalCentavos, quantidade)

  const criadas = await executor
    .insert(assinaturaCompetencias)
    .values(
      valores.map((valorBaseCentavos, indice) => ({
        assinaturaId,
        numero: indice + 1,
        valorBaseCentavos,
        ...periodo(assinatura.vigenciaInicio, indice + 1),
      })),
    )
    .onConflictDoNothing({
      target: [assinaturaCompetencias.assinaturaId, assinaturaCompetencias.numero],
    })
    .returning({ id: assinaturaCompetencias.id })

  return criadas.length
}

export type ResultadoDaMaterializacao =
  | 'criada'
  | 'ja_existia'
  | 'fora_de_ordem'
  | 'nao_elegivel'

/**
 * Materializa um mês específico de um contrato mensal.
 *
 * ## Por número, e não "o próximo"
 *
 * Pedir "a competência 4" é idempotente: pedir de novo encontra a que já existe.
 * Pedir "a próxima" duas vezes criaria duas. Quem chama — o motor financeiro,
 * quando existir — sabe qual mês quer, e é esse o contrato desta função.
 *
 * ## Sem saltar mês e sem horizonte
 *
 * Só aceita o mês seguinte ao último que existe. Pular um mês deixaria um
 * buraco no contrato, e pedir um mês distante seria justamente o horizonte
 * artificial que o mensal não pode ter.
 *
 * ## É assim que o reajuste entra
 *
 * `valorBaseCentavos` é o preço vigente para aquele mês — por padrão, o mensal
 * congelado no contrato; num reajuste, o novo. Meses já materializados não
 * mudam: o valor de cada um foi congelado na própria linha.
 */
export async function materializarCompetenciaMensal(
  executor: Executor,
  {
    assinaturaId,
    numero,
    valorBaseCentavos,
  }: { assinaturaId: string; numero: number; valorBaseCentavos?: number },
): Promise<ResultadoDaMaterializacao> {
  const assinatura = await carregar(executor, assinaturaId)
  if (
    !assinatura ||
    assinatura.periodicidade !== 'mensal' ||
    !ASSINATURA_ABERTA.includes(assinatura.status) ||
    !Number.isInteger(numero) ||
    numero < 1
  ) {
    return 'nao_elegivel'
  }

  const [ultima] = await executor
    .select({ numero: max(assinaturaCompetencias.numero) })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
  const ultimoNumero = ultima?.numero ?? 0

  if (numero <= ultimoNumero) return 'ja_existia'
  if (numero > ultimoNumero + 1) return 'fora_de_ordem'

  const valor = valorBaseCentavos ?? assinatura.valorMensalCentavos
  if (!Number.isInteger(valor) || valor < 0) return 'nao_elegivel'

  const [criada] = await executor
    .insert(assinaturaCompetencias)
    .values({
      assinaturaId,
      numero,
      valorBaseCentavos: valor,
      ...periodo(assinatura.vigenciaInicio, numero),
    })
    .onConflictDoNothing({
      target: [assinaturaCompetencias.assinaturaId, assinaturaCompetencias.numero],
    })
    .returning({ id: assinaturaCompetencias.id })

  // Perdeu a corrida para outra chamada com o mesmo número: o mês existe.
  return criada ? 'criada' : 'ja_existia'
}

/**
 * Encerra os meses que o contrato ainda não prestou.
 *
 * É a parte estrutural do cancelamento: meses `prevista` viram `cancelada` e
 * deixam de sustentar qualquer coisa futura — cobrança, comissão. Mês em
 * andamento ou cumprido **não** é tocado: foi prestado, e cancelar o contrato
 * depois não desfaz o que aconteceu. Nada é apagado.
 *
 * Não muda o status do contrato nem calcula devolução: isso é do fluxo de
 * cancelamento, que decide quando e por quem. Devolve quantos meses encerrou.
 */
export async function cancelarCompetenciasNaoPrestadas(
  executor: Executor,
  assinaturaId: string,
): Promise<number> {
  const agora = new Date()
  const canceladas = await executor
    .update(assinaturaCompetencias)
    .set({ status: 'cancelada', canceladaEm: agora, updatedAt: agora })
    .where(
      and(
        eq(assinaturaCompetencias.assinaturaId, assinaturaId),
        inArray(assinaturaCompetencias.status, STATUS_NAO_PRESTADOS),
      ),
    )
    .returning({ id: assinaturaCompetencias.id })
  return canceladas.length
}
