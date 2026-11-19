import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import {
  GestaoConhecimentoPage,
  type AbaConhecimento,
} from '@/features/conhecimento/components/admin/GestaoConhecimentoPage'
import {
  contarFilaModeracao,
  listarArtigosGestao,
  listarCategoriasGestao,
} from '@/features/conhecimento/queries/privado'
import {
  listarArtigosPublicadosParaCards,
  listarCardsParaDestaque,
} from '@/features/conhecimento/queries/destaques-home'

type Propriedades = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const ABAS: AbaConhecimento[] = ['fila', 'publicados', 'todos', 'arquivados', 'categorias', 'home']

function primeiro(valor: string | string[] | undefined) {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ''
}

export const dynamic = 'force-dynamic'

/**
 * Central de Conhecimento na Gestão. Porta: proxy (`exclusivoDoGestor`),
 * layout de `(gestao)`, esta página e cada action.
 */
export default async function GestaoConhecimentoRoute({ searchParams }: Propriedades) {
  await exigirGestorDaPlataforma()
  const parametros = await searchParams
  const pedida = primeiro(parametros.aba) as AbaConhecimento
  const aba: AbaConhecimento = ABAS.includes(pedida) ? pedida : 'fila'
  const busca = primeiro(parametros.busca).slice(0, 120)
  const pagina = Math.max(1, Number.parseInt(primeiro(parametros.pagina), 10) || 1)

  const listaDeArtigos = aba !== 'categorias' && aba !== 'home'
  const [fila, lista, categorias, cards, artigosPublicados] = await Promise.all([
    contarFilaModeracao(),
    listaDeArtigos ? listarArtigosGestao({ filtro: aba, busca: busca || undefined, pagina }) : null,
    aba === 'categorias' ? listarCategoriasGestao() : null,
    aba === 'home' ? listarCardsParaDestaque() : null,
    aba === 'home' ? listarArtigosPublicadosParaCards() : null,
  ])
  return (
    <GestaoConhecimentoPage
      aba={aba}
      busca={busca}
      fila={fila}
      lista={lista}
      categorias={categorias}
      destaquesHome={cards && artigosPublicados ? { cards, artigos: artigosPublicados } : null}
    />
  )
}
