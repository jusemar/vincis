import { identificadorSchema } from '../schemas/artigo'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { obterAutorDaSessao, obterModeradorDaSessao } from './autorizacao'

/**
 * Quem está pedindo a prévia. Gestão vê qualquer artigo; o autor, só os
 * próprios (o escopo é aplicado na consulta). Qualquer outra conta → `null`.
 */
export async function obterLeitorDaPrevia(
  artigoId: string,
): Promise<{ usuarioId: string; gestor: boolean } | null | 'sem_sessao'> {
  if (!identificadorSchema.safeParse(artigoId).success) return null
  const sessao = await obterSessaoServidor()
  if (!sessao) return 'sem_sessao'
  const gestor = await obterModeradorDaSessao()
  if (gestor) return { usuarioId: gestor.id, gestor: true }
  const autor = await obterAutorDaSessao()
  return autor ? { usuarioId: autor.usuarioId, gestor: false } : null
}
