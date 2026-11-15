import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentos,
  configuracoesPlataforma,
  oportunidadeArquivos,
  oportunidades,
  perfisProfissionais,
} from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante } from '@/features/consultorias/lib/tempo'
import { honorariosDiretos } from '@/features/profissionais/constants/honorarios'
import {
  CHAVE_LIMITE_ARMAZENAMENTO_PRO,
  PERCENTUAL_ALERTA_ARMAZENAMENTO,
  ARMAZENAMENTO_EXTRA_BYTES,
  PLANO_ARMAZENAMENTO_EXTRA,
  PLANO_PERFIL_PRO,
  ROTULO_PERFIL,
  type NivelPerfil,
} from '../constants/perfil-pro'

/**
 * O que cada usuário tem vigente de um plano da Vincis hoje.
 *
 * ## Derivado, não gravado
 *
 * Reaproveita a regra que as assinaturas já têm: uma competência vale entre
 * `periodo_inicio` e `periodo_fim` (datados na confirmação do primeiro
 * pagamento) e só conta quando está **coberta** por pagamento `confirmado`.
 * Vigente = competência coberta que contém o dia de hoje (fuso de São Paulo).
 * Vencido o período, a resposta muda sozinha — sem cron, sem status novo, sem
 * tocar em arquivo nenhum.
 *
 * Devolve o último dia coberto (`ate`) e quantas assinaturas distintas do
 * plano estão vigentes (`quantidade` — é o que soma os adicionais de espaço).
 */
export async function vigenciasDoPlano(
  executor: ExecutorDb,
  planoCodigo: string,
  usuarioIds: string[],
  agora: Date,
): Promise<Map<string, { ate: string; quantidade: number }>> {
  const resultado = new Map<string, { ate: string; quantidade: number }>()
  if (!usuarioIds.length) return resultado
  const hoje = dataLocalDoInstante(agora, TIMEZONE_PADRAO)
  const lista = sql.join(usuarioIds.map((id) => sql`${id}::uuid`), sql`, `)

  const linhas = await executor.execute<{ usuario_id: string; ate: string; quantidade: number }>(sql`
    with cobertas as (
      select a.cliente_usuario_id as usuario_id, a.id as assinatura_id, c.periodo_inicio, c.periodo_fim
      from assinaturas a
      join assinatura_competencias c on c.assinatura_id = a.id
      where a.plano_codigo = ${planoCodigo}
        and a.status = 'ativa'
        and a.cliente_usuario_id in (${lista})
        and c.status <> 'cancelada'
        and c.periodo_inicio is not null
        and (
          select coalesce(sum(al.valor_centavos), 0)
          from assinatura_pagamento_alocacoes al
          join assinatura_pagamentos p on p.id = al.pagamento_id
          where al.competencia_id = c.id and p.status = 'confirmado'
        ) >= c.valor_base_centavos
    ),
    vigentes as (
      select distinct usuario_id, assinatura_id from cobertas
      where periodo_inicio <= ${hoje}::date and periodo_fim >= ${hoje}::date
    )
    select c.usuario_id, max(c.periodo_fim)::text as ate,
      (select count(*) from vigentes v where v.usuario_id = c.usuario_id)::int as quantidade
    from cobertas c
    where c.periodo_fim >= ${hoje}::date
      and c.assinatura_id in (select assinatura_id from vigentes)
    group by c.usuario_id
  `)
  for (const linha of linhas) {
    resultado.set(linha.usuario_id, { ate: linha.ate, quantidade: Number(linha.quantidade) })
  }
  return resultado
}

/** Até quando cada advogado tem Perfil Pro (só quem está vigente hoje). */
export function vigenciasPerfilPro(executor: ExecutorDb, usuarioIds: string[], agora = new Date()) {
  return vigenciasDoPlano(executor, PLANO_PERFIL_PRO, usuarioIds, agora)
}

/** Quantos adicionais de +5 GB pagos e vigentes o advogado tem hoje. */
export async function adicionaisDeArmazenamentoVigentes(
  executor: ExecutorDb,
  prestadorId: string,
  agora = new Date(),
): Promise<number> {
  return (await vigenciasDoPlano(executor, PLANO_ARMAZENAMENTO_EXTRA, [prestadorId], agora)).get(prestadorId)
    ?.quantidade ?? 0
}

export type SituacaoDocumentos = {
  /** `null` = não é advogado: regra de Essencial/Pro não se aplica. */
  nivel: NivelPerfil | null
  /** Documentos podem passar pela Vincis (upload/armazenamento)? */
  documentosPelaVincis: boolean
  /** Último dia do Pro vigente, quando houver. */
  proAte: string | null
}

/** Essencial ou Pro de vários prestadores — para listagem, cards e painéis. */
export async function situacoesDocumentos(
  executor: ExecutorDb,
  prestadorIds: string[],
  agora = new Date(),
): Promise<Map<string, SituacaoDocumentos>> {
  const mapa = new Map<string, SituacaoDocumentos>()
  const ids = Array.from(new Set(prestadorIds.filter(Boolean)))
  if (!ids.length) return mapa
  const perfis = await executor
    .select({ id: perfisProfissionais.usuarioId, tipo: perfisProfissionais.tipoProfissional })
    .from(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  const advogados = perfis.filter((p) => honorariosDiretos(p.tipo)).map((p) => p.id)
  const vigentes = await vigenciasPerfilPro(executor, advogados, agora)
  for (const id of ids) {
    if (!advogados.includes(id)) {
      mapa.set(id, { nivel: null, documentosPelaVincis: true, proAte: null })
      continue
    }
    const vigente = vigentes.get(id)
    mapa.set(id, {
      nivel: vigente ? 'pro' : 'essencial',
      documentosPelaVincis: Boolean(vigente),
      proAte: vigente?.ate ?? null,
    })
  }
  return mapa
}

export async function situacaoDocumentos(
  executor: ExecutorDb,
  prestadorId: string,
  agora = new Date(),
): Promise<SituacaoDocumentos> {
  return (
    (await situacoesDocumentos(executor, [prestadorId], agora)).get(prestadorId) ?? {
      nivel: null,
      documentosPelaVincis: true,
      proAte: null,
    }
  )
}

// ---------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------

/**
 * Bytes ocupados pelos documentos de um advogado na Vincis.
 *
 * Soma o que já é gravado com tamanho: arquivos dos Atendimentos dele
 * (`atendimento_arquivos.tamanho_bytes`, enviados por ele ou pelos Clientes) e
 * anexos dos pedidos de orçamento privados dirigidos a ele
 * (`oportunidade_arquivos.tamanho_bytes`). Nada é estimado.
 */
export async function usoDeArmazenamento(executor: ExecutorDb, prestadorId: string): Promise<number> {
  const [atendimento] = await executor
    .select({ total: sql<number>`coalesce(sum(${atendimentoArquivos.tamanhoBytes}), 0)`.mapWith(Number) })
    .from(atendimentoArquivos)
    .innerJoin(atendimentos, eq(atendimentos.id, atendimentoArquivos.atendimentoId))
    .where(eq(atendimentos.prestadorId, prestadorId))
  const [pedidos] = await executor
    .select({ total: sql<number>`coalesce(sum(${oportunidadeArquivos.tamanhoBytes}), 0)`.mapWith(Number) })
    .from(oportunidadeArquivos)
    .innerJoin(oportunidades, eq(oportunidades.id, oportunidadeArquivos.oportunidadeId))
    .where(eq(oportunidades.destinatarioId, prestadorId))
  return (atendimento?.total ?? 0) + (pedidos?.total ?? 0)
}

/** Espaço incluído no Pro, em bytes (configuração). `null` = não configurado. */
export async function armazenamentoIncluidoNoPro(executor: ExecutorDb): Promise<number | null> {
  const [linha] = await executor
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_LIMITE_ARMAZENAMENTO_PRO))
    .limit(1)
  const bytes = Number(linha?.valor)
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null
}

/**
 * Limite do advogado: o incluído no Pro + 5 GB por adicional pago e vigente.
 * `null` quando o espaço incluído ainda não está configurado.
 */
export async function limiteDeArmazenamento(executor: ExecutorDb, prestadorId: string): Promise<number | null> {
  const [incluido, adicionais] = await Promise.all([
    armazenamentoIncluidoNoPro(executor),
    adicionaisDeArmazenamentoVigentes(executor, prestadorId),
  ])
  return incluido === null ? null : incluido + adicionais * ARMAZENAMENTO_EXTRA_BYTES
}

export type Armazenamento = {
  usadoBytes: number
  limiteBytes: number | null
  percentual: number | null
  proximoDoLimite: boolean
  esgotado: boolean
}

export async function armazenamentoDoPrestador(
  executor: ExecutorDb,
  prestadorId: string,
): Promise<Armazenamento> {
  const [usadoBytes, limiteBytes] = await Promise.all([
    usoDeArmazenamento(executor, prestadorId),
    limiteDeArmazenamento(executor, prestadorId),
  ])
  const percentual = limiteBytes ? Math.min(100, Math.round((usadoBytes / limiteBytes) * 100)) : null
  return {
    usadoBytes,
    limiteBytes,
    percentual,
    proximoDoLimite: percentual !== null && percentual >= PERCENTUAL_ALERTA_ARMAZENAMENTO,
    esgotado: limiteBytes !== null && usadoBytes >= limiteBytes,
  }
}

// ---------------------------------------------------------------------------
// A guarda de servidor
// ---------------------------------------------------------------------------

/** Recusa de documento pela Vincis — mensagem pronta para o usuário. */
export class DocumentoBloqueado extends Error {
  readonly motivo: 'perfil_essencial' | 'armazenamento_esgotado'
  constructor(motivo: DocumentoBloqueado['motivo'], mensagem: string) {
    super(mensagem)
    this.name = 'DocumentoBloqueado'
    this.motivo = motivo
  }
}

export const MENSAGEM_DOCUMENTOS_ESSENCIAL =
  `Este profissional está no ${ROTULO_PERFIL.essencial.nome} e recebe documentos por e-mail, não pela Vincis.`
export const MENSAGEM_ARMAZENAMENTO_ESGOTADO =
  'O espaço de armazenamento deste profissional acabou. Novos documentos não podem ser enviados pela Vincis no momento.'

/**
 * Pode gravar um documento novo para este prestador?
 *
 * Chamada pelos únicos pontos que gravam arquivo de Atendimento e de pedido de
 * orçamento — no servidor, antes do upload. Vale para quem envia e para quem
 * recebe: Cliente enviando a advogado Essencial e advogado Essencial enviando
 * ao Cliente esbarram aqui do mesmo jeito. Texto nunca passa por aqui.
 *
 * Não apaga nem esconde nada já gravado: Pro vencido continua lendo o
 * histórico, só não recebe documento novo.
 */
export async function exigirDocumentosPelaVincis(
  executor: ExecutorDb,
  prestadorId: string,
  bytesNovos: number,
): Promise<void> {
  const situacao = await situacaoDocumentos(executor, prestadorId)
  if (situacao.nivel === null) return
  if (!situacao.documentosPelaVincis) {
    throw new DocumentoBloqueado('perfil_essencial', MENSAGEM_DOCUMENTOS_ESSENCIAL)
  }
  const limite = await limiteDeArmazenamento(executor, prestadorId)
  if (limite !== null && (await usoDeArmazenamento(executor, prestadorId)) + bytesNovos > limite) {
    throw new DocumentoBloqueado('armazenamento_esgotado', MENSAGEM_ARMAZENAMENTO_ESGOTADO)
  }
}

/** O e-mail profissional de contato (nunca o e-mail de login). */
export async function emailProfissionalDeContato(prestadorId: string): Promise<string | null> {
  const [perfil] = await db
    .select({ email: perfisProfissionais.emailProfissional })
    .from(perfisProfissionais)
    .where(and(eq(perfisProfissionais.usuarioId, prestadorId)))
    .limit(1)
  return perfil?.email?.trim() || null
}
