import { redirect } from 'next/navigation'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { ROTA_ADMIN } from '../constants/recursos'

/**
 * Porta de servidor dos recursos exclusivos do Gestor da Plataforma.
 *
 * Relê a sessão e o perfil no banco a cada chamada: é a barreira que vale
 * mesmo quando o middleware não roda (chamada interna, rota nova ainda não
 * coberta pelo matcher) e quando o menu não escondeu nada. Devolve o Gestor
 * para quem passa e interrompe a renderização de quem não passa — a página não
 * chega a montar, nem parcialmente.
 *
 * Quem é barrado volta para a raiz do Admin, não para a home: o middleware
 * decide dali para onde a pessoa pertence, sem esta função precisar saber.
 */
export async function exigirGestorDaPlataforma() {
  const gestor = await validarGestorVincis()
  if (!gestor) redirect(ROTA_ADMIN)
  return gestor
}
