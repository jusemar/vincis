import { buscarCapacidadesUsuario } from '../queries/buscar-perfil-principal-usuario'
import { buscarPermissoesUsuario } from '../queries/buscar-permissoes-usuario'

/**
 * Uma permissão nomeada do RBAC da plataforma (`perfis_permissoes`).
 *
 * O Gestor da Plataforma passa em todas. Não é atalho: é a definição do papel —
 * ele administra a Vincis inteira, e cadastrar à mão dezenas de vínculos de
 * permissão para ele apenas criaria a chance de esquecer um e produzir um
 * Gestor pela metade. A regra de quem é Gestor vem de `ehGestorPlataforma`, a
 * mesma do middleware, das guardas e do menu.
 *
 * O override vale só para este RBAC, que é o da plataforma. Os papéis de
 * escritório (`features/empresas/lib/papeis-escritorio`) continuam intactos de
 * propósito: são vínculos de um escritório específico, e dar ao Gestor o papel
 * de administrador dentro do escritório dos outros seria furar o isolamento
 * entre inquilinos, não administrar a plataforma.
 */
export async function possuiPermissao(usuarioId: string, permissao: string): Promise<boolean> {
  if ((await buscarCapacidadesUsuario(usuarioId)).ehGestor) return true

  const permissoes = await buscarPermissoesUsuario(usuarioId)
  return permissoes.some((p) => p.nome === permissao)
}
