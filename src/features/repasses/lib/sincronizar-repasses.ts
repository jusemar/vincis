import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { repassesProfissionais } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { retratoDoContexto } from '@/features/pagamentos/lib/comissao-vincis'
import { PLANOS_CONTRATAVEIS } from '@/features/assinaturas/constants/assinatura'
import type { MotivoRevisao, OrigemRepasse } from '../constants/repasse'
import {
  decidirSituacao,
  dividirAlocacoes,
  prestacaoDaCompetencia,
  prestacaoDaConsulta,
  prestacaoDoAtendimento,
  type Divisao,
} from './regras'

/**
 * Apuração e sincronização do livro de repasses.
 *
 * ## O que entra
 *
 * Só dinheiro **real** recebido pela Vincis via Efí:
 * - contratação do catálogo com cobrança Pix `paga`;
 * - acordo e consulta com pagamento `aprovado` de origem `efi`;
 * - mês de plano Vincis (padrão/consultiva) coberto por pagamento `efi`.
 *
 * Fica fora, de propósito: confirmação manual de homologação, simulações da
 * suíte, honorários de advogado (a Vincis não recebe) e o recorrente direto do
 * Autônomo (não passa pela Vincis). Perfil Pro e armazenamento não têm
 * profissional — são 100% Vincis.
 *
 * ## Idempotência e o que nunca muda
 *
 * A sincronização regrava a situação apurada em toda linha **não repassada**.
 * Linha `repassado` é intocável: o fato do repasse não é reapurado. Quando um
 * mês de plano fica disponível, o profissional dele congela — trocar o
 * contador depois não muda a quem aquele mês prestado pertence.
 */

type Item = {
  origem: OrigemRepasse
  origemId: string
  profissionalId: string | null
  clienteUsuarioId: string
  assinaturaId: string | null
  atendimentoId: string | null
  descricao: string
  referenciaPagamento: string | null
  pagoEm: Date | null
  valorBrutoCentavos: number
  divisao: Divisao | null
  comissaoIndicadorCentavos: number
  situacao: 'aguardando_liberacao' | 'disponivel' | 'em_revisao'
  motivoRevisao: MotivoRevisao | null
}

export type FiltroApuracao = { origem: OrigemRepasse; origemId: string } | null

function divisaoDasColunas(linha: {
  bruto: number
  milesimos: number | null
  comissao: number | null
  profissional: number | null
}): Divisao | null {
  if (linha.milesimos === null || linha.comissao === null || linha.profissional === null) return null
  // Só aceita retrato que fecha com o bruto — mesma regra de `colunasDoRetrato`.
  if (linha.comissao + linha.profissional !== linha.bruto) return null
  return { milesimos: linha.milesimos, comissaoCentavos: linha.comissao, profissionalCentavos: linha.profissional }
}

function filtroPor(filtro: FiltroApuracao, origem: OrigemRepasse, coluna: SQL): SQL {
  if (!filtro) return sql``
  return filtro.origem === origem ? sql`and ${coluna} = ${filtro.origemId}` : sql`and false`
}

const truncar = (texto: string, limite = 200) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto)

type LinhaAvulsa = {
  origem_id: string
  profissional_id: string | null
  cliente_usuario_id: string
  descricao: string | null
  referencia: string | null
  pago_em: Date | string | null
  bruto: number
  milesimos: number | null
  comissao: number | null
  profissional: number | null
  status_contratacao: string | null
  atendimento_id: string | null
  status_atendimento: string | null
  status_agendamento: string | null
  indicador: number
}

function itemAvulso(origem: Exclude<OrigemRepasse, 'competencia'>, linha: LinhaAvulsa, rotulo: string): Item {
  const divisao = divisaoDasColunas(linha)
  const prestacao =
    origem === 'consultoria'
      ? prestacaoDaConsulta(linha.status_agendamento)
      : prestacaoDoAtendimento(linha.status_contratacao, linha.status_atendimento)
  const decisao = decidirSituacao({
    estornado: false,
    divisao: divisao ? 'ok' : 'sem_retrato',
    prestacao,
    coberturaCompleta: true,
    profissionalId: linha.profissional_id,
  })
  return {
    origem,
    origemId: linha.origem_id,
    profissionalId: linha.profissional_id,
    clienteUsuarioId: linha.cliente_usuario_id,
    assinaturaId: null,
    atendimentoId: linha.atendimento_id,
    descricao: truncar(`${rotulo}${linha.descricao ? ` · ${linha.descricao}` : ''}`),
    referenciaPagamento: linha.referencia,
    pagoEm: linha.pago_em ? new Date(linha.pago_em) : null,
    valorBrutoCentavos: linha.bruto,
    divisao,
    comissaoIndicadorCentavos: Number(linha.indicador) || 0,
    ...decisao,
  }
}

async function apurarServicos(executor: ExecutorDb, filtro: FiltroApuracao): Promise<Item[]> {
  const linhas = await executor.execute<LinhaAvulsa>(sql`
    select cs.id as origem_id, cs.prestador_id as profissional_id, cs.cliente_usuario_id,
           cs.nome_servico_snapshot as descricao, cp.txid as referencia, cp.paga_em as pago_em,
           cs.valor_snapshot_centavos as bruto,
           cs.comissao_vincis_milesimos as milesimos, cs.comissao_vincis_centavos as comissao,
           cs.valor_profissional_centavos as profissional,
           cs.status as status_contratacao, a.id as atendimento_id, a.status as status_atendimento,
           null::varchar as status_agendamento,
           coalesce((select sum(pc.valor_centavos) from parceiro_comissoes pc
                     where pc.contratacao_id = cs.id and pc.status <> 'cancelada'), 0)::int as indicador
      from contratacoes_servico cs
      join cobrancas_pix cp on cp.id = cs.cobranca_id and cp.status = 'paga'
      left join lateral (select id, status from atendimentos where contratacao_id = cs.id
                         order by created_at limit 1) a on true
     where cs.valor_snapshot_centavos > 0 ${filtroPor(filtro, 'servico', sql`cs.id`)}`)
  return linhas.map((linha) => itemAvulso('servico', linha, 'Serviço'))
}

async function apurarAcordos(executor: ExecutorDb, filtro: FiltroApuracao): Promise<Item[]> {
  const linhas = await executor.execute<LinhaAvulsa>(sql`
    select op.id as origem_id, op.prestador_id as profissional_id, op.cliente_usuario_id,
           o.titulo as descricao, op.referencia, op.aprovado_em as pago_em, op.valor_centavos as bruto,
           op.comissao_vincis_milesimos as milesimos, op.comissao_vincis_centavos as comissao,
           op.valor_profissional_centavos as profissional,
           null::varchar as status_contratacao, a.id as atendimento_id, a.status as status_atendimento,
           null::varchar as status_agendamento, 0 as indicador
      from oportunidade_pagamentos op
      join oportunidades o on o.id = op.oportunidade_id
      left join lateral (select id, status from atendimentos where oportunidade_id = op.oportunidade_id
                         order by created_at limit 1) a on true
     where op.origem = 'efi' and op.status = 'aprovado' and op.valor_centavos > 0
           ${filtroPor(filtro, 'acordo', sql`op.id`)}`)
  return linhas.map((linha) => itemAvulso('acordo', linha, 'Orçamento'))
}

async function apurarConsultorias(executor: ExecutorDb, filtro: FiltroApuracao): Promise<Item[]> {
  const linhas = await executor.execute<LinhaAvulsa>(sql`
    select p.id as origem_id, p.prestador_id as profissional_id, p.cliente_usuario_id,
           to_char(ag.inicio_em at time zone 'UTC' at time zone coalesce(ag.timezone, 'America/Sao_Paulo'),
                   'DD/MM/YYYY HH24:MI') as descricao,
           p.referencia, p.aprovado_em as pago_em, p.valor_centavos as bruto,
           p.comissao_vincis_milesimos as milesimos, p.comissao_vincis_centavos as comissao,
           p.valor_profissional_centavos as profissional,
           null::varchar as status_contratacao,
           (select id from atendimentos where consultoria_agendamento_id = p.agendamento_id
             order by created_at limit 1) as atendimento_id,
           null::varchar as status_atendimento, ag.status as status_agendamento, 0 as indicador
      from consultoria_pagamentos p
      left join consultoria_agendamentos ag on ag.id = p.agendamento_id
     where p.origem = 'efi' and p.status = 'aprovado' and p.valor_centavos > 0
           ${filtroPor(filtro, 'consultoria', sql`p.id`)}`)
  return linhas.map((linha) => itemAvulso('consultoria', linha, 'Consultoria'))
}

type LinhaAlocacao = {
  competencia_id: string
  numero: number
  status_competencia: string
  valor_base: number
  assinatura_id: string
  prestador_id: string | null
  cliente_usuario_id: string
  plano_nome: string
  valor_alocado: number
  status_pagamento: string
  id_externo: string | null
  confirmado_em: Date | string | null
  contexto: unknown
  indicador: number
}

async function apurarCompetencias(executor: ExecutorDb, filtro: FiltroApuracao): Promise<Item[]> {
  const planos = sql.join(
    PLANOS_CONTRATAVEIS.map((codigo) => sql`${codigo}`),
    sql`, `,
  )
  const linhas = await executor.execute<LinhaAlocacao>(sql`
    select c.id as competencia_id, c.numero, c.status as status_competencia, c.valor_base_centavos as valor_base,
           a.id as assinatura_id, a.prestador_id, a.cliente_usuario_id, a.plano_nome,
           al.valor_centavos as valor_alocado, ap.status as status_pagamento, ap.id_externo,
           ap.confirmado_em, cp.contexto,
           coalesce((select sum(pc.valor_centavos) from parceiro_comissoes pc
                     where pc.competencia_id = c.id and pc.status <> 'cancelada'), 0)::int as indicador
      from assinatura_competencias c
      join assinaturas a on a.id = c.assinatura_id and a.plano_codigo in (${planos})
      join assinatura_pagamento_alocacoes al on al.competencia_id = c.id
      join assinatura_pagamentos ap on ap.id = al.pagamento_id
           and ap.provedor = 'efi' and ap.status in ('confirmado', 'estornado')
      left join cobrancas_pix cp on cp.txid = ap.id_externo and cp.finalidade = 'assinatura'
     where true ${filtroPor(filtro, 'competencia', sql`c.id`)}
     order by c.id, ap.confirmado_em`)

  const porCompetencia = new Map<string, LinhaAlocacao[]>()
  for (const linha of linhas) {
    const grupo = porCompetencia.get(linha.competencia_id) ?? []
    grupo.push(linha)
    porCompetencia.set(linha.competencia_id, grupo)
  }

  const itens: Item[] = []
  for (const grupo of porCompetencia.values()) {
    const base = grupo[0]
    const estornado = grupo.some((l) => l.status_pagamento === 'estornado')
    const confirmadas = grupo.filter((l) => l.status_pagamento === 'confirmado')
    // O bruto é o dinheiro que entrou para este mês — confirmado ou estornado
    // (o estornado fica visível na revisão, com o valor que chegou a entrar).
    const bruto = grupo.reduce((soma, l) => soma + l.valor_alocado, 0)
    const resultado = dividirAlocacoes(
      grupo.map((l) => ({ valorCentavos: l.valor_alocado, milesimos: retratoDoContexto(l.contexto)?.milesimos ?? null })),
    )
    const coberto = confirmadas.reduce((soma, l) => soma + l.valor_alocado, 0)
    const decisao = decidirSituacao({
      estornado,
      divisao: resultado.tipo,
      prestacao: prestacaoDaCompetencia(base.status_competencia),
      coberturaCompleta: base.valor_base > 0 && coberto >= base.valor_base,
      profissionalId: base.prestador_id,
    })
    const pagoEm = confirmadas.at(-1)?.confirmado_em ?? base.confirmado_em
    itens.push({
      origem: 'competencia',
      origemId: base.competencia_id,
      profissionalId: base.prestador_id,
      clienteUsuarioId: base.cliente_usuario_id,
      assinaturaId: base.assinatura_id,
      atendimentoId: null,
      descricao: truncar(`Plano · ${base.plano_nome} · mês ${base.numero}`),
      referenciaPagamento: truncar(
        [...new Set(grupo.map((l) => l.id_externo).filter(Boolean))].join(', '),
      ) || null,
      pagoEm: pagoEm ? new Date(pagoEm) : null,
      valorBrutoCentavos: bruto,
      divisao: resultado.tipo === 'ok' ? resultado.divisao : null,
      comissaoIndicadorCentavos: Number(base.indicador) || 0,
      ...decisao,
    })
  }
  return itens
}

/** Tudo o que o livro deveria conter agora (ou só uma origem). */
export async function apurarRepasses(executor: ExecutorDb = db, filtro: FiltroApuracao = null): Promise<Item[]> {
  const grupos = await Promise.all([
    apurarServicos(executor, filtro),
    apurarAcordos(executor, filtro),
    apurarConsultorias(executor, filtro),
    apurarCompetencias(executor, filtro),
  ])
  return grupos.flat().filter((item) => item.valorBrutoCentavos > 0)
}

const t = repassesProfissionais

/**
 * Grava a apuração no livro. Idempotente; nunca toca linha `repassado`.
 *
 * Executada ao abrir a tela de repasses e, sob trava, antes de registrar um
 * repasse — a Gestão sempre decide sobre o estado atual das fontes.
 */
export async function sincronizarRepasses(
  executor: ExecutorDb = db,
  filtro: FiltroApuracao = null,
): Promise<{ apurados: number }> {
  const itens = await apurarRepasses(executor, filtro)
  if (!itens.length) return { apurados: 0 }

  const agora = new Date()
  const LOTE = 200
  for (let i = 0; i < itens.length; i += LOTE) {
    const lote = itens.slice(i, i + LOTE)
    await executor
      .insert(t)
      .values(
        lote.map((item) => ({
          origem: item.origem,
          origemId: item.origemId,
          profissionalId: item.profissionalId,
          clienteUsuarioId: item.clienteUsuarioId,
          assinaturaId: item.assinaturaId,
          atendimentoId: item.atendimentoId,
          descricao: item.descricao,
          referenciaPagamento: item.referenciaPagamento,
          pagoEm: item.pagoEm,
          valorBrutoCentavos: item.valorBrutoCentavos,
          comissaoVincisMilesimos: item.divisao?.milesimos ?? null,
          comissaoVincisCentavos: item.divisao?.comissaoCentavos ?? null,
          valorProfissionalCentavos: item.divisao?.profissionalCentavos ?? null,
          comissaoIndicadorCentavos: item.comissaoIndicadorCentavos,
          situacao: item.situacao,
          motivoRevisao: item.motivoRevisao,
          liberadoEm: item.situacao === 'disponivel' ? agora : null,
          createdAt: agora,
          updatedAt: agora,
        })),
      )
      .onConflictDoUpdate({
        target: [t.origem, t.origemId],
        set: {
          // O profissional de um item já disponível fica congelado.
          profissionalId: sql`case when ${t.situacao} = 'disponivel' and ${t.profissionalId} is not null
                                   and excluded.situacao = 'disponivel'
                              then ${t.profissionalId} else excluded.profissional_id end`,
          clienteUsuarioId: sql`excluded.cliente_usuario_id`,
          assinaturaId: sql`excluded.assinatura_id`,
          atendimentoId: sql`excluded.atendimento_id`,
          descricao: sql`excluded.descricao`,
          referenciaPagamento: sql`excluded.referencia_pagamento`,
          pagoEm: sql`excluded.pago_em`,
          valorBrutoCentavos: sql`excluded.valor_bruto_centavos`,
          comissaoVincisMilesimos: sql`excluded.comissao_vincis_milesimos`,
          comissaoVincisCentavos: sql`excluded.comissao_vincis_centavos`,
          valorProfissionalCentavos: sql`excluded.valor_profissional_centavos`,
          comissaoIndicadorCentavos: sql`excluded.comissao_indicador_centavos`,
          situacao: sql`excluded.situacao`,
          motivoRevisao: sql`excluded.motivo_revisao`,
          // Mantém a primeira data de liberação enquanto continuar disponível.
          liberadoEm: sql`case when excluded.situacao = 'disponivel'
                          then coalesce(${t.liberadoEm}, excluded.liberado_em) else null end`,
          updatedAt: sql`case when ${t.situacao} is distinct from excluded.situacao
                              or ${t.valorProfissionalCentavos} is distinct from excluded.valor_profissional_centavos
                              or ${t.comissaoIndicadorCentavos} is distinct from excluded.comissao_indicador_centavos
                         then excluded.updated_at else ${t.updatedAt} end`,
        },
        setWhere: sql`${t.situacao} <> 'repassado'`,
      })
  }
  return { apurados: itens.length }
}
