import { redirect } from 'next/navigation'
import { db } from '@/db/connection'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import { MeusClientesVincis } from '@/features/assinaturas/components/operacional/MeusClientesVincis'
import { listarClientesVincisDoContador } from '@/features/assinaturas/queries/carteira-do-contador'
import { autorizarPrestador } from '@/features/precificacao-profissional/lib/autorizar-prestador'
import { contadorParceiroElegivel } from '@/features/profissionais/queries/contadores-parceiros'

/**
 * "Meus clientes Vincis" — área do contador parceiro no painel profissional.
 *
 * Fora do grupo `(gestao)`, como Meus preços: é do prestador, sobre a carteira
 * dele. Duas portas no servidor: prestador habilitado e contador parceiro da
 * Vincis agora (Autônomo e advogado voltam ao painel). A lista é filtrada pelo
 * id da sessão — nunca recebe id do navegador.
 */
export const dynamic = 'force-dynamic'

export default async function MeusClientesVincisRoute() {
  const prestador = await autorizarPrestador()
  if (!prestador) redirect(ROTA_ADMIN)
  const parceiro = await contadorParceiroElegivel(db, prestador.id)
  if (!parceiro) redirect(ROTA_ADMIN)

  const clientes = await listarClientesVincisDoContador(prestador.id)
  return (
    <AdminShell>
      <MeusClientesVincis clientes={clientes} capacidade={parceiro.capacidade} ocupacao={parceiro} />
    </AdminShell>
  )
}
