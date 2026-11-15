import { eq } from 'drizzle-orm'
import { perfisProfissionais } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { honorariosDiretos } from '../constants/honorarios'

export {
  MENSAGEM_HONORARIOS_DIRETOS,
  TIPO_PROFISSIONAL_HONORARIOS_DIRETOS,
  honorariosDiretos,
} from '../constants/honorarios'

/**
 * O prestador cobra os honorários diretamente (é advogado)?
 *
 * Lido do cadastro (`tipo_profissional`), e não da tela: é a pergunta que o
 * núcleo de cobrança, a agenda e o aceite de proposta fazem no servidor.
 */
export async function prestadorCobraDiretamente(
  executor: ExecutorDb,
  prestadorId: string | null | undefined,
): Promise<boolean> {
  if (!prestadorId) return false
  const [perfil] = await executor
    .select({ tipo: perfisProfissionais.tipoProfissional })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, prestadorId))
    .limit(1)
  return honorariosDiretos(perfil?.tipo)
}
