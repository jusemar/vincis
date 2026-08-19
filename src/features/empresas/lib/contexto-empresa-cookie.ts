import { cookies } from 'next/headers'

export const COOKIE_EMPRESA_ATIVA = 'vincis_empresa_ativa'

export async function lerEmpresaAtivaCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_EMPRESA_ATIVA)?.value ?? null
}

export async function definirEmpresaAtivaCookie(empresaId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_EMPRESA_ATIVA, empresaId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function removerEmpresaAtivaCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_EMPRESA_ATIVA)
}
