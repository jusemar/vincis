import { asc, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidadeContrapropostas } from '@/db/schema'
import type { ContrapropostaDTO } from '../types/oportunidade'

export type NegociacaoDaProposta = {
  pendente: ContrapropostaDTO | null
  historico: ContrapropostaDTO[]
}

/**
 * A negociação de cada proposta, em uma consulta só.
 *
 * Recebe ids que a consulta anterior já autorizou — o recorte de quem pode ver
 * o quê acontece lá, não aqui. Devolve a pendente separada do histórico porque
 * são coisas diferentes na tela: a pendente pede ação, o histórico explica como
 * se chegou até aqui.
 */
export async function obterNegociacoes(propostaIds: string[]) {
  const porProposta = new Map<string, NegociacaoDaProposta>()
  if (!propostaIds.length) return porProposta

  const linhas = await db
    .select({
      id: oportunidadeContrapropostas.id,
      propostaId: oportunidadeContrapropostas.propostaId,
      valorCentavos: oportunidadeContrapropostas.valorCentavos,
      mensagem: oportunidadeContrapropostas.mensagem,
      status: oportunidadeContrapropostas.status,
      criadoEm: oportunidadeContrapropostas.createdAt,
      respondidaEm: oportunidadeContrapropostas.respondidaEm,
    })
    .from(oportunidadeContrapropostas)
    .where(inArray(oportunidadeContrapropostas.propostaId, propostaIds))
    .orderBy(asc(oportunidadeContrapropostas.createdAt))

  for (const linha of linhas) {
    const atual =
      porProposta.get(linha.propostaId) ?? { pendente: null, historico: [] }
    const dto: ContrapropostaDTO = {
      id: linha.id,
      valorCentavos: linha.valorCentavos,
      mensagem: linha.mensagem,
      status: linha.status,
      criadoEm: linha.criadoEm.toISOString(),
      respondidaEm: linha.respondidaEm?.toISOString() ?? null,
    }
    if (linha.status === 'pendente') atual.pendente = dto
    else atual.historico.push(dto)
    porProposta.set(linha.propostaId, atual)
  }

  return porProposta
}
