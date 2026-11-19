import { Fragment, type ReactNode } from 'react'
import { enderecoLinkSchema } from '@/features/cms/nucleo/conteudo/schema'
import { ehImagemDeArtigoPermitida } from '../../lib/conteudo/imagens-permitidas'
import type { NoConteudo } from '../../lib/conteudo/schema-conteudo'

/**
 * Corpo do artigo → elementos React. Sem `dangerouslySetInnerHTML`.
 *
 * Mesmo desenho do renderizador do CMS, com imagem e tabela. Revalida o que é
 * perigoso mesmo depois do schema (href e src), porque o renderizador não deve
 * confiar que alguém validou antes. Link externo de artigo sai com
 * `rel="nofollow ugc noopener noreferrer"`: é conteúdo escrito por usuários,
 * e a Vincis não endossa para buscadores os destinos citados.
 */

function aplicarMarcas(no: NoConteudo, conteudo: ReactNode, chave: string) {
  return (no.marks ?? []).reduce<ReactNode>((atual, marca, indice) => {
    const chaveMarca = `${chave}-${marca.type}-${indice}`
    if (marca.type === 'bold') return <strong key={chaveMarca}>{atual}</strong>
    if (marca.type === 'italic') return <em key={chaveMarca}>{atual}</em>
    if (marca.type === 'link') {
      const href = enderecoLinkSchema.safeParse(marca.attrs.href)
      if (!href.success) return atual
      const interno = href.data.startsWith('/')
      return (
        <a
          key={chaveMarca}
          href={href.data}
          target={interno ? undefined : '_blank'}
          rel={interno ? undefined : 'nofollow ugc noopener noreferrer'}
          className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
        >
          {atual}
        </a>
      )
    }
    return atual
  }, conteudo)
}

function atributoCelula(no: NoConteudo, nome: 'colspan' | 'rowspan'): number | undefined {
  const valor = no.attrs?.[nome]
  return typeof valor === 'number' && valor > 1 ? valor : undefined
}

function classeAlinhamento(no: NoConteudo): string {
  const valor = no.attrs?.align
  return valor === 'center' ? 'text-center' : valor === 'right' ? 'text-right' : ''
}

function renderizarNo(no: NoConteudo, chave: string): ReactNode {
  if (no.type === 'text') return <Fragment key={chave}>{aplicarMarcas(no, no.text ?? '', chave)}</Fragment>
  const filhos = no.content?.map((filho, indice) => renderizarNo(filho, `${chave}-${indice}`))

  switch (no.type) {
    case 'doc':
      return (
        <div key={chave} className="space-y-5">
          {filhos}
        </div>
      )
    case 'paragraph':
      return (
        <p key={chave} className="leading-8">
          {filhos}
        </p>
      )
    case 'heading':
      return no.attrs?.level === 3 ? (
        <h3 key={chave} className="pt-4 text-xl font-semibold tracking-tight text-foreground">
          {filhos}
        </h3>
      ) : (
        <h2 key={chave} className="pt-6 text-2xl font-bold tracking-tight text-foreground">
          {filhos}
        </h2>
      )
    case 'bulletList':
      return (
        <ul key={chave} className="list-disc space-y-2 pl-6 marker:text-primary">
          {filhos}
        </ul>
      )
    case 'orderedList': {
      const inicio = typeof no.attrs?.start === 'number' ? no.attrs.start : 1
      return (
        <ol key={chave} start={inicio} className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-primary">
          {filhos}
        </ol>
      )
    }
    case 'listItem':
      return (
        <li key={chave} className="[&>p]:leading-7">
          {filhos}
        </li>
      )
    case 'image': {
      const src = typeof no.attrs?.src === 'string' ? no.attrs.src : null
      if (!ehImagemDeArtigoPermitida(src)) return null
      const alt = typeof no.attrs?.alt === 'string' ? no.attrs.alt : ''
      return (
        <figure key={chave} className="my-6">
          {/* Imagem do storage da Vincis; `img` simples para não depender de domínios do otimizador. */}
          <img
            src={src!}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-xl border border-border bg-muted object-cover"
          />
          {alt ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{alt}</figcaption> : null}
        </figure>
      )
    }
    case 'table':
      return (
        <div key={chave} className="my-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <tbody>{filhos}</tbody>
          </table>
        </div>
      )
    case 'tableRow':
      return (
        <tr key={chave} className="border-b border-border last:border-b-0 even:bg-muted/30">
          {filhos}
        </tr>
      )
    case 'tableHeader':
      return (
        <th
          key={chave}
          scope="col"
          colSpan={atributoCelula(no, 'colspan')}
          rowSpan={atributoCelula(no, 'rowspan')}
          className={`bg-muted px-4 py-3 align-top font-semibold text-foreground [&>p]:leading-6 ${classeAlinhamento(no)}`}
        >
          {filhos}
        </th>
      )
    case 'tableCell':
      return (
        <td
          key={chave}
          colSpan={atributoCelula(no, 'colspan')}
          rowSpan={atributoCelula(no, 'rowspan')}
          className={`px-4 py-3 align-top text-foreground/90 [&>p]:leading-6 ${classeAlinhamento(no)}`}
        >
          {filhos}
        </td>
      )
    default:
      return null
  }
}

export function ConteudoArtigo({ conteudo }: { conteudo: NoConteudo }) {
  return <div className="text-base text-foreground/90 sm:text-lg">{renderizarNo(conteudo, 'artigo')}</div>
}
