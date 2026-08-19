import { randomBytes, createHash } from 'node:crypto'

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash }
}
