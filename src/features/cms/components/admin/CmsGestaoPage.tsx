import Link from 'next/link'
import { FileText, PanelBottom, PanelTop, Pencil, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ROTULO_STATUS_PAGINA,
  VARIANTE_STATUS_PAGINA,
  formatarDataCms,
} from '../../constants'
import { ROTA_GESTAO_CMS } from '../../lib/rotas'
import { STATUS_PAGINA } from '../../nucleo/schemas/constantes'
import type { StatusPagina } from '../../nucleo/types'
import type {
  GrupoNavegacaoGestaoDTO,
  ListagemPaginasCms,
  PaginaAssociavelDTO,
} from '../../types'
import { BotaoArquivarPaginaCms } from './BotaoArquivarPaginaCms'
import { GestaoNavegacaoCms } from './GestaoNavegacaoCms'

/**
 * Tela do CMS na Central Vincis: páginas e a navegação (rodapé e cabeçalho),
 * em abas.
 *
 * Server Component. Busca, filtro e paginação são parâmetros da URL num
 * formulário GET comum: funcionam sem JavaScript, ficam no histórico e podem
 * ser compartilhados. As partes interativas (arquivar, rodapé) são ilhas de
 * cliente.
 */
export type AbaCms = 'paginas' | 'rodape' | 'cabecalho'

type Filtros = { busca: string; status: StatusPagina | '' }

function hrefCms(parametros: Record<string, string | number | undefined>) {
  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries(parametros))
    if (valor !== undefined && valor !== '' && !(chave === 'pagina' && valor === 1))
      busca.set(chave, String(valor))
  const texto = busca.toString()
  return texto ? `${ROTA_GESTAO_CMS}?${texto}` : ROTA_GESTAO_CMS
}

function Abas({ ativa }: { ativa: AbaCms }) {
  const abas: Array<{ id: AbaCms; rotulo: string; Icone: typeof FileText }> = [
    { id: 'paginas', rotulo: 'Páginas', Icone: FileText },
    { id: 'rodape', rotulo: 'Rodapé', Icone: PanelBottom },
    { id: 'cabecalho', rotulo: 'Cabeçalho', Icone: PanelTop },
  ]
  return (
    <nav aria-label="Seções do CMS" className="flex gap-1 rounded-lg bg-muted p-1">
      {abas.map(({ id, rotulo, Icone }) => (
        <Link
          key={id}
          href={hrefCms({ aba: id === 'paginas' ? undefined : id })}
          aria-current={ativa === id ? 'page' : undefined}
          className={cn(
            'alvo-toque-h flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-1.5 text-sm transition-colors sm:flex-none',
            ativa === id
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icone className="size-4" />
          {rotulo}
        </Link>
      ))}
    </nav>
  )
}

function ListaPaginas({ paginas, filtros }: { paginas: ListagemPaginasCms; filtros: Filtros }) {
  const totalPaginas = Math.max(1, Math.ceil(paginas.total / paginas.porPagina))
  const filtrando = Boolean(filtros.busca || filtros.status)

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <form
          action={ROTA_GESTAO_CMS}
          method="get"
          role="search"
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="cms-busca" className="sr-only">
            Buscar por título ou endereço
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cms-busca"
              name="busca"
              type="search"
              defaultValue={filtros.busca}
              placeholder="Buscar por título ou endereço"
              className="pl-9"
            />
          </div>
          <label htmlFor="cms-status" className="sr-only">
            Status
          </label>
          <select
            id="cms-status"
            name="status"
            defaultValue={filtros.status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos os status</option>
            {STATUS_PAGINA.map((status) => (
              <option key={status} value={status}>
                {ROTULO_STATUS_PAGINA[status]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {paginas.total === 1 ? '1 página' : `${paginas.total} páginas`}
          {filtrando && (
            <>
              {' · '}
              <Link href={ROTA_GESTAO_CMS} className="underline underline-offset-4">
                limpar filtros
              </Link>
            </>
          )}
        </p>

        {paginas.itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {filtrando ? 'Nenhuma página encontrada com esses filtros.' : 'Nenhuma página ainda.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {paginas.itens.map((pagina) => (
              <li
                key={pagina.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`${ROTA_GESTAO_CMS}/paginas/${pagina.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {pagina.titulo}
                    </Link>
                    <Badge variant={VARIANTE_STATUS_PAGINA[pagina.status]}>
                      {ROTULO_STATUS_PAGINA[pagina.status]}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">/{pagina.slug}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizada em {formatarDataCms(pagina.updatedAt)}
                    {pagina.publicadaEm && ` · Publicada em ${formatarDataCms(pagina.publicadaEm)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${ROTA_GESTAO_CMS}/paginas/${pagina.id}`}>
                      <Pencil className="size-4" />
                      {pagina.status === 'arquivada' ? 'Ver' : 'Editar'}
                    </Link>
                  </Button>
                  {pagina.status !== 'arquivada' && (
                    <BotaoArquivarPaginaCms paginaId={pagina.id} titulo={pagina.titulo} tamanho="sm" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPaginas > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-between gap-2 pt-2">
            {paginas.pagina > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefCms({ ...filtros, pagina: paginas.pagina - 1 })}>Anterior</Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground">
              {paginas.pagina} de {totalPaginas}
            </span>
            {paginas.pagina < totalPaginas ? (
              <Button asChild variant="outline" size="sm">
                <Link href={hrefCms({ ...filtros, pagina: paginas.pagina + 1 })}>Próxima</Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </CardContent>
    </Card>
  )
}

export function CmsGestaoPage({
  gestorNome,
  aba,
  filtros,
  paginas,
  grupos,
  paginasAssociaveis,
}: {
  gestorNome: string
  aba: AbaCms
  filtros: Filtros
  paginas: ListagemPaginasCms
  grupos: GrupoNavegacaoGestaoDTO[]
  paginasAssociaveis: PaginaAssociavelDTO[]
}) {
  return (
    <>
      <div className="mx-auto mb-6 flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Conteúdo do site</h1>
            <p className="truncate text-sm text-muted-foreground">
              Páginas institucionais e navegação · {gestorNome}
            </p>
          </div>
        </div>
        {aba === 'paginas' && (
          <Button asChild className="shrink-0">
            <Link href={`${ROTA_GESTAO_CMS}/paginas/nova`}>
              <Plus className="size-4" />
              Nova página
            </Link>
          </Button>
        )}
      </div>

      <div className="mx-auto max-w-6xl space-y-4">
        <Abas ativa={aba} />
        {aba === 'paginas' ? (
          <ListaPaginas paginas={paginas} filtros={filtros} />
        ) : (
          <GestaoNavegacaoCms
            key={aba}
            local={aba}
            grupos={grupos.filter((grupo) => grupo.local === aba)}
            paginas={paginasAssociaveis}
          />
        )}
      </div>
    </>
  )
}
