import { db } from '@/db/connection'
import { sessoesUsuario } from '@/db/schema'
import { gerarTokenSessao } from '../lib/gerar-token-sessao'
import type { ResultadoSessao } from '../types'

const TEMPO_EXPIRACAO_HORAS = 24

type CriarSessaoParams = {
  usuarioId: string
  ip?: string
  userAgent?: string
}

export async function criarSessao(params: CriarSessaoParams): Promise<ResultadoSessao> {
  const { usuarioId, ip, userAgent } = params

  if (!usuarioId) {
    return {
      sucesso: false,
      mensagem: 'Usuário inválido',
    }
  }

  const { token, hash } = gerarTokenSessao()

  const expiraEm = new Date()
  expiraEm.setHours(expiraEm.getHours() + TEMPO_EXPIRACAO_HORAS)

  await db.insert(sessoesUsuario).values({
    usuarioId,
    tokenHash: hash,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
    expiraEm,
  })

  return {
    sucesso: true,
    mensagem: 'Sessão criada com sucesso',
    sessao: {
      token,
      expiraEm,
    },
  }
}
