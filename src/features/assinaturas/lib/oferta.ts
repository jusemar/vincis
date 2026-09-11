import { createHash } from 'node:crypto'
import type { ItemDaSimulacao } from '@/features/oportunidades/types/oportunidade'
import {
  itensDoRetrato,
  ordenar,
} from '@/features/precificacao-profissional/lib/simulacao'
import type {
  PrecoPeriodo,
  RespostasPrecificacao,
  ResultadoPrecificacao,
  ServicoPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'

/** Muda quando o formato do retrato mudar; o antigo continua legível. */
export const VERSAO_DA_OFERTA = 1

/**
 * O retrato da oferta aceita.
 *
 * Textos **e** códigos: a tabela pública pode renomear um plano, desativar uma
 * faixa ou mudar um desconto amanhã, e um retrato só de códigos precisaria da
 * tabela atual para ser lido — justamente a que pode ter mudado. A composição
 * do motor vem inteira, para que "como chegamos neste valor" continue
 * respondível depois.
 */
export type OfertaContratada = {
  versao: number
  plano: { codigo: string; nome: string; chamada: string | null }
  periodo: {
    codigo: string
    rotulo: string
    meses: number
    descontoMilesimos: number
    descontoPercentual: number
  }
  respostas: RespostasPrecificacao
  itens: ItemDaSimulacao[]
  composicao: Pick<
    ResultadoPrecificacao,
    | 'linhas'
    | 'fatores'
    | 'nucleoCentavos'
    | 'adicionaisCentavos'
    | 'arredondamentoCentavos'
    | 'mensalCentavos'
  >
  /** No pacote, os planos que o compõem e o mensal de cada um. */
  combo: {
    componentes: { servico: string; mensalCentavos: number }[]
    separadoCentavos: number
    economiaMensalCentavos: number
    descontoMilesimos: number
  } | null
  valores: {
    mensalCheioCentavos: number
    mensalCentavos: number
    economiaMensalCentavos: number
    totalCentavos: number
  }
  contratadaEm: string
}

/** A oferta montada a partir do que o motor calculou — nunca do navegador. */
export function montarOferta({
  tabela,
  servico,
  resultado,
  periodo,
  respostas,
  contratadaEm = new Date(),
}: {
  tabela: TabelaPrecificacao
  servico: ServicoPrecificacao
  resultado: ResultadoPrecificacao
  periodo: PrecoPeriodo
  respostas: RespostasPrecificacao
  contratadaEm?: Date
}): OfertaContratada {
  return {
    versao: VERSAO_DA_OFERTA,
    plano: {
      codigo: servico.codigo,
      nome: servico.nome,
      chamada: servico.chamada ?? null,
    },
    periodo: {
      codigo: periodo.periodo,
      rotulo: periodo.rotulo,
      meses: periodo.meses,
      descontoMilesimos: periodo.descontoMilesimos,
      descontoPercentual: periodo.descontoPercentual,
    },
    respostas,
    itens: itensDoRetrato(tabela, respostas),
    composicao: {
      linhas: resultado.linhas,
      fatores: resultado.fatores,
      nucleoCentavos: resultado.nucleoCentavos,
      adicionaisCentavos: resultado.adicionaisCentavos,
      arredondamentoCentavos: resultado.arredondamentoCentavos,
      mensalCentavos: resultado.mensalCentavos,
    },
    combo: resultado.combo
      ? {
          componentes: resultado.combo.componentes.map((componente) => ({
            servico: componente.servico,
            mensalCentavos: componente.mensalCentavos,
          })),
          separadoCentavos: resultado.combo.separadoCentavos,
          economiaMensalCentavos: resultado.combo.economiaMensalCentavos,
          descontoMilesimos: resultado.combo.descontoMilesimos,
        }
      : null,
    valores: {
      mensalCheioCentavos: resultado.mensalCentavos,
      mensalCentavos: periodo.mensalCentavos,
      economiaMensalCentavos: periodo.economiaMensalCentavos,
      totalCentavos: periodo.totalPeriodoCentavos,
    },
    contratadaEm: contratadaEm.toISOString(),
  }
}

/**
 * A impressão digital da intenção de contratar.
 *
 * Plano, prazo, respostas e os valores que o motor devolveu — e **não** a hora:
 * o mesmo clique repetido precisa gerar a mesma chave, que é o que o índice
 * único do banco usa para recusar o segundo. Outra resposta, outro prazo ou um
 * preço diferente geram outra chave, como devem.
 */
export function chaveDaOferta(oferta: OfertaContratada): string {
  const canonico = JSON.stringify({
    plano: oferta.plano.codigo,
    periodo: oferta.periodo.codigo,
    mensalCentavos: oferta.valores.mensalCentavos,
    totalCentavos: oferta.valores.totalCentavos,
    respostas: ordenar(oferta.respostas),
  })
  return createHash('sha256').update(canonico).digest('hex')
}
