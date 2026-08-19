import type { OnboardingEmpresaDTO } from '../schemas/onboarding-empresa'

export type SegmentoEmpresa = OnboardingEmpresaDTO['segmento']

export type ContextoEmpresa = {
  empresaId: string
  membroId: string
  nome: string
  segmento: SegmentoEmpresa | null
}

export type ContextoProfissional = {
  perfilProfissionalId: string
  usuarioId: string
  nomeAtuacao: string
  tipoProfissional: 'contabilidade' | 'especialista_fiscal' | 'advocacia'
}

export type EstadoContextoEmpresa =
  | 'ativo'
  /** Profissional que atua sozinho: opera sem escritório, com clientes próprios. */
  | 'perfil_profissional'
  /**
   * Colaborador sem vínculo de escritório. É um estado válido e final: o
   * Colaborador não abre escritório, então nunca deve cair no onboarding de
   * empresa nem em uma tela de erro por "falta de tenant".
   */
  | 'colaborador'
  | 'sem_tenant'
  | 'selecao_necessaria'
  | 'nao_autenticado'
  | 'erro'

export type ResultadoContextoEmpresa = {
  sucesso: boolean
  estado: EstadoContextoEmpresa
  mensagem: string
  contexto?: ContextoEmpresa
  contextoProfissional?: ContextoProfissional
}

export type ResultadoCriarEmpresa = {
  sucesso: boolean
  mensagem: string
  contexto?: ContextoEmpresa
  erros?: Partial<Record<keyof OnboardingEmpresaDTO, string[]>>
}
