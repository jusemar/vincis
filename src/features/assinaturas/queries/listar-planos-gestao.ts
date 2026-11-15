import { and, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import { assinaturaContadorAlocacoes, assinaturas, eventosAuditoria, usuarios } from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import type { OrigemCancelamento } from '../constants/cancelamento'
import { PLANOS_CONTRATAVEIS, type StatusAssinatura } from '../constants/assinatura'
import type { EscolhaContador, OrigemAlocacao } from '../constants/contador-responsavel'

export const PLANOS_POR_PAGINA = 20

export type FiltroPlanosGestao = 'todos' | 'aguardando_alocacao' | 'cancelados'

export type AlocacaoHistorico = {
  id: string
  anterior: string | null
  /** Nulo = devolvido à Vincis (o plano ficou aguardando alocação). */
  novo: string | null
  origem: OrigemAlocacao
  alteradoPor: string
  motivo: string | null
  em: string
}

export type PlanoGestao = {
  id: string
  planoNome: string
  periodicidade: string
  meses: number
  valorMensalCentavos: number
  status: StatusAssinatura
  contratadoEm: string
  cliente: { nome: string; email: string }
  contador: { id: string; nome: string } | null
  escolhaContador: EscolhaContador | null
  historico: AlocacaoHistorico[]
  /** Preenchido nos cancelados: quando, por quem (da auditoria) e por quê. */
  cancelamento: {
    em: string
    motivo: string | null
    por: string | null
    origem: OrigemCancelamento | null
  } | null
}

/**
 * Planos contábeis contratados da Vincis, para a Gestão alocar e trocar o
 * contador responsável.
 *
 * Só os planos da vitrine (`padrao`, `consultiva`) — Perfil Pro e
 * armazenamento são pagamentos do profissional e não têm contador. Canceladas
 * e encerradas ficam de fora: não há o que alocar. Paginado; o histórico vem
 * só das assinaturas da página.
 */
export async function listarPlanosGestao(entrada: { filtro?: FiltroPlanosGestao; pagina?: number } = {}) {
  const filtro = entrada.filtro ?? 'todos'
  const pagina = Math.max(1, Math.floor(entrada.pagina ?? 1))
  const condicoes: SQL[] = [
    inArray(assinaturas.planoCodigo, [...PLANOS_CONTRATAVEIS]),
    filtro === 'cancelados'
      ? eq(assinaturas.status, 'cancelada')
      : inArray(assinaturas.status, ['aguardando_pagamento', 'ativa']),
  ]
  if (filtro === 'aguardando_alocacao') condicoes.push(isNull(assinaturas.prestadorId))
  const onde = and(...condicoes)

  const cliente = alias(usuarios, 'cliente')
  const contador = alias(usuarios, 'contador')
  const [linhas, [total]] = await Promise.all([
    db
      .select({
        id: assinaturas.id,
        planoNome: assinaturas.planoNome,
        periodicidade: assinaturas.periodicidade,
        meses: assinaturas.meses,
        valorMensalCentavos: assinaturas.valorMensalCentavos,
        status: assinaturas.status,
        contratadoEm: assinaturas.contratadoEm,
        escolhaContador: assinaturas.escolhaContador,
        clienteNome: cliente.nome,
        clienteEmail: cliente.email,
        contadorId: contador.id,
        contadorNome: contador.nome,
        canceladoEm: assinaturas.canceladoEm,
        cancelamentoMotivo: assinaturas.cancelamentoMotivo,
      })
      .from(assinaturas)
      .innerJoin(cliente, eq(cliente.id, assinaturas.clienteUsuarioId))
      .leftJoin(contador, eq(contador.id, assinaturas.prestadorId))
      .where(onde)
      .orderBy(filtro === 'cancelados' ? desc(assinaturas.canceladoEm) : desc(assinaturas.contratadoEm))
      .limit(PLANOS_POR_PAGINA)
      .offset((pagina - 1) * PLANOS_POR_PAGINA),
    db.select({ total: count() }).from(assinaturas).where(onde),
  ])

  const historicos = new Map<string, AlocacaoHistorico[]>()
  if (linhas.length) {
    const anterior = alias(usuarios, 'anterior')
    const novo = alias(usuarios, 'novo')
    const autor = alias(usuarios, 'autor')
    const eventos = await db
      .select({
        id: assinaturaContadorAlocacoes.id,
        assinaturaId: assinaturaContadorAlocacoes.assinaturaId,
        anterior: anterior.nome,
        novo: novo.nome,
        origem: assinaturaContadorAlocacoes.origem,
        alteradoPor: autor.nome,
        motivo: assinaturaContadorAlocacoes.motivo,
        em: assinaturaContadorAlocacoes.createdAt,
      })
      .from(assinaturaContadorAlocacoes)
      .leftJoin(anterior, eq(anterior.id, assinaturaContadorAlocacoes.contadorAnteriorId))
      .leftJoin(novo, eq(novo.id, assinaturaContadorAlocacoes.contadorNovoId))
      .innerJoin(autor, eq(autor.id, assinaturaContadorAlocacoes.alteradoPorId))
      .where(inArray(assinaturaContadorAlocacoes.assinaturaId, linhas.map((l) => l.id)))
      .orderBy(desc(assinaturaContadorAlocacoes.createdAt))
    for (const evento of eventos) {
      const lista = historicos.get(evento.assinaturaId) ?? []
      lista.push({
        id: evento.id,
        anterior: evento.anterior,
        novo: evento.novo,
        origem: evento.origem as OrigemAlocacao,
        alteradoPor: evento.alteradoPor,
        motivo: evento.motivo,
        em: evento.em.toISOString(),
      })
      historicos.set(evento.assinaturaId, lista)
    }
  }

  // Quem cancelou e de onde: o registro de auditoria do cancelamento.
  const cancelamentos = new Map<string, { por: string | null; origem: OrigemCancelamento | null }>()
  const canceladas = linhas.filter((l) => l.status === 'cancelada').map((l) => l.id)
  if (canceladas.length) {
    const autor = alias(usuarios, 'autor_cancelamento')
    const eventos = await db
      .select({
        assinaturaId: eventosAuditoria.registroAfetado,
        por: autor.nome,
        metadados: eventosAuditoria.metadados,
      })
      .from(eventosAuditoria)
      .leftJoin(autor, eq(autor.id, eventosAuditoria.autorId))
      .where(
        and(
          eq(eventosAuditoria.acao, ACOES_AUDITORIA.assinaturaCancelada),
          inArray(eventosAuditoria.registroAfetado, canceladas),
        ),
      )
      .orderBy(desc(eventosAuditoria.createdAt))
    for (const evento of eventos) {
      if (!evento.assinaturaId || cancelamentos.has(evento.assinaturaId)) continue
      const origem = (evento.metadados as { origem?: string } | null)?.origem
      cancelamentos.set(evento.assinaturaId, {
        por: evento.por,
        origem: origem === 'cliente' || origem === 'gestor' ? origem : null,
      })
    }
  }

  const planos: PlanoGestao[] = linhas.map((l) => ({
    id: l.id,
    planoNome: l.planoNome,
    periodicidade: l.periodicidade,
    meses: l.meses,
    valorMensalCentavos: l.valorMensalCentavos,
    status: l.status as StatusAssinatura,
    contratadoEm: l.contratadoEm.toISOString(),
    cliente: { nome: l.clienteNome, email: l.clienteEmail },
    contador: l.contadorId && l.contadorNome ? { id: l.contadorId, nome: l.contadorNome } : null,
    escolhaContador: l.escolhaContador as EscolhaContador | null,
    historico: historicos.get(l.id) ?? [],
    cancelamento: l.canceladoEm
      ? {
          em: l.canceladoEm.toISOString(),
          motivo: l.cancelamentoMotivo,
          por: cancelamentos.get(l.id)?.por ?? null,
          origem: cancelamentos.get(l.id)?.origem ?? null,
        }
      : null,
  }))

  return { planos, total: total?.total ?? 0, pagina, porPagina: PLANOS_POR_PAGINA, filtro }
}
