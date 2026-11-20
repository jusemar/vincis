import { and, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import { repassesProfissionais, usuarios } from '@/db/schema'
import {
  REPASSES_POR_PAGINA,
  SITUACOES_REPASSE,
  type MotivoRevisao,
  type OrigemRepasse,
  type SituacaoRepasse,
} from '../constants/repasse'
import { liquidoDaVincis } from '../lib/regras'

export type FiltroRepasses = SituacaoRepasse | 'todos'

export type RepasseGestao = {
  id: string
  origem: OrigemRepasse
  descricao: string
  profissional: { id: string; nome: string; email: string | null } | null
  cliente: { nome: string; email: string | null }
  referenciaPagamento: string | null
  pagoEm: string | null
  valorBrutoCentavos: number
  comissaoVincisMilesimos: number | null
  comissaoVincisCentavos: number | null
  valorProfissionalCentavos: number | null
  comissaoIndicadorCentavos: number
  liquidoVincisCentavos: number | null
  situacao: SituacaoRepasse
  motivoRevisao: MotivoRevisao | null
  liberadoEm: string | null
  repassadoEm: string | null
  repassadoPor: string | null
  comprovante: string | null
  observacao: string | null
}

export type ResumoRepasses = Record<SituacaoRepasse, { quantidade: number; profissionalCentavos: number }>

export function filtroDeRepasses(valor: string | undefined): FiltroRepasses {
  return (SITUACOES_REPASSE as readonly string[]).includes(valor ?? '') ? (valor as SituacaoRepasse) : 'todos'
}

/** Livro de repasses para a Gestão: página filtrada + resumo por situação. */
export async function listarRepassesGestao({ filtro, pagina }: { filtro: FiltroRepasses; pagina: number }) {
  const t = repassesProfissionais
  const profissional = alias(usuarios, 'profissional')
  const cliente = alias(usuarios, 'cliente')
  const gestor = alias(usuarios, 'gestor')
  const paginaSegura = Math.max(1, Math.floor(pagina) || 1)
  const condicao = filtro === 'todos' ? undefined : eq(t.situacao, filtro)

  const [linhas, totais] = await Promise.all([
    db
      .select({
        repasse: t,
        profissional: { id: profissional.id, nome: profissional.nome, email: profissional.email },
        cliente: { nome: cliente.nome, email: cliente.email },
        gestorNome: gestor.nome,
      })
      .from(t)
      .leftJoin(profissional, eq(profissional.id, t.profissionalId))
      .innerJoin(cliente, eq(cliente.id, t.clienteUsuarioId))
      .leftJoin(gestor, eq(gestor.id, t.repassadoPorId))
      .where(condicao ? and(condicao) : undefined)
      // Disponíveis primeiro (o que pede ação), depois o mais recente.
      .orderBy(sql`case ${t.situacao} when 'disponivel' then 0 when 'em_revisao' then 1 when 'aguardando_liberacao' then 2 else 3 end`, desc(t.pagoEm), desc(t.createdAt))
      .limit(REPASSES_POR_PAGINA)
      .offset((paginaSegura - 1) * REPASSES_POR_PAGINA),
    db
      .select({
        situacao: t.situacao,
        quantidade: sql<number>`count(*)::int`,
        profissionalCentavos: sql<number>`coalesce(sum(${t.valorProfissionalCentavos}), 0)::bigint`,
      })
      .from(t)
      .groupBy(t.situacao),
  ])

  const resumo = Object.fromEntries(
    SITUACOES_REPASSE.map((s) => [s, { quantidade: 0, profissionalCentavos: 0 }]),
  ) as ResumoRepasses
  for (const linha of totais) {
    resumo[linha.situacao as SituacaoRepasse] = {
      quantidade: Number(linha.quantidade),
      profissionalCentavos: Number(linha.profissionalCentavos),
    }
  }
  const total = filtro === 'todos'
    ? SITUACOES_REPASSE.reduce((soma, s) => soma + resumo[s].quantidade, 0)
    : resumo[filtro].quantidade

  const repasses: RepasseGestao[] = linhas.map(({ repasse: r, profissional: p, cliente: c, gestorNome }) => ({
    id: r.id,
    origem: r.origem as OrigemRepasse,
    descricao: r.descricao,
    profissional: p?.id ? { id: p.id, nome: p.nome, email: p.email } : null,
    cliente: { nome: c.nome, email: c.email },
    referenciaPagamento: r.referenciaPagamento,
    pagoEm: r.pagoEm?.toISOString() ?? null,
    valorBrutoCentavos: r.valorBrutoCentavos,
    comissaoVincisMilesimos: r.comissaoVincisMilesimos,
    comissaoVincisCentavos: r.comissaoVincisCentavos,
    valorProfissionalCentavos: r.valorProfissionalCentavos,
    comissaoIndicadorCentavos: r.comissaoIndicadorCentavos,
    liquidoVincisCentavos: liquidoDaVincis(r.comissaoVincisCentavos, r.comissaoIndicadorCentavos),
    situacao: r.situacao as SituacaoRepasse,
    motivoRevisao: (r.motivoRevisao as MotivoRevisao | null) ?? null,
    liberadoEm: r.liberadoEm?.toISOString() ?? null,
    repassadoEm: r.repassadoEm?.toISOString() ?? null,
    repassadoPor: gestorNome ?? null,
    comprovante: r.comprovante,
    observacao: r.observacao,
  }))

  return { repasses, resumo, total, pagina: paginaSegura, porPagina: REPASSES_POR_PAGINA, filtro }
}
