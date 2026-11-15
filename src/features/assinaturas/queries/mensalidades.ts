import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturaCompetencias, assinaturaPagamentoAlocacoes, assinaturaPagamentos } from '@/db/schema'
import {
  MENSALIDADES_NO_HISTORICO,
  type SituacaoFinanceiraDoPlano,
  type SituacaoMensalidade,
} from '../constants/mensalidade'
import { periodoDaCompetencia } from '../lib/calendario'
import {
  hojeNaPlataforma,
  mesesADisponibilizar,
  situacaoDaMensalidade,
  temMensalidade,
} from '../lib/mensalidades'

/** Um mês do plano, como o cliente e o contador o veem. Só dados serializáveis. */
export type MensalidadeResumo = {
  numero: number
  periodoInicio: string | null
  periodoFim: string | null
  /** Primeiro dia do período. */
  vencimento: string | null
  valorCentavos: number
  pagoCentavos: number
  situacao: SituacaoMensalidade
}

export type ResumoFinanceiroDoPlano = {
  /** Nulo quando o plano não tem mensalidade (pendente, cancelado, prazo fechado). */
  situacao: SituacaoFinanceiraDoPlano | null
  /** O mês cujo período contém hoje. */
  atual: MensalidadeResumo | null
  /** O mês mais antigo em aberto — o que o "Pagar mensalidade" paga. */
  devida: MensalidadeResumo | null
  /** Os meses mais recentes primeiro, já com o próximo devido se a janela abriu. */
  historico: MensalidadeResumo[]
}

export type PlanoParaResumo = {
  id: string
  status: string
  periodicidade: string
  planoCodigo: string
  vigenciaInicio: Date | null
  valorMensalCentavos: number
}

/**
 * A situação das mensalidades de vários planos de uma vez — só leitura.
 *
 * Duas consultas para a lista inteira (meses e dinheiro confirmado), sem N+1.
 *
 * ## O mês que a rotina ainda não criou
 *
 * Se a janela do mês seguinte já abriu e a rotina diária ainda não rodou, o mês
 * aparece mesmo assim, calculado pelas mesmas regras (`mesesADisponibilizar`,
 * valor mensal do contrato). Nada é gravado aqui: quem cria é a rotina, ou o
 * clique em "Pagar mensalidade", que prepara o contrato antes do Pix.
 */
export async function resumoFinanceiroDosPlanos(
  planos: PlanoParaResumo[],
  agora: Date = new Date(),
): Promise<Map<string, ResumoFinanceiroDoPlano>> {
  const resultado = new Map<string, ResumoFinanceiroDoPlano>()
  const ids = planos.filter((p) => p.status !== 'aguardando_pagamento').map((p) => p.id)
  if (!ids.length) return resultado

  const [meses, pagos] = await Promise.all([
    db
      .select({
        id: assinaturaCompetencias.id,
        assinaturaId: assinaturaCompetencias.assinaturaId,
        numero: assinaturaCompetencias.numero,
        valor: assinaturaCompetencias.valorBaseCentavos,
        status: assinaturaCompetencias.status,
        periodoInicio: assinaturaCompetencias.periodoInicio,
        periodoFim: assinaturaCompetencias.periodoFim,
      })
      .from(assinaturaCompetencias)
      .where(inArray(assinaturaCompetencias.assinaturaId, ids))
      .orderBy(asc(assinaturaCompetencias.assinaturaId), asc(assinaturaCompetencias.numero)),
    db
      .select({
        competenciaId: assinaturaPagamentoAlocacoes.competenciaId,
        pago: sql<number>`sum(${assinaturaPagamentoAlocacoes.valorCentavos})`.mapWith(Number),
      })
      .from(assinaturaPagamentoAlocacoes)
      .innerJoin(assinaturaPagamentos, eq(assinaturaPagamentos.id, assinaturaPagamentoAlocacoes.pagamentoId))
      .where(
        and(inArray(assinaturaPagamentoAlocacoes.assinaturaId, ids), eq(assinaturaPagamentos.status, 'confirmado')),
      )
      .groupBy(assinaturaPagamentoAlocacoes.competenciaId),
  ])
  const pagoPorMes = new Map(pagos.map((p) => [p.competenciaId, p.pago]))
  const hoje = hojeNaPlataforma(agora)

  for (const plano of planos) {
    if (plano.status === 'aguardando_pagamento') continue
    const doPlano = meses.filter((m) => m.assinaturaId === plano.id)
    const lista: MensalidadeResumo[] = doPlano.map((m) => {
      const pago = pagoPorMes.get(m.id) ?? 0
      return {
        numero: m.numero,
        periodoInicio: m.periodoInicio,
        periodoFim: m.periodoFim,
        vencimento: m.periodoInicio,
        valorCentavos: m.valor,
        pagoCentavos: pago,
        situacao: situacaoDaMensalidade({
          status: m.status,
          valorCentavos: m.valor,
          cobertoCentavos: pago,
          vencimento: m.periodoInicio,
          hoje,
        }),
      }
    })

    const comMensalidade = temMensalidade(plano)
    if (comMensalidade && lista.length) {
      const inicioDoContrato = hojeNaPlataforma(plano.vigenciaInicio)
      const ultimoNumero = Math.max(...lista.map((m) => m.numero))
      for (const numero of mesesADisponibilizar({ inicioDoContrato, ultimoNumero, hoje })) {
        const { inicio, fim } = periodoDaCompetencia(inicioDoContrato, numero)
        lista.push({
          numero,
          periodoInicio: inicio,
          periodoFim: fim,
          vencimento: inicio,
          valorCentavos: plano.valorMensalCentavos,
          pagoCentavos: 0,
          situacao: situacaoDaMensalidade({
            status: 'prevista',
            valorCentavos: plano.valorMensalCentavos,
            cobertoCentavos: 0,
            vencimento: inicio,
            hoje,
          }),
        })
      }
    }

    const abertas = lista.filter((m) => m.situacao === 'aguardando_pagamento' || m.situacao === 'em_atraso')
    const situacao: SituacaoFinanceiraDoPlano | null = !comMensalidade
      ? null
      : abertas.some((m) => m.situacao === 'em_atraso')
        ? 'em_atraso'
        : abertas.length
          ? 'aguardando_pagamento'
          : 'em_dia'

    resultado.set(plano.id, {
      situacao,
      atual:
        lista.find(
          (m) => m.situacao !== 'cancelada' && m.periodoInicio && m.periodoFim && m.periodoInicio <= hoje && hoje <= m.periodoFim,
        ) ?? null,
      devida: abertas[0] ?? null,
      historico: [...lista].reverse().slice(0, MENSALIDADES_NO_HISTORICO),
    })
  }
  return resultado
}
