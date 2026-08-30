import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, usuarios } from '@/db/schema'
import { ROTA_ADMIN, rotaExigeGestor } from '@/features/admin/constants/recursos'
import { COOKIE_SESSAO } from '@/features/usuarios/constants/sessao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'

// Rotas protegidas na ordem em que devem ser reconhecidas. Cada uma corresponde
// a um destino possível de `resolverAcessoUsuario`, que continua sendo a única
// fonte da regra — aqui só comparamos a rota pedida com o destino resolvido.
const ROTAS_PROTEGIDAS = [
  '/cadastro-profissional',
  '/cadastro-colaborador',
  '/admin',
  '/cliente',
] as const

/** Prefixo aposentado, mantido apenas para redirecionar URLs antigas. */
const LEGADO_GESTAO = '/gestao'

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESSAO)?.value
  const destinoPublico = new URL('/', request.url)
  const { pathname } = request.nextUrl
  // `/gestao` deixou de ser uma área: os recursos vivem em `/admin`. As URLs
  // antigas continuam respondendo — redirecionadas para a equivalente, com a
  // query preservada — para não transformar link guardado em 404.
  const acessoGestao = pathname === LEGADO_GESTAO || pathname.startsWith(`${LEGADO_GESTAO}/`)

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

  // O redirecionamento do legado vem depois da sessão valer: um cookie
  // inválido em `/gestao/*` termina no login, como qualquer outra rota
  // protegida, em vez de passear por um endereço que a pessoa não pode abrir.
  if (acessoGestao) {
    const equivalente = new URL(request.nextUrl)
    equivalente.pathname = `${ROTA_ADMIN}${pathname.slice(LEGADO_GESTAO.length)}`
    return NextResponse.redirect(equivalente)
  }

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso) return NextResponse.redirect(destinoPublico)

  // Cada conta tem um destino — onde ela cai — e um conjunto de áreas que pode
  // abrir. Para quase todo mundo os dois coincidem. O Gestor da Plataforma
  // acumula `/admin` e `/cliente`, porque administrar a Vincis é uma permissão
  // a mais e não uma troca de persona: ele continua podendo operar o próprio
  // escritório e contratar como Cliente.
  const rotaAtual = ROTAS_PROTEGIDAS.find((rota) => pathname.startsWith(rota))
  if (rotaAtual && !acesso.areasPermitidas.includes(rotaAtual))
    return NextResponse.redirect(new URL(acesso.destino, request.url))

  // Recursos exclusivos do Gestor da Plataforma. Quem responde quais são é o
  // registro em `features/admin/constants/recursos` — o mesmo que o menu e as
  // guardas de servidor consultam —, e não uma lista mantida à mão aqui.
  // Marcar um recurso novo como exclusivo passa a protegê-lo nos três lugares.
  //
  // Esta é a primeira barreira, não a única: as páginas e as actions repetem a
  // conferência lendo a sessão, porque middleware não é autorização.
  if (rotaExigeGestor(pathname) && !ehGestorPlataforma(acesso))
    return NextResponse.redirect(new URL(ROTA_ADMIN, request.url))

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
