import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, usuarios } from '@/db/schema'
import { resolverAcessoUsuario } from '../queries/obter-destino-apos-login'
import { condicaoContaVerificada } from './condicao-verificacao'
import { COOKIE_SESSAO } from '../constants/sessao'
import type { DadosUsuarioAutenticado } from '../types'

export async function obterSessaoServidor(): Promise<DadosUsuarioAutenticado | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value
  if (!token) return null

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [usuario] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
      status: usuarios.status,
      emailVerificado: usuarios.emailVerificado,
    })
    .from(sessoesUsuario)
    .innerJoin(usuarios, eq(usuarios.id, sessoesUsuario.usuarioId))
    .where(
      and(
        eq(sessoesUsuario.tokenHash, tokenHash),
        isNull(sessoesUsuario.encerradaEm),
        gt(sessoesUsuario.expiraEm, new Date()),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
      ),
    )
    .limit(1)

  if (!usuario) return null

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso) return null

  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    whatsapp: usuario.whatsapp,
    status: usuario.status,
    perfilTipo: acesso.perfil,
  }
}
