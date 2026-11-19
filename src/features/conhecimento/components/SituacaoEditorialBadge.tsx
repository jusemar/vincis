import { ROTULO_SITUACAO, type SituacaoEditorial } from '../constants/status'
import { cn } from '@/lib/utils'

const CORES: Record<SituacaoEditorial, string> = {
  rascunho: 'border-border bg-muted text-foreground',
  aguardando_aprovacao: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  devolvido: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  rejeitado: 'border-destructive/40 bg-destructive/10 text-destructive',
  publicado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  despublicado: 'border-border bg-muted text-muted-foreground',
  arquivado: 'border-border bg-muted text-muted-foreground',
}

/** Situação editorial com cor e texto (nunca só cor). */
export function SituacaoEditorialBadge({ situacao, className }: { situacao: SituacaoEditorial; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', CORES[situacao], className)}>
      {ROTULO_SITUACAO[situacao]}
    </span>
  )
}
