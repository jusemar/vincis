import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ehPessoaProfissional } from '@/features/usuarios/lib/prestador'
import { buscarPerfilPrincipalUsuario } from '@/features/usuarios/queries/buscar-perfil-principal-usuario'
import type { ContextoProfissional } from '../types'

/**
 * Contexto de quem atua sozinho, sem escritório. Só se aplica ao Profissional:
 * o Colaborador não tem tenant próprio — ele opera sobre os clientes a que
 * recebeu acesso.
 *
 * `modalidade_atuacao` é uma preferência declarada, não um requisito de acesso:
 * quem não possui escritório ativo atua sozinho, qualquer que seja o valor
 * gravado. Só quem escolheu `escritorio` e ainda não o criou segue para o
 * onboarding — exigir `individual` literal prendia no onboarding qualquer
 * cadastro com o campo vazio ou legado.
 */
export async function buscarContextoProfissionalIndividual(
  usuarioId: string,
): Promise<ContextoProfissional | null> {
  const perfilPrincipal = await buscarPerfilPrincipalUsuario(usuarioId)
  if (!ehPessoaProfissional(perfilPrincipal)) return null

  const [perfil] = await db
    .select({
      perfilProfissionalId: perfisProfissionais.id,
      usuarioId: perfisProfissionais.usuarioId,
      nomeAtuacao: perfisProfissionais.nomeAtuacao,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      modalidadeAtuacao: perfisProfissionais.modalidadeAtuacao,
    })
    .from(perfisProfissionais)
    .where(
      and(
        eq(perfisProfissionais.usuarioId, usuarioId),
        eq(perfisProfissionais.tipoPrestador, 'profissional'),
        eq(perfisProfissionais.statusAnalise, 'aprovado'),
      ),
    )
    .limit(1)

  if (!perfil) return null
  // Escolheu escritório e ainda não criou: segue para o onboarding.
  if (perfil.modalidadeAtuacao === 'escritorio') return null

  return {
    ...perfil,
    tipoProfissional:
      perfil.tipoProfissional as ContextoProfissional['tipoProfissional'],
  }
}
