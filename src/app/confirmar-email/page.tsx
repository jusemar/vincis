import { ConfirmarEmailPage } from '@/features/usuarios/components/ConfirmarEmailPage'

type ConfirmarEmailRouteProps = {
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function ConfirmarEmailRoute({ searchParams }: ConfirmarEmailRouteProps) {
  const params = await searchParams
  const token = Array.isArray(params.token) ? params.token[0] : params.token

  return <ConfirmarEmailPage token={token} />
}
