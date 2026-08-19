'use server'

import {
  definirEmpresaAtivaCookie,
  lerEmpresaAtivaCookie,
  removerEmpresaAtivaCookie,
} from '../lib/contexto-empresa-cookie'
import { obterIdentidadeSessao } from '../lib/obter-identidade-sessao'
import { resolverContextoTenant } from '../lib/resolver-contexto-tenant'
import type { ResultadoContextoEmpresa } from '../types'

export async function obterContextoEmpresa(tokenSessao: string): Promise<ResultadoContextoEmpresa> {
  const usuarioId = await obterIdentidadeSessao(tokenSessao)

  if (!usuarioId) {
    return {
      sucesso: false,
      estado: 'nao_autenticado',
      mensagem: 'Sessão inválida ou expirada',
    }
  }

  const empresaIdCookie = await lerEmpresaAtivaCookie()
  const resultado = await resolverContextoTenant(usuarioId, empresaIdCookie)

  if (resultado.estado === 'ativo' && resultado.contexto) {
    await definirEmpresaAtivaCookie(resultado.contexto.empresaId)
  } else if (empresaIdCookie) {
    await removerEmpresaAtivaCookie()
  }

  return resultado
}
