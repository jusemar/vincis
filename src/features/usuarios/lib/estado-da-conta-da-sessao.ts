import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, usuarios } from '@/db/schema'
import { COOKIE_SESSAO } from '../constants/sessao'
import { contaVerificada } from './verificacao-conta'

export type EstadoDaConta =
  | 'sem_sessao'
  | 'nao_confirmada'
  | 'bloqueada'
  | 'ativa'

/**
 * Por que a sessão não foi aceita.
 *
 * `obterSessaoServidor` devolve `null` para três situações diferentes — não há
 * cookie, a conta não foi confirmada, a conta está bloqueada — e faz bem: quem
 * autoriza não precisa distinguir, e distinguir dentro dela levaria alguém a
 * usar o motivo como se fosse permissão. Mas a **mensagem** precisa
 * distinguir: mandar "entre na sua conta" para quem já está logado e apenas não
 * confirmou o e-mail é orientação errada.
 *
 * Esta função existe só para isso: escolher o texto. Ela não autoriza nada, não
 * é usada por nenhuma regra de acesso, e a definição de conta apta continua
 * sendo a mesma e única — `contaVerificada`, a mesma que o login e o middleware
 * aplicam.
 */
export async function obterEstadoDaContaDaSessao(): Promise<EstadoDaConta> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value
  if (!token) return 'sem_sessao'

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [conta] = await db
    .select({
      status: usuarios.status,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
    })
    .from(sessoesUsuario)
    .innerJoin(usuarios, eq(usuarios.id, sessoesUsuario.usuarioId))
    .where(
      and(
        eq(sessoesUsuario.tokenHash, tokenHash),
        isNull(sessoesUsuario.encerradaEm),
        gt(sessoesUsuario.expiraEm, new Date()),
      ),
    )
    .limit(1)

  if (!conta) return 'sem_sessao'
  if (conta.status !== 'ativo') return 'bloqueada'
  return contaVerificada(conta) ? 'ativa' : 'nao_confirmada'
}
