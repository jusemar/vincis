import { Fragment, type ReactNode } from 'react'
import { enderecoLinkSchema, type NoConteudo } from './schema'

/**
 * Documento do CMS → elementos React.
 *
 * Só desenha os nós da lista fechada de `schema.ts`; qualquer outro vira nada.
 * Não usa `dangerouslySetInnerHTML`: texto é sempre texto, e o `href` do link é
 * revalidado aqui mesmo, porque o renderizador não deve confiar que alguém
 * validou antes.
 *
 * O `h1` da página é do título dela, então os níveis do editor descem um degrau
 * (1 → h2, 2 → h3, 3 → h4) e a hierarquia do documento continua correta.
 */
function aplicarMarcas(no: NoConteudo, conteudo: ReactNode, chave: string) {
  return (no.marks ?? []).reduce<ReactNode>((atual, marca, indice) => {
    const chaveMarca = `${chave}-${marca.type}-${indice}`
    if (marca.type === 'bold') return <strong key={chaveMarca}>{atual}</strong>
    if (marca.type === 'italic') return <em key={chaveMarca}>{atual}</em>
    if (marca.type === 'link') {
      const href = enderecoLinkSchema.safeParse(marca.attrs.href)
      if (!href.success) return atual
      const novaAba = marca.attrs.target === '_blank'
      return (
        <a
          key={chaveMarca}
          href={href.data}
          target={novaAba ? '_blank' : undefined}
          rel={novaAba ? 'noopener noreferrer' : undefined}
          className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
        >
          {atual}
        </a>
      )
    }
    return atual
  }, conteudo)
}

function renderizarNo(no: NoConteudo, chave: string): ReactNode {
  if (no.type === 'text')
    return <Fragment key={chave}>{aplicarMarcas(no, no.text ?? '', chave)}</Fragment>

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
        <p key={chave} className="leading-7">
          {filhos}
        </p>
      )
    case 'heading': {
      const nivel = no.attrs?.level
      if (nivel === 1)
        return (
          <h2 key={chave} className="mt-8 text-2xl font-semibold tracking-tight">
            {filhos}
          </h2>
        )
      if (nivel === 2)
        return (
          <h3 key={chave} className="mt-7 text-xl font-semibold tracking-tight">
            {filhos}
          </h3>
        )
      return (
        <h4 key={chave} className="mt-6 text-lg font-semibold">
          {filhos}
        </h4>
      )
    }
    case 'bulletList':
      return (
        <ul key={chave} className="list-disc space-y-2 pl-6">
          {filhos}
        </ul>
      )
    case 'orderedList': {
      const inicio = typeof no.attrs?.start === 'number' ? no.attrs.start : 1
      return (
        <ol key={chave} start={inicio} className="list-decimal space-y-2 pl-6">
          {filhos}
        </ol>
      )
    }
    case 'listItem':
      return <li key={chave}>{filhos}</li>
    default:
      return null
  }
}

export function ConteudoRenderizado({ conteudo }: { conteudo: NoConteudo }) {
  return <>{renderizarNo(conteudo, 'conteudo')}</>
}
