import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { RepassesGestao } from '@/features/repasses/components/admin/RepassesGestao'
import { sincronizarRepasses } from '@/features/repasses/lib/sincronizar-repasses'
import { filtroDeRepasses, listarRepassesGestao } from '@/features/repasses/queries/listar-repasses'

/**
 * Repasses manuais aos profissionais — somente Gestor da Vincis.
 *
 * Abrir a tela sincroniza o livro com as fontes de verdade (idempotente; nunca
 * toca repasse já registrado). A action de registrar repete a guarda e a
 * conferência, porque página protegida não protege a action chamada direto.
 */
export const dynamic = 'force-dynamic'

export default async function RepassesRoute({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>
}) {
  await exigirGestorDaPlataforma()
  const params = await searchParams
  await sincronizarRepasses()
  const resultado = await listarRepassesGestao({
    filtro: filtroDeRepasses(params.filtro),
    pagina: Number(params.pagina) || 1,
  })
  return <RepassesGestao {...resultado} />
}
