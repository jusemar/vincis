import { and, asc, eq, inArray, max } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturaCompetencias, assinaturas } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante, type DataLocal } from '@/features/consultorias/lib/tempo'
import { PLANOS_CONTRATAVEIS } from '../constants/assinatura'
import { planoTemContadorResponsavel } from '../constants/contador-responsavel'
import {
  DIAS_ANTECEDENCIA_MENSALIDADE,
  LIMITE_MESES_POR_PREPARACAO,
  type SituacaoMensalidade,
} from '../constants/mensalidade'
import { inicioDaCompetencia } from './calendario'
import { materializarCompetenciaMensal } from './competencias'
import { coberturaDasCompetencias, iniciarCompetenciasPagasEmCurso } from './pagamentos'

/**
 * Renovação mensal dos planos contábeis da Vincis.
 *
 * ## O desenho
 *
 * O cliente contrata uma vez. Cada mês seguinte é uma **competência nova da
 * mesma assinatura** — mesmo cliente, mesmo contador, mesmo histórico —, e não
 * uma contratação nova. Nada aqui cria estrutura paralela: o mês nasce por
 * `materializarCompetenciaMensal` (sem salto, sem duplicar), o dinheiro entra
 * pelo caminho único de confirmação do pagamento (efeito do Pix confirmado
 * pela Efí) e a cobrança é o Pix
 * de sempre (`abrirCobrancaPix`), agora apontando para o mês devido.
 *
 * ## Quando o mês seguinte nasce
 *
 * `DIAS_ANTECEDENCIA_MENSALIDADE` dias antes do início do período dele. O
 * vencimento é o primeiro dia do período. Não existe horizonte: só nascem os
 * meses cuja janela já abriu — nunca "os próximos doze".
 *
 * ## Quem faz nascer
 *
 * Dois gatilhos da mesma função idempotente: a rotina diária
 * (`processarPrazos`) e o próprio clique do cliente em "Pagar mensalidade" —
 * para o pagamento não depender de a rotina ter rodado. Os dois travam a linha
 * da assinatura, então disputam em fila; o índice único `(assinatura, número)`
 * é a última garantia.
 *
 * ## O que não faz
 *
 * Não confirma pagamento, não debita nada, não cancela nem suspende por
 * atraso, não mexe em vaga do contador. Mês em atraso continua devido e
 * visível; a política de tolerância é decisão separada.
 */

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Leitor = Pick<typeof db, 'select'>

/** O dia de hoje na plataforma (São Paulo), que é como os períodos são datados. */
export function hojeNaPlataforma(agora: Date = new Date()): DataLocal {
  return dataLocalDoInstante(agora, TIMEZONE_PADRAO)
}

/** Soma (ou subtrai) dias de calendário a uma data local. */
export function somarDias(data: DataLocal, dias: number): DataLocal {
  const [ano, mes, dia] = data.split('-').map(Number)
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return resultado.toISOString().slice(0, 10)
}

/**
 * Situação do dinheiro de um mês — independente de o plano estar ativo.
 *
 * Vence no primeiro dia do período; "em atraso" é do dia seguinte em diante.
 */
export function situacaoDaMensalidade({
  status,
  valorCentavos,
  cobertoCentavos,
  vencimento,
  hoje,
}: {
  status: string
  valorCentavos: number
  cobertoCentavos: number
  vencimento: DataLocal | null
  hoje: DataLocal
}): SituacaoMensalidade {
  if (status === 'cancelada') return 'cancelada'
  if (cobertoCentavos >= valorCentavos) return 'paga'
  if (vencimento && hoje > vencimento) return 'em_atraso'
  return 'aguardando_pagamento'
}

/**
 * Os números dos meses que já deveriam existir e ainda não existem.
 *
 * Função pura — a rotina usa para criar, a tela usa para mostrar o mês devido
 * mesmo antes de a rotina rodar. Cada mês entra quando `hoje` alcança a véspera
 * da janela (`início − antecedência`); para no primeiro cuja janela não abriu.
 */
export function mesesADisponibilizar({
  inicioDoContrato,
  ultimoNumero,
  hoje,
}: {
  inicioDoContrato: DataLocal
  ultimoNumero: number
  hoje: DataLocal
}): number[] {
  const numeros: number[] = []
  let numero = ultimoNumero + 1
  while (numeros.length < LIMITE_MESES_POR_PREPARACAO) {
    const abertura = somarDias(inicioDaCompetencia(inicioDoContrato, numero), -DIAS_ANTECEDENCIA_MENSALIDADE)
    if (abertura > hoje) break
    numeros.push(numero)
    numero += 1
  }
  return numeros
}

/** O plano que tem mensalidade: contábil da Vincis, mensal e ativo, já com vigência. */
export function temMensalidade(plano: {
  status: string
  periodicidade: string
  planoCodigo: string
  vigenciaInicio: Date | null
}): plano is typeof plano & { vigenciaInicio: Date } {
  return (
    plano.status === 'ativa' &&
    plano.periodicidade === 'mensal' &&
    planoTemContadorResponsavel(plano.planoCodigo) &&
    plano.vigenciaInicio !== null
  )
}

export type PreparacaoDasMensalidades = {
  /** Meses criados agora. */
  criadas: number[]
  /** Meses já pagos que entraram em andamento agora (o período começou). */
  iniciadas: number[]
}

/**
 * Deixa a assinatura em dia com o calendário: cria os meses cuja janela abriu
 * e põe em andamento os meses pagos cujo período começou.
 *
 * Trava a linha da assinatura: duas execuções (rotina e clique, ou duas
 * rotinas) fazem fila, e o cancelamento — que trava a mesma linha — nunca
 * cruza com um mês nascendo. Assinatura cancelada, encerrada, pendente ou de
 * prazo fechado não ganha nada.
 */
export async function prepararMensalidadesDaAssinatura(
  tx: Transacao,
  assinaturaId: string,
  agora: Date = new Date(),
): Promise<PreparacaoDasMensalidades> {
  const vazio: PreparacaoDasMensalidades = { criadas: [], iniciadas: [] }
  const [plano] = await tx
    .select({
      id: assinaturas.id,
      clienteUsuarioId: assinaturas.clienteUsuarioId,
      status: assinaturas.status,
      periodicidade: assinaturas.periodicidade,
      planoCodigo: assinaturas.planoCodigo,
      vigenciaInicio: assinaturas.vigenciaInicio,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
    .limit(1)
    .for('update')
  if (!plano || !temMensalidade(plano)) return vazio

  const hoje = hojeNaPlataforma(agora)
  const [ultima] = await tx
    .select({ numero: max(assinaturaCompetencias.numero) })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
  const ultimoNumero = ultima?.numero ?? 0
  // Sem nenhum mês, o contrato está fora do desenho (o 1º nasce na contratação).
  if (ultimoNumero < 1) return vazio

  const criadas: number[] = []
  for (const numero of mesesADisponibilizar({
    inicioDoContrato: hojeNaPlataforma(plano.vigenciaInicio),
    ultimoNumero,
    hoje,
  })) {
    const resultado = await materializarCompetenciaMensal(tx, { assinaturaId, numero })
    if (resultado === 'criada') {
      criadas.push(numero)
      continue
    }
    if (resultado !== 'ja_existia') break
  }

  for (const numero of criadas) {
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.mensalidadeDisponibilizada,
        entidade: 'assinaturas',
        registroAfetado: assinaturaId,
        usuarioId: plano.clienteUsuarioId,
        origem: 'sistema',
        metadados: { competencia: numero },
      },
      tx,
    )
  }

  const iniciadas = await iniciarCompetenciasPagasEmCurso(tx, assinaturaId, hoje)
  return { criadas, iniciadas }
}

export type ResumoDasMensalidades = {
  analisadas: number
  criadas: number
  iniciadas: number
  falhas: number
}

/**
 * A rotina diária: prepara todas as assinaturas mensais ativas.
 *
 * Uma transação por assinatura — a falha de uma não derruba as outras, e a
 * trava de cada linha dura só o necessário. Idempotente: rodar duas vezes no
 * mesmo dia (ou ao mesmo tempo) não cria mês nenhum a mais.
 */
export async function prepararMensalidadesDosPlanos(agora: Date = new Date()): Promise<ResumoDasMensalidades> {
  const candidatas = await db
    .select({ id: assinaturas.id })
    .from(assinaturas)
    .where(
      and(
        eq(assinaturas.status, 'ativa'),
        eq(assinaturas.periodicidade, 'mensal'),
        inArray(assinaturas.planoCodigo, [...PLANOS_CONTRATAVEIS]),
      ),
    )
    .orderBy(asc(assinaturas.id))

  const resumo: ResumoDasMensalidades = { analisadas: candidatas.length, criadas: 0, iniciadas: 0, falhas: 0 }
  for (const { id } of candidatas) {
    try {
      const feito = await db.transaction((tx) => prepararMensalidadesDaAssinatura(tx, id, agora))
      resumo.criadas += feito.criadas.length
      resumo.iniciadas += feito.iniciadas.length
    } catch (erro) {
      resumo.falhas += 1
      console.error('[MENSALIDADES]', {
        assinaturaId: id,
        nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
        mensagem: erro instanceof Error ? erro.message : undefined,
      })
    }
  }
  return resumo
}

export type MensalidadeDevida = {
  competenciaId: string
  numero: number
  /** O que falta pagar deste mês — é o valor do Pix. */
  valorCentavos: number
  periodoInicio: DataLocal | null
  periodoFim: DataLocal | null
  /** Primeiro dia do período. */
  vencimento: DataLocal | null
  situacao: SituacaoMensalidade
}

/**
 * O mês que o cliente deve pagar agora: o **mais antigo** em aberto.
 *
 * Ordem cronológica sempre — com dois meses atrasados, paga-se primeiro o
 * mais velho. Nulo quando está tudo pago (mês já quitado nunca é cobrado de
 * novo, inclusive o primeiro, pago na contratação ou por homologação).
 */
export async function mensalidadeDevida(
  executor: Leitor,
  assinaturaId: string,
  agora: Date = new Date(),
): Promise<MensalidadeDevida | null> {
  const cobertura = await coberturaDasCompetencias(executor, assinaturaId)
  const meses = await executor
    .select({
      id: assinaturaCompetencias.id,
      numero: assinaturaCompetencias.numero,
      valor: assinaturaCompetencias.valorBaseCentavos,
      status: assinaturaCompetencias.status,
      periodoInicio: assinaturaCompetencias.periodoInicio,
      periodoFim: assinaturaCompetencias.periodoFim,
    })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
  const hoje = hojeNaPlataforma(agora)
  for (const mes of meses) {
    if (mes.status === 'cancelada') continue
    const coberto = cobertura.get(mes.id) ?? 0
    const falta = mes.valor - coberto
    if (falta <= 0) continue
    return {
      competenciaId: mes.id,
      numero: mes.numero,
      valorCentavos: falta,
      periodoInicio: mes.periodoInicio,
      periodoFim: mes.periodoFim,
      vencimento: mes.periodoInicio,
      situacao: situacaoDaMensalidade({
        status: mes.status,
        valorCentavos: mes.valor,
        cobertoCentavos: coberto,
        vencimento: mes.periodoInicio,
        hoje,
      }),
    }
  }
  return null
}
