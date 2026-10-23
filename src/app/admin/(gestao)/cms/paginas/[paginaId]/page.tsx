import { notFound } from 'next/navigation'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { FormularioPaginaCms } from '@/features/cms/components/admin/FormularioPaginaCms'
import { buscarPaginaCmsGestao } from '@/features/cms/queries/gestao'

/** Edição de uma página do CMS. Mesma porta do módulo: só o Gestor chega aqui. */
type Propriedades = { params: Promise<{ paginaId: string }> }

export default async function EditarPaginaCmsRoute({ params }: Propriedades) {
  await exigirGestorDaPlataforma()
  const pagina = await buscarPaginaCmsGestao((await params).paginaId)
  if (!pagina) notFound()

  return (
    <>
      <h1 className="mx-auto mb-4 max-w-6xl truncate text-2xl font-bold">{pagina.titulo}</h1>
      {/* `key` remonta o formulário quando a página muda no servidor (publicar,
          despublicar), para o estado do formulário não ficar com a versão antiga. */}
      <FormularioPaginaCms key={`${pagina.id}:${pagina.updatedAt}`} pagina={pagina} />
    </>
  )
}
