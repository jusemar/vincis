import { get } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

export async function GET(_: Request, contexto: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await obterSessaoServidor()
  const { usuarioId } = await contexto.params
  if (!sessao || (sessao.id !== usuarioId && !ehGestorPlataforma(sessao))) return new NextResponse('Acesso não autorizado.', { status: 403 })

  const [perfil] = await db.select({ chave: perfisProfissionais.comprovanteRegistroChave, nome: perfisProfissionais.comprovanteRegistroNomeOriginal })
    .from(perfisProfissionais).where(eq(perfisProfissionais.usuarioId, usuarioId)).limit(1)
  if (!perfil?.chave) return new NextResponse('Comprovante não encontrado.', { status: 404 })
  const resultado = await get(perfil.chave, { access: 'private', useCache: false })
  if (!resultado || resultado.statusCode !== 200) return new NextResponse('Comprovante não encontrado.', { status: 404 })
  const nome = (perfil.nome ?? 'comprovante').replace(/[^a-zA-Z0-9._-]/g, '_')
  return new NextResponse(resultado.stream, { headers: { 'Cache-Control': 'private, no-store', 'Content-Type': resultado.blob.contentType, 'Content-Disposition': `inline; filename="${nome}"`, 'X-Content-Type-Options': 'nosniff' } })
}

