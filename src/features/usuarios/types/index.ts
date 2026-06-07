export type PapelUsuario = 'cliente' | 'profissional'

export interface DadosCadastro {
  nome: string
  email: string
  telefone: string
  senha: string
  confirmarSenha: string
  papel: PapelUsuario
}
