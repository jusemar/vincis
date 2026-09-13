import { Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { BlocoManual, CelulaManual } from '../types/manual'
import { ChecklistDoManual } from './ChecklistDoManual'
import { SeloDeSituacao } from './SeloDeSituacao'
import { TextoDoManual } from './TextoDoManual'

/** Um bloco de conteúdo do manual, desenhado conforme o tipo. */
export function BlocoDoManual({ bloco }: { bloco: BlocoManual }) {
  switch (bloco.tipo) {
    case 'paragrafo':
      return (
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/85 sm:text-[15px]">
          <TextoDoManual texto={bloco.texto} />
        </p>
      )

    case 'subtitulo':
      return <h3 className="pt-2 text-lg font-semibold text-balance">{bloco.texto}</h3>

    case 'lista':
      return <Lista itens={bloco.itens} ordenada={bloco.ordenada} />

    case 'tabela':
      return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {bloco.colunas.map((coluna) => (
                  <TableHead
                    key={coluna}
                    className="h-auto whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {coluna}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bloco.linhas.map((linha, indice) => (
                <TableRow key={indice}>
                  {linha.map((celula, coluna) => (
                    <TableCell
                      key={coluna}
                      className="min-w-[9rem] whitespace-normal px-4 py-3 align-top text-sm leading-relaxed text-foreground/85"
                    >
                      <Celula celula={celula} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )

    case 'ficha':
      return (
        <article className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
            <h4 className="font-semibold">{bloco.titulo}</h4>
            <SeloDeSituacao situacao={bloco.situacao} />
          </header>
          <dl className="divide-y divide-border">
            {bloco.campos.map((campo) => (
              <div
                key={campo.rotulo}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4 sm:px-5"
              >
                <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {campo.rotulo}
                </dt>
                <dd className="text-sm leading-relaxed text-foreground/85">
                  {Array.isArray(campo.conteudo) ? (
                    <Lista itens={campo.conteudo} ordenada={campo.ordenada} compacta />
                  ) : (
                    <TextoDoManual texto={campo.conteudo} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      )

    case 'aviso': {
      const estilo = ESTILO_DO_AVISO[bloco.nivel]
      const Icone = estilo.icone
      return (
        <aside className={cn('rounded-xl border px-4 py-3.5 sm:px-5', estilo.caixa)}>
          <div className="flex items-start gap-3">
            <Icone className={cn('mt-0.5 size-5 shrink-0', estilo.cor)} aria-hidden />
            <div className="min-w-0 space-y-1.5">
              <p className="font-semibold text-foreground">
                <span className="sr-only">{estilo.leitura}: </span>
                {bloco.titulo}
              </p>
              {bloco.texto ? (
                <p className="text-sm leading-relaxed text-foreground/85">
                  <TextoDoManual texto={bloco.texto} />
                </p>
              ) : null}
              {bloco.itens ? <Lista itens={bloco.itens} compacta /> : null}
            </div>
          </div>
        </aside>
      )
    }

    case 'checklist':
      return <ChecklistDoManual id={bloco.id} itens={bloco.itens} />

    case 'glossario':
      return (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {bloco.termos.map((termo) => (
            <div key={termo.termo} className="rounded-xl border border-border bg-card px-4 py-3">
              <dt className="font-semibold">{termo.termo}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{termo.definicao}</dd>
            </div>
          ))}
        </dl>
      )

    case 'mapa':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {bloco.ramos.map((ramo) => (
            <div key={ramo.titulo} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="font-semibold text-primary">{ramo.titulo}</p>
              <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
                {ramo.itens.map((item) => (
                  <li key={item} className="text-sm leading-relaxed text-foreground/85">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )
  }
}

const ESTILO_DO_AVISO = {
  dica: {
    icone: Lightbulb,
    caixa: 'border-primary/25 bg-primary/5',
    cor: 'text-primary',
    leitura: 'Dica',
  },
  atencao: {
    icone: TriangleAlert,
    caixa: 'badge-warning',
    cor: 'text-[hsl(var(--warning))]',
    leitura: 'Atenção',
  },
  critico: {
    icone: OctagonAlert,
    caixa: 'border-destructive/35 bg-destructive/[0.06]',
    cor: 'text-destructive',
    leitura: 'Limitação importante',
  },
} as const

function Celula({ celula }: { celula: CelulaManual }) {
  if (typeof celula === 'string') return <TextoDoManual texto={celula} />
  return <SeloDeSituacao situacao={celula.situacao} complemento={celula.texto} />
}

function Lista({
  itens,
  ordenada,
  compacta,
}: {
  itens: string[]
  ordenada?: boolean
  compacta?: boolean
}) {
  const Tag = ordenada ? 'ol' : 'ul'
  return (
    <Tag
      className={cn(
        'max-w-3xl space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/85 marker:text-primary',
        ordenada ? 'list-decimal marker:font-semibold' : 'list-disc',
        !compacta && 'sm:text-[15px]',
      )}
    >
      {itens.map((item, indice) => (
        <li key={indice} className="pl-1">
          <TextoDoManual texto={item} />
        </li>
      ))}
    </Tag>
  )
}
