import { and, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import { comunicados, usuarios } from '@/db/schema'
import type { PerfilTipo } from '@/features/usuarios/types'
import type {
  AudienciaComunicado,
  StatusComunicado,
  TipoComunicado,
} from '../constants/comunicado'
import { audienciasVisiveis } from '../lib/audiencia'
import type { ComunicadoDTO, ComunicadoGestaoDTO } from '../types/comunicado'

const autorConta = alias(usuarios, 'comunicado_autor')

/** Quantos comunicados o card do Dashboard carrega. Ele é um mural, não um arquivo. */
export const LIMITE_COMUNICADOS_MURAL = 10

/**
 * Comunicados que uma pessoa vê no Dashboard.
 *
 * Três recortes, todos no SQL: publicado, dentro da audiência dela e com data
 * já alcançada. O último é o que faz o agendamento funcionar — um aviso de
 * manutenção marcado para as 21:00 não aparece às 15:00 só porque alguém
 * apertou "publicar" mais cedo.
 */
export async function listarComunicadosDoMural(
  perfil: PerfilTipo,
  agora = new Date(),
  limite = LIMITE_COMUNICADOS_MURAL,
): Promise<ComunicadoDTO[]> {
  const linhas = await db
    .select({
      id: comunicados.id,
      tipo: comunicados.tipo,
      titulo: comunicados.titulo,
      resumo: comunicados.resumo,
      audiencia: comunicados.audiencia,
      publicadoEm: comunicados.publicadoEm,
    })
    .from(comunicados)
    .where(
      and(
        eq(comunicados.status, 'publicado'),
        inArray(comunicados.audiencia, audienciasVisiveis(perfil)),
        isNotNull(comunicados.publicadoEm),
        lte(comunicados.publicadoEm, agora),
      ),
    )
    .orderBy(desc(comunicados.publicadoEm))
    .limit(limite)

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo as TipoComunicado,
    titulo: linha.titulo,
    resumo: linha.resumo,
    audiencia: linha.audiencia as AudienciaComunicado,
    publicadoEm: linha.publicadoEm?.toISOString() ?? null,
  }))
}

/**
 * Todos os comunicados, para a área do Gestor.
 *
 * Rascunho, publicado e arquivado juntos: é a mesa de trabalho de quem escreve.
 * A autorização não está aqui — quem chama é a página `/admin/comunicados`,
 * que já passou por `validarGestorVincis`.
 */
export async function listarComunicadosDaGestao(): Promise<ComunicadoGestaoDTO[]> {
  const linhas = await db
    .select({
      id: comunicados.id,
      tipo: comunicados.tipo,
      titulo: comunicados.titulo,
      resumo: comunicados.resumo,
      audiencia: comunicados.audiencia,
      status: comunicados.status,
      publicadoEm: comunicados.publicadoEm,
      criadoEm: comunicados.createdAt,
      atualizadoEm: comunicados.updatedAt,
      autorNome: autorConta.nome,
    })
    .from(comunicados)
    .innerJoin(autorConta, eq(autorConta.id, comunicados.autorId))
    // Rascunho e publicado agendado no topo: é o que ainda pede decisão.
    .orderBy(desc(comunicados.updatedAt))

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo as TipoComunicado,
    titulo: linha.titulo,
    resumo: linha.resumo,
    audiencia: linha.audiencia as AudienciaComunicado,
    status: linha.status as StatusComunicado,
    publicadoEm: linha.publicadoEm?.toISOString() ?? null,
    autorNome: linha.autorNome,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  }))
}

/** Um comunicado específico, sem recorte de audiência. Uso da gestão. */
export async function obterComunicado(comunicadoId: string) {
  const [linha] = await db
    .select()
    .from(comunicados)
    .where(eq(comunicados.id, comunicadoId))
    .limit(1)
  return linha ?? null
}
