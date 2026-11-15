import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { FilaAtendimentosParados } from '@/features/atendimentos/components/gestao/FilaAtendimentosParados'
import { listarAtendimentosParados } from '@/features/atendimentos/queries/atendimentos-parados'

/**
 * Atendimentos parados — acompanhamento e encerramento pela Gestão.
 *
 * Mesma guarda das demais telas da Central; a action de encerrar repete a
 * conferência, porque página protegida não protege a action chamada direto.
 */
export default async function AtendimentosParadosRoute() {
  await exigirGestorDaPlataforma()
  const fila = await listarAtendimentosParados()
  return <FilaAtendimentosParados total={fila.total} itens={fila.itens} />
}
