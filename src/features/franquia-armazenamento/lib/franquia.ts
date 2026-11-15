import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  configuracoesPlataforma,
  documentosFiscaisArquivos,
  empresaMembros,
  perfisProfissionais,
} from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import {
  DocumentoBloqueado,
  exigirDocumentosPelaVincis,
  usoDeArmazenamento,
  vigenciasDoPlano,
} from '@/features/perfil-pro/lib/perfil-pro'
import { PERCENTUAL_ALERTA_ARMAZENAMENTO } from '@/features/perfil-pro/constants/perfil-pro'
import { TIPO_PROFISSIONAL_COM_MODELO } from '@/features/profissionais/constants/modelo-contratacao'
import {
  BLOCO_EXTRA_BYTES,
  CHAVE_FRANQUIA_AUTONOMO,
  MENSAGEM_FRANQUIA_ESGOTADA,
  PLANO_ARMAZENAMENTO_AUTONOMO,
} from '../constants/franquia'

/** Contador com `modelo_contratacao = 'autonomo'` — o único com franquia. */
export async function ehContadorAutonomo(executor: ExecutorDb, prestadorId: string): Promise<boolean> {
  const [perfil] = await executor
    .select({ id: perfisProfissionais.id })
    .from(perfisProfissionais)
    .where(
      and(
        eq(perfisProfissionais.usuarioId, prestadorId),
        eq(perfisProfissionais.tipoProfissional, TIPO_PROFISSIONAL_COM_MODELO),
        eq(perfisProfissionais.modeloContratacao, 'autonomo'),
      ),
    )
    .limit(1)
  return Boolean(perfil)
}

/**
 * Bytes que o Autônomo ocupa na Vincis — todas as fontes privadas com tamanho
 * gravado, nada estimado:
 *
 * - arquivos dos Atendimentos dele e anexos dos pedidos dirigidos a ele (a
 *   mesma soma do Perfil Pro);
 * - XMLs originais da Central de Documentos Fiscais dos escritórios de que ele
 *   é proprietário ativo.
 *
 * Ficam de fora a foto pública do perfil e o comprovante de registro do
 * cadastro: não são armazenamento de trabalho, e o comprovante é exigência da
 * própria Vincis.
 */
export async function usoDoAutonomo(executor: ExecutorDb, prestadorId: string): Promise<number> {
  const [trabalho, [fiscal]] = await Promise.all([
    usoDeArmazenamento(executor, prestadorId),
    executor
      .select({ total: sql<number>`coalesce(sum(${documentosFiscaisArquivos.tamanhoBytes}), 0)`.mapWith(Number) })
      .from(documentosFiscaisArquivos)
      .where(
        inArray(
          documentosFiscaisArquivos.empresaId,
          executor
            .select({ id: empresaMembros.empresaId })
            .from(empresaMembros)
            .where(
              and(
                eq(empresaMembros.usuarioId, prestadorId),
                eq(empresaMembros.funcao, 'proprietario'),
                eq(empresaMembros.status, 'ativo'),
              ),
            ),
        ),
      ),
  ])
  return trabalho + (fiscal?.total ?? 0)
}

/** Franquia gratuita configurada, em bytes. `null` = não configurada. */
export async function franquiaGratuitaBytes(executor: ExecutorDb): Promise<number | null> {
  const [linha] = await executor
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_FRANQUIA_AUTONOMO))
    .limit(1)
  const bytes = Number(linha?.valor)
  return Number.isFinite(bytes) && bytes > 0 ? bytes : null
}

/** Blocos de +5 GB pagos e vigentes hoje (vencido deixa de contar). */
export async function blocosExtrasVigentes(executor: ExecutorDb, prestadorId: string, agora = new Date()) {
  return (await vigenciasDoPlano(executor, PLANO_ARMAZENAMENTO_AUTONOMO, [prestadorId], agora)).get(prestadorId)
    ?.quantidade ?? 0
}

export type FranquiaAutonomo = {
  usadoBytes: number
  franquiaBytes: number | null
  blocosExtras: number
  /** Franquia + 5 GB por bloco vigente. `null` quando a franquia não está configurada. */
  limiteBytes: number | null
  percentual: number | null
  proximoDoLimite: boolean
  esgotado: boolean
}

export async function franquiaDoAutonomo(
  executor: ExecutorDb,
  prestadorId: string,
  agora = new Date(),
): Promise<FranquiaAutonomo> {
  const [usadoBytes, franquiaBytes, blocosExtras] = await Promise.all([
    usoDoAutonomo(executor, prestadorId),
    franquiaGratuitaBytes(executor),
    blocosExtrasVigentes(executor, prestadorId, agora),
  ])
  const limiteBytes = franquiaBytes === null ? null : franquiaBytes + blocosExtras * BLOCO_EXTRA_BYTES
  const percentual = limiteBytes ? Math.min(100, Math.round((usadoBytes / limiteBytes) * 100)) : null
  return {
    usadoBytes,
    franquiaBytes,
    blocosExtras,
    limiteBytes,
    percentual,
    proximoDoLimite: percentual !== null && percentual >= PERCENTUAL_ALERTA_ARMAZENAMENTO,
    esgotado: limiteBytes !== null && usadoBytes >= limiteBytes,
  }
}

/**
 * Cabe um arquivo novo na franquia do Autônomo?
 *
 * Só recusa **novos** uploads: o que já está guardado continua acessível, e
 * um bloco extra vencido não apaga nada. Para quem não é Autônomo, não faz
 * nada.
 */
export async function exigirFranquiaDoAutonomo(
  executor: ExecutorDb,
  prestadorId: string,
  bytesNovos: number,
  agora = new Date(),
): Promise<void> {
  if (!(await ehContadorAutonomo(executor, prestadorId))) return
  const franquia = await franquiaDoAutonomo(executor, prestadorId, agora)
  if (franquia.limiteBytes !== null && franquia.usadoBytes + bytesNovos > franquia.limiteBytes) {
    throw new DocumentoBloqueado('armazenamento_esgotado', MENSAGEM_FRANQUIA_ESGOTADA)
  }
}

/**
 * A guarda única de documento novo ligado a um prestador.
 *
 * Primeiro a regra jurídica, intacta (Essencial/Pro e limite do Pro — só
 * advogado); depois a franquia do Autônomo — só contador Autônomo. Cada uma
 * ignora quem não é dela.
 */
export async function exigirEspacoParaDocumento(
  executor: ExecutorDb,
  prestadorId: string,
  bytesNovos: number,
): Promise<void> {
  await exigirDocumentosPelaVincis(executor, prestadorId, bytesNovos)
  await exigirFranquiaDoAutonomo(executor, prestadorId, bytesNovos)
}

/**
 * Central de Documentos Fiscais: o arquivo é do escritório, e a franquia é do
 * proprietário dele. Escritório sem proprietário Autônomo não tem limite.
 */
export async function exigirFranquiaDoEscritorio(
  executor: ExecutorDb,
  empresaId: string,
  bytesNovos: number,
): Promise<void> {
  const proprietarios = await executor
    .select({ usuarioId: empresaMembros.usuarioId })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.funcao, 'proprietario'),
        eq(empresaMembros.status, 'ativo'),
      ),
    )
  for (const { usuarioId } of proprietarios) {
    await exigirFranquiaDoAutonomo(executor, usuarioId, bytesNovos)
  }
}
