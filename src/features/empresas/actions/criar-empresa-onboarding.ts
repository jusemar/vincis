'use server'

import { definirEmpresaAtivaCookie } from '../lib/contexto-empresa-cookie'
import {
  criarEmpresaComMembro,
  ERRO_PROPRIETARIO_SEM_PERFIL_PROFISSIONAL,
  ERRO_USUARIO_JA_POSSUI_EMPRESA,
} from '../lib/criar-empresa-com-membro'
import { obterIdentidadeSessao } from '../lib/obter-identidade-sessao'
import { OnboardingEmpresaSchema, type OnboardingEmpresaDTO } from '../schemas/onboarding-empresa'
import type { ResultadoCriarEmpresa } from '../types'

export async function criarEmpresaOnboarding(
  tokenSessao: string,
  dados: OnboardingEmpresaDTO,
): Promise<ResultadoCriarEmpresa> {
  const validacao = OnboardingEmpresaSchema.safeParse(dados)

  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: 'Revise os dados informados',
      erros: validacao.error.flatten().fieldErrors,
    }
  }

  const usuarioId = await obterIdentidadeSessao(tokenSessao)
  if (!usuarioId) {
    return {
      sucesso: false,
      mensagem: 'Sua sessão expirou. Entre novamente para continuar.',
    }
  }

  try {
    const contexto = await criarEmpresaComMembro(usuarioId, validacao.data)

    await definirEmpresaAtivaCookie(contexto.empresaId)

    return {
      sucesso: true,
      mensagem: 'Escritório criado com sucesso',
      contexto,
    }
  } catch (error) {
    if (error instanceof Error && error.message === ERRO_USUARIO_JA_POSSUI_EMPRESA) {
      return {
        sucesso: false,
        mensagem: 'Sua conta já possui uma empresa vinculada. Atualize a página para continuar.',
      }
    }

    if (
      error instanceof Error &&
      error.message === ERRO_PROPRIETARIO_SEM_PERFIL_PROFISSIONAL
    ) {
      return {
        sucesso: false,
        mensagem:
          'Para abrir um escritório é necessário ter um cadastro profissional aprovado. Conclua seu cadastro profissional e tente novamente.',
      }
    }

    console.error('[EMPRESA_ONBOARDING]', error)
    return {
      sucesso: false,
      mensagem: 'Não foi possível criar o escritório. Tente novamente.',
    }
  }
}
