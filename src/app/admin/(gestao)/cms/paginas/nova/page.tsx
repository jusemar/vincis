import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { FormularioPaginaCms } from '@/features/cms/components/admin/FormularioPaginaCms'

/** Nova página do CMS. Mesma porta do módulo: só o Gestor chega aqui. */
export default async function NovaPaginaCmsRoute() {
  await exigirGestorDaPlataforma()
  return (
    <>
      <h1 className="mx-auto mb-4 max-w-6xl text-2xl font-bold">Nova página</h1>
      <FormularioPaginaCms />
    </>
  )
}
