import Link from 'next/link'
import { EyeOff } from 'lucide-react'
import { caminhoEdicaoArtigo, caminhoModeracaoArtigo } from '../../constants/rotas'

/** Faixa da prévia privada: deixa claro que o texto não está publicado. */
export function AvisoPrevia({ artigoId, gestor }: { artigoId: string; gestor: boolean }) {
  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <EyeOff className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
        Pré-visualização privada — este texto ainda não está publicado nesta versão.
      </p>
      <Link
        href={gestor ? caminhoModeracaoArtigo(artigoId) : caminhoEdicaoArtigo(artigoId)}
        className="alvo-toque-h inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 font-bold text-foreground hover:border-primary/50"
      >
        {gestor ? 'Voltar à moderação' : 'Voltar à edição'}
      </Link>
    </div>
  )
}
