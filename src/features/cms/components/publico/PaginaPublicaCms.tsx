import { ConteudoRenderizado } from '../../nucleo/conteudo/renderizar-conteudo'
import type { PaginaPublicaCms as PaginaPublica } from '../../queries/publico'

/**
 * Página institucional publicada, no espaçamento das páginas públicas da
 * Vincis: abaixo da navegação fixa (`pt-32`), largura de leitura e as margens laterais do
 * site. Navegação e rodapé vêm do `AppChrome`, como em qualquer página pública.
 */
export function PaginaPublicaCms({ pagina }: { pagina: PaginaPublica }) {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {pagina.titulo}
        </h1>
      </header>
      <div className="text-base text-foreground/90 sm:text-lg">
        <ConteudoRenderizado conteudo={pagina.conteudo} />
      </div>
    </article>
  )
}
