import { RedefinirSenhaPage } from '@/features/usuarios/components/RedefinirSenhaPage'

type RedefinirSenhaRouteProps = {
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function RedefinirSenhaRoute({ searchParams }: RedefinirSenhaRouteProps) {
  const params = await searchParams
  const token = Array.isArray(params.token) ? params.token[0] : params.token

  return <RedefinirSenhaPage token={token} />
}
