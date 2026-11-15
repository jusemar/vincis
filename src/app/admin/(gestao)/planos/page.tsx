import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PlanosContratadosGestao } from '@/features/assinaturas/components/admin/PlanosContratadosGestao'
import { listarPlanosGestao } from '@/features/assinaturas/queries/listar-planos-gestao'
import { listarContadoresParceiros } from '@/features/profissionais/queries/contadores-parceiros'

/**
 * Planos contratados — contador responsável por cliente.
 *
 * Mesma guarda das demais telas da Central; a action de alocar repete a
 * conferência, porque página protegida não protege a action chamada direto.
 */
export default async function PlanosContratadosRoute({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>
}) {
  await exigirGestorDaPlataforma()
  const params = await searchParams
  const filtro =
    params.filtro === 'aguardando_alocacao' || params.filtro === 'cancelados' ? params.filtro : 'todos'
  const [resultado, contadores] = await Promise.all([
    listarPlanosGestao({ filtro, pagina: Number(params.pagina) || 1 }),
    listarContadoresParceiros(),
  ])
  return <PlanosContratadosGestao {...resultado} contadores={contadores} />
}
