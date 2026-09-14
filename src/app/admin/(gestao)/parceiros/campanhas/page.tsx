import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { CampanhasDeParceiroPage } from '@/features/parceiros/components/gestao/CampanhasDeParceiroPage'
import { listarCampanhasParaGestao } from '@/features/parceiros/lib/campanhas'

/**
 * Campanhas do Programa de Parceiros, na Central Vincis.
 *
 * Porta fechada por perfil como as demais telas de `(gestao)`: o layout barra
 * quem não é Gestor, esta página confere de novo, e cada action confere uma
 * terceira vez.
 */
export default async function CampanhasDeParceirosRoute() {
  await exigirGestorDaPlataforma()
  const campanhas = await listarCampanhasParaGestao()
  return <CampanhasDeParceiroPage campanhas={campanhas} />
}
