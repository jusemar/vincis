import { MeusPlanosCliente } from '@/features/assinaturas/components/cliente/MeusPlanosCliente'
import { listarPlanosDoCliente } from '@/features/assinaturas/queries/planos-do-cliente'
import { MinhaContaCliente } from '@/features/portal-cliente/components/secoes/MinhaContaCliente'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/** Minha conta: dados de cadastro e verificação, e os planos da Vincis. */
export default async function ContaRoute() {
  const { usuarioId, dados } = await exigirClienteDaSessao()
  const planos = await listarPlanosDoCliente(usuarioId)
  return (
    <div className="space-y-10">
      <MinhaContaCliente dados={dados} />
      <MeusPlanosCliente planos={planos} />
    </div>
  )
}
