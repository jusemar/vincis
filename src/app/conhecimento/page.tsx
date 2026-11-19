import type { Metadata } from 'next'
import { CentralConhecimento } from '@/features/conhecimento/components/publico/CentralConhecimento'
import { carregarCentral } from '@/features/conhecimento/queries/central'
import { montarMetadadosCentral } from '@/features/conhecimento/lib/seo-artigo'

type Propriedades = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Lida a cada visita: artigo aprovado aparece na hora; despublicado some na hora. */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: Propriedades): Promise<Metadata> {
  const { categoriaAtual, filtros } = await carregarCentral(await searchParams)
  return montarMetadadosCentral({ categoria: categoriaAtual, busca: filtros.busca, pagina: filtros.pagina })
}

/** `/conhecimento` — Central de Conhecimento Vincis. */
export default async function ConhecimentoRoute({ searchParams }: Propriedades) {
  const dados = await carregarCentral(await searchParams)
  return (
    <CentralConhecimento
      categorias={dados.categorias}
      categoriaAtual={dados.categoriaAtual}
      busca={dados.filtros.busca}
      destaques={dados.destaques}
      lista={dados.lista}
    />
  )
}
