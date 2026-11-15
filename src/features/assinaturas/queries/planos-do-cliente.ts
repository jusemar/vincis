import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturas, usuarios } from '@/db/schema'
import { PLANOS_CONTRATAVEIS, type StatusAssinatura } from '../constants/assinatura'
import { resumoFinanceiroDosPlanos, type ResumoFinanceiroDoPlano } from './mensalidades'

export type PlanoDoCliente = {
  id: string
  planoNome: string
  periodicidade: string
  valorMensalCentavos: number
  status: StatusAssinatura
  contratadoEm: string
  vigenciaInicio: string | null
  canceladoEm: string | null
  contador: string | null
  /** Mensalidades: atual, devida e histórico. Nulo enquanto aguarda o 1º pagamento. */
  financeiro: ResumoFinanceiroDoPlano | null
}

/**
 * Os planos contábeis da Vincis do cliente da sessão — vigentes e cancelados.
 *
 * Filtrado pelo id da sessão no SQL; nunca recebe id do navegador. Os
 * cancelados continuam listados: o histórico da relação é do cliente.
 */
export async function listarPlanosDoCliente(clienteUsuarioId: string): Promise<PlanoDoCliente[]> {
  const linhas = await db
    .select({
      id: assinaturas.id,
      planoNome: assinaturas.planoNome,
      periodicidade: assinaturas.periodicidade,
      valorMensalCentavos: assinaturas.valorMensalCentavos,
      planoCodigo: assinaturas.planoCodigo,
      status: assinaturas.status,
      contratadoEm: assinaturas.contratadoEm,
      vigenciaInicio: assinaturas.vigenciaInicio,
      canceladoEm: assinaturas.canceladoEm,
      contador: usuarios.nome,
    })
    .from(assinaturas)
    .leftJoin(usuarios, eq(usuarios.id, assinaturas.prestadorId))
    .where(and(eq(assinaturas.clienteUsuarioId, clienteUsuarioId), inArray(assinaturas.planoCodigo, [...PLANOS_CONTRATAVEIS])))
    .orderBy(desc(assinaturas.contratadoEm))
    .limit(50)
  const financeiro = await resumoFinanceiroDosPlanos(linhas)
  return linhas.map(({ planoCodigo: _codigo, ...l }) => ({
    ...l,
    status: l.status as StatusAssinatura,
    contratadoEm: l.contratadoEm.toISOString(),
    vigenciaInicio: l.vigenciaInicio?.toISOString() ?? null,
    canceladoEm: l.canceladoEm?.toISOString() ?? null,
    financeiro: financeiro.get(l.id) ?? null,
  }))
}
