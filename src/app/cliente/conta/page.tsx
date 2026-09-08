import { MinhaContaCliente } from '@/features/portal-cliente/components/secoes/MinhaContaCliente'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/** Minha conta: dados de cadastro e verificação. */
export default async function ContaRoute() {
  const { dados } = await exigirClienteDaSessao()
  return <MinhaContaCliente dados={dados} />
}
