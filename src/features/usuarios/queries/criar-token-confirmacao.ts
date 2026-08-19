import { db } from '@/db/connection'
import { tokensUsuario } from '@/db/schema'
import { gerarToken } from '../lib/gerar-token'

const TEMPO_EXPIRACAO_HORAS = 24

export async function criarTokenConfirmacao(usuarioId: string): Promise<string> {
  const { token, hash } = gerarToken()

  const expiraEm = new Date()
  expiraEm.setHours(expiraEm.getHours() + TEMPO_EXPIRACAO_HORAS)

  await db.insert(tokensUsuario).values({
    usuarioId,
    tipo: 'confirmacao_email',
    tokenHash: hash,
    expiraEm,
  })

  return token
}
