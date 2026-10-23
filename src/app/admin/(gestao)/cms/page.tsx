import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { CmsGestaoPage, type AbaCms } from '@/features/cms/components/admin/CmsGestaoPage'
import { POR_PAGINA_GESTAO_CMS } from '@/features/cms/constants'
import { statusPaginaSchema } from '@/features/cms/nucleo/schemas'
import {
  listarGruposNavegacaoCmsGestao,
  listarPaginasAssociaveisCmsGestao,
  listarPaginasCmsGestao,
} from '@/features/cms/queries/gestao'

/**
 * CMS institucional, dentro da Central Vincis.
 *
 * Porta fechada por perfil: o proxy barra pela marca `exclusivoDoGestor` do
 * recurso `cms`, o layout de `(gestao)` confere o Gestor, esta página confere
 * de novo, e as queries e actions do CMS repetem a conferência.
 *
 * A URL guarda aba, busca, status e página da listagem. Valor estranho vira o
 * padrão, em vez de erro.
 */
type Propriedades = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function primeiro(valor: string | string[] | undefined) {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? ''
}

export default async function CmsRoute({ searchParams }: Propriedades) {
  const gestor = await exigirGestorDaPlataforma()
  const parametros = await searchParams

  const abaPedida = primeiro(parametros.aba)
  const aba: AbaCms = abaPedida === 'rodape' || abaPedida === 'cabecalho' ? abaPedida : 'paginas'
  const status = statusPaginaSchema.safeParse(primeiro(parametros.status))
  const busca = primeiro(parametros.busca).slice(0, 180)
  const numeroPagina = Math.max(1, Number.parseInt(primeiro(parametros.pagina), 10) || 1)

  const [paginas, grupos, paginasAssociaveis] =
    aba === 'paginas'
      ? [
          await listarPaginasCmsGestao({
            pagina: numeroPagina,
            porPagina: POR_PAGINA_GESTAO_CMS,
            busca: busca || undefined,
            status: status.success ? status.data : undefined,
          }),
          [],
          [],
        ]
      : await Promise.all([
          Promise.resolve(null),
          listarGruposNavegacaoCmsGestao(),
          listarPaginasAssociaveisCmsGestao(),
        ])

  return (
    <CmsGestaoPage
      gestorNome={gestor.nome}
      aba={aba}
      filtros={{ busca, status: status.success ? status.data : '' }}
      paginas={paginas ?? { itens: [], total: 0, pagina: 1, porPagina: POR_PAGINA_GESTAO_CMS }}
      grupos={grupos ?? []}
      paginasAssociaveis={paginasAssociaveis ?? []}
    />
  )
}
