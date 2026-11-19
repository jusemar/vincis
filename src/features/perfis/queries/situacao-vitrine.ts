import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ehFotoPublicaValida } from '@/features/profissionais/lib/vitrine-publica'

export type SituacaoVitrinePerfil = {
  naVitrine: boolean
  semFoto: boolean
  ocultoPelaGestao: boolean
}

/**
 * Por que o perfil está (ou não) na vitrine — para orientar o **dono**.
 * Mesmas regras de `profissionais/lib/vitrine-publica`, lidas em TypeScript.
 * O motivo interno da Gestão não sai daqui: o dono só sabe que foi ocultado.
 */
export async function obterSituacaoVitrineDoPerfil(prestadorId: string): Promise<SituacaoVitrinePerfil | null> {
  const [perfil] = await db
    .select({
      avatarUrl: perfisProfissionais.avatarUrl,
      fotoDestaqueUrl: perfisProfissionais.fotoDestaqueUrl,
      ocultoVitrineEm: perfisProfissionais.ocultoVitrineEm,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, prestadorId))
    .limit(1)
  if (!perfil) return null
  const semFoto = !ehFotoPublicaValida(perfil.avatarUrl) && !ehFotoPublicaValida(perfil.fotoDestaqueUrl)
  const ocultoPelaGestao = Boolean(perfil.ocultoVitrineEm)
  return { naVitrine: !semFoto && !ocultoPelaGestao, semFoto, ocultoPelaGestao }
}
