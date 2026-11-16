import Link from 'next/link'

/**
 * Moldura das páginas institucionais escritas no código (hoje, Contato — Termos
 * e Privacidade passaram para o CMS).
 *
 * Mesmo espaçamento e tipografia da página do CMS (`PaginaPublicaCms`): abaixo
 * da navegação fixa (`pt-32`), largura de leitura, título com borda inferior.
 * Assim "Sobre Nós" (CMS) e estas páginas parecem a mesma família.
 */
export function PaginaInstitucional({
  titulo,
  introducao,
  atualizadoEm,
  children,
}: {
  titulo: string
  introducao?: React.ReactNode
  /** Texto pronto, ex.: "16 de novembro de 2026". */
  atualizadoEm?: string
  children: React.ReactNode
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{titulo}</h1>
        {introducao ? <div className="mt-4 text-base text-muted-foreground sm:text-lg">{introducao}</div> : null}
        {atualizadoEm ? (
          <p className="mt-3 text-sm text-muted-foreground">Última atualização: {atualizadoEm}</p>
        ) : null}
      </header>
      <div className="space-y-5 text-base leading-7 text-foreground/90 sm:text-lg">{children}</div>
    </article>
  )
}

/** Link interno no estilo do conteúdo do CMS. */
export function LinkInterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
    >
      {children}
    </Link>
  )
}
