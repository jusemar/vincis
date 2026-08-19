export type Permissao = {
  id: string
  nome: string
  descricao: string | null
}

export type PerfilUsuario = {
  perfilId: string
  nomePerfil: string
}

export type PermissaoUsuario = {
  permissaoId: string
  nome: string
}
