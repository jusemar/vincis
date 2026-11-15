import { and, countDistinct, desc, eq, inArray, ne, not, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturas, cobrancasPix, empresas, usuarios } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import type { StatusCobranca } from '@/features/pagamentos/constants/cobranca'
import { PLANOS_CONTRATAVEIS, type StatusAssinatura } from '../constants/assinatura'
import { resumoFinanceiroDosPlanos, type ResumoFinanceiroDoPlano } from './mensalidades'
import {
  STATUS_VINCULO_ATIVO,
  situacaoOperacionalDoPlano,
  type EscolhaContador,
  type SituacaoOperacionalDoPlano,
} from '../constants/contador-responsavel'

/**
 * Status de cobrança que encerram a tentativa de pagamento do plano: com o
 * último Pix assim, a reserva de vaga é liberada. O plano continua
 * `aguardando_pagamento` (o cliente pode pedir outro Pix), mas o novo Pix só é
 * emitido depois de conferir de novo a vaga (`actions/pagamento-plano.ts`).
 */
export const STATUS_PIX_QUE_LIBERAM_RESERVA = ['expirada', 'cancelada'] as const

/** O último Pix deste plano expirou ou foi cancelado (SQL, por linha de `assinaturas`). */
function ultimoPixEncerrado(): SQL {
  return sql`exists (
    select 1 from cobrancas_pix c
    where c.finalidade = 'assinatura' and c.referencia_id = ${assinaturas.id}
      and c.status in ('expirada', 'cancelada')
      and c.created_at = (
        select max(c2.created_at) from cobrancas_pix c2
        where c2.finalidade = 'assinatura' and c2.referencia_id = ${assinaturas.id}
      )
  )`
}

/**
 * O plano ocupa uma vaga do contador responsável?
 *
 * - `ativa`: cliente recorrente ativo;
 * - `aguardando_pagamento` ainda apto a ser pago: **reserva** a vaga — inclusive
 *   antes de o primeiro Pix existir;
 * - liberam: último Pix `expirada`/`cancelada`, e os fins `cancelada`/`encerrada`.
 */
export function condicaoOcupaVaga(): SQL {
  return and(
    inArray(assinaturas.planoCodigo, [...PLANOS_CONTRATAVEIS]),
    or(
      inArray(assinaturas.status, [...STATUS_VINCULO_ATIVO]),
      and(eq(assinaturas.status, 'aguardando_pagamento'), not(ultimoPixEncerrado())),
    ),
  ) as SQL
}

export type OcupacaoDoContador = {
  /** Clientes com plano ativo. */
  ativos: number
  /** Clientes só com plano pendente que ainda reserva a vaga. */
  reservados: number
  /** Total que conta contra a capacidade: ativos + reservados. */
  ocupados: number
}

const SEM_OCUPACAO: OcupacaoDoContador = { ativos: 0, reservados: 0, ocupados: 0 }

/**
 * Ocupação de cada contador: **clientes distintos** com plano ativo ou com
 * plano pendente que reserva vaga.
 *
 * Contar clientes distintos é o que impede contar duas vezes: o pendente que
 * vira ativo continua sendo o mesmo cliente, e o cliente com dois planos com o
 * mesmo contador ocupa uma vaga só. É a única contagem de capacidade — lista do
 * cliente em `/precos`, trava da alocação, Pix novo e telas da Gestão.
 */
export async function ocupacaoPorContador(
  contadorIds: string[],
  executor: ExecutorDb = db,
): Promise<Map<string, OcupacaoDoContador>> {
  const mapa = new Map<string, OcupacaoDoContador>()
  if (!contadorIds.length) return mapa
  const linhas = await executor
    .select({
      contadorId: assinaturas.prestadorId,
      ocupados: countDistinct(assinaturas.clienteUsuarioId),
      ativos: sql<number>`count(distinct ${assinaturas.clienteUsuarioId}) filter (where ${assinaturas.status} = 'ativa')`,
    })
    .from(assinaturas)
    .where(and(inArray(assinaturas.prestadorId, contadorIds), condicaoOcupaVaga()))
    .groupBy(assinaturas.prestadorId)
  for (const linha of linhas) {
    if (!linha.contadorId) continue
    const ocupados = Number(linha.ocupados)
    const ativos = Number(linha.ativos)
    mapa.set(linha.contadorId, { ativos, reservados: ocupados - ativos, ocupados })
  }
  return mapa
}

export async function ocupacaoDoContador(contadorId: string, executor: ExecutorDb = db) {
  return (await ocupacaoPorContador([contadorId], executor)).get(contadorId) ?? SEM_OCUPACAO
}

/**
 * O cliente já ocupa uma vaga deste contador (outro plano ativo ou reservado)?
 * Então um plano a mais com ele não consome vaga nova.
 */
export async function clienteJaOcupaVaga(
  executor: ExecutorDb,
  contadorId: string,
  clienteUsuarioId: string,
  excetoAssinaturaId?: string,
): Promise<boolean> {
  const [linha] = await executor
    .select({ id: assinaturas.id })
    .from(assinaturas)
    .where(
      and(
        eq(assinaturas.prestadorId, contadorId),
        eq(assinaturas.clienteUsuarioId, clienteUsuarioId),
        excetoAssinaturaId ? ne(assinaturas.id, excetoAssinaturaId) : undefined,
        condicaoOcupaVaga(),
      ),
    )
    .limit(1)
  return Boolean(linha)
}

/** Plano pendente cuja reserva foi liberada (último Pix expirado/cancelado)? */
export async function reservaDoPlanoLiberada(executor: ExecutorDb, assinaturaId: string): Promise<boolean> {
  const [linha] = await executor
    .select({ id: assinaturas.id })
    .from(assinaturas)
    .where(and(eq(assinaturas.id, assinaturaId), eq(assinaturas.status, 'aguardando_pagamento'), ultimoPixEncerrado()))
    .limit(1)
  return Boolean(linha)
}

export type ClienteVincisDoContador = {
  assinaturaId: string
  cliente: string
  empresa: string | null
  planoNome: string
  periodicidade: string
  contratadoEm: string
  vigenciaInicio: string | null
  statusPlano: StatusAssinatura
  escolhaContador: EscolhaContador | null
  /** Última cobrança Pix do plano, quando houver — para "Pix expirado". */
  ultimaCobranca: StatusCobranca | null
  situacao: SituacaoOperacionalDoPlano
  /** Mensalidades do plano ativo: em dia, aguardando ou em atraso, e o mês atual. */
  financeiro: ResumoFinanceiroDoPlano | null
}

/**
 * "Meus clientes Vincis": planos dos quais o contador é **hoje** o responsável.
 *
 * Filtrado pelo id da sessão no SQL — nunca traz plano de outro contador. Após
 * uma troca, o anterior deixa de ver o plano e o novo passa a ver; o histórico
 * continua na Gestão. Inclui os pendentes de pagamento (para ele saber o que
 * vem), mas não os cancelados nem encerrados.
 */
export async function listarClientesVincisDoContador(contadorId: string): Promise<ClienteVincisDoContador[]> {
  const linhas = await db
    .select({
      assinaturaId: assinaturas.id,
      cliente: usuarios.nome,
      empresa: empresas.nome,
      planoNome: assinaturas.planoNome,
      periodicidade: assinaturas.periodicidade,
      contratadoEm: assinaturas.contratadoEm,
      vigenciaInicio: assinaturas.vigenciaInicio,
      status: assinaturas.status,
      escolhaContador: assinaturas.escolhaContador,
      planoCodigo: assinaturas.planoCodigo,
      valorMensalCentavos: assinaturas.valorMensalCentavos,
    })
    .from(assinaturas)
    .innerJoin(usuarios, eq(usuarios.id, assinaturas.clienteUsuarioId))
    .leftJoin(empresas, eq(empresas.id, usuarios.empresaId))
    .where(
      and(
        eq(assinaturas.prestadorId, contadorId),
        inArray(assinaturas.planoCodigo, [...PLANOS_CONTRATAVEIS]),
        inArray(assinaturas.status, ['aguardando_pagamento', 'ativa']),
      ),
    )
    .orderBy(desc(assinaturas.contratadoEm))
    .limit(200)

  // Situação do Pix só importa enquanto o plano espera pagamento.
  const pendentes = linhas.filter((l) => l.status === 'aguardando_pagamento').map((l) => l.assinaturaId)
  const ultimas = new Map<string, StatusCobranca>()
  if (pendentes.length) {
    const cobrancas = await db
      .select({ referenciaId: cobrancasPix.referenciaId, status: cobrancasPix.status })
      .from(cobrancasPix)
      .where(and(eq(cobrancasPix.finalidade, 'assinatura'), inArray(cobrancasPix.referenciaId, pendentes)))
      .orderBy(desc(cobrancasPix.createdAt))
    for (const c of cobrancas) {
      if (!ultimas.has(c.referenciaId)) ultimas.set(c.referenciaId, c.status as StatusCobranca)
    }
  }

  // Mensalidades (em dia, aguardando, em atraso) dos planos já ativos.
  const financeiro = await resumoFinanceiroDosPlanos(
    linhas.map((l) => ({
      id: l.assinaturaId,
      status: l.status,
      periodicidade: l.periodicidade,
      planoCodigo: l.planoCodigo,
      vigenciaInicio: l.vigenciaInicio,
      valorMensalCentavos: l.valorMensalCentavos,
    })),
  )

  return linhas.map((l) => ({
    assinaturaId: l.assinaturaId,
    cliente: l.cliente,
    empresa: l.empresa,
    planoNome: l.planoNome,
    periodicidade: l.periodicidade,
    contratadoEm: l.contratadoEm.toISOString(),
    vigenciaInicio: l.vigenciaInicio?.toISOString() ?? null,
    statusPlano: l.status as StatusAssinatura,
    escolhaContador: l.escolhaContador as EscolhaContador | null,
    ultimaCobranca: ultimas.get(l.assinaturaId) ?? null,
    situacao: situacaoOperacionalDoPlano(l.status),
    financeiro: financeiro.get(l.assinaturaId) ?? null,
  }))
}
