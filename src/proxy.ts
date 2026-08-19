import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, usuarios } from '@/db/schema'
import { COOKIE_SESSAO } from '@/features/usuarios/constants/sessao'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'

// Rotas protegidas na ordem em que devem ser reconhecidas. Cada uma corresponde
// a um destino possível de `resolverAcessoUsuario`, que continua sendo a única
// fonte da regra — aqui só comparamos a rota pedida com o destino resolvido.
const ROTAS_PROTEGIDAS = [
  '/gestao',
  '/cadastro-profissional',
  '/cadastro-colaborador',
  '/admin',
  '/cliente',
] as const

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESSAO)?.value
  const destinoPublico = new URL('/', request.url)
  const acessoGestao = request.nextUrl.pathname.startsWith('/gestao')

  if (acessoGestao) destinoPublico.searchParams.set('entrar', '1')

  if (!token) return NextResponse.redirect(destinoPublico)

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const [usuario] = await db
    .select({ id: usuarios.id })
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

  if (!usuario) return NextResponse.redirect(destinoPublico)

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso) return NextResponse.redirect(destinoPublico)
  const rotaAtual = ROTAS_PROTEGIDAS.find((rota) =>
    request.nextUrl.pathname.startsWith(rota),
  )
  if (rotaAtual !== acesso.destino)
    return NextResponse.redirect(new URL(acesso.destino, request.url))

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/gestao/:path*',
    '/cadastro-profissional/:path*',
    '/cadastro-colaborador/:path*',
    '/cliente/:path*',
  ],
}
