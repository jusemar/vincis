import type { LoginDTO } from '../schemas/login'

/**
 * Tipo da pessoa, gravado em `usuarios_perfis`.
 *
 * `contador` e `advogado` são nomes legados do catálogo — o cadastro atual grava
 * `profissional` para qualquer profissional regulamentado. `colaborador` é o
 * prestador com conhecimento técnico sem habilitação regulamentada.
 */
export type PerfilTipo =
  | 'cliente'
  | 'contador'
  | 'advogado'
  | 'profissional'
  | 'colaborador'
  | 'gestor_vincis'

export type UsuarioStatus = 'pendente_email' | 'ativo' | 'bloqueado'

export type ResultadoPadrao = {
  sucesso: boolean
  mensagem: string
}

export type DadosUsuario = {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  status: UsuarioStatus
  perfilTipo: PerfilTipo
  createdAt: Date
}

export type TokenTipo = 'confirmacao_email' | 'recuperacao_senha' | 'convite_empresa'

export type DadosToken = {
  token: string
  expiraEm: Date
}

export type DadosUsuarioAutenticado = {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  status: UsuarioStatus
  perfilTipo: PerfilTipo
}

export type ResultadoLogin = ResultadoPadrao & {
  usuario?: DadosUsuarioAutenticado
  destino?: string
}

export type DadosSessao = {
  token: string
  expiraEm: Date
}

export type ResultadoSessao = ResultadoPadrao & {
  sessao?: DadosSessao
}

export type AuthContextType = {
  usuario: DadosUsuarioAutenticado | null
  tokenSessao: string | null
  estaCarregando: boolean
  estaAutenticado: boolean
  /**
   * A conferência da sessão não pôde ser feita — rede fora, servidor sem
   * resposta. Não é o mesmo que sessão inválida: o token continua guardado e
   * a tela pode oferecer "tentar novamente" em vez de deslogar quem estava
   * legitimamente autenticado.
   */
  erroSessao: boolean
  login: (dados: LoginDTO) => Promise<ResultadoLogin>
  logout: () => Promise<ResultadoPadrao>
  refreshSession: () => Promise<void>
}

export type { LoginDTO }
