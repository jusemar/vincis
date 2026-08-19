import { buscarPermissoesUsuario } from '../queries/buscar-permissoes-usuario'

export async function possuiPermissao(usuarioId: string, permissao: string): Promise<boolean> {
  const permissoes = await buscarPermissoesUsuario(usuarioId)
  return permissoes.some((p) => p.nome === permissao)
}
