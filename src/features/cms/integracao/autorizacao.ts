import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'

/**
 * Quem administra o CMS na Vincis: só o Gestor da Plataforma.
 *
 * Toda action e toda query administrativa do CMS chama esta porta no início.
 * Ela relê a sessão e o perfil no banco a cada chamada — a rota protegida pelo
 * proxy e pelo layout da Gestão não cobre quem chama a action direto.
 *
 * Devolve o Gestor, ou `null` para qualquer outra pessoa (Profissional,
 * Colaborador, Cliente, anônimo, conta inativa).
 */
export async function exigirAdministradorCms() {
  return validarGestorVincis()
}
