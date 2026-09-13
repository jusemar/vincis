import { cn } from '@/lib/utils'
import { SITUACAO, type Situacao } from '../constants/situacao'

/**
 * Selo da situação de um recurso: emoji + rótulo, nas cores de estado que a
 * plataforma já usa (`badge-success`, `badge-warning`, `badge-info`, neutro).
 */
const TOM: Record<Situacao, string> = {
  pronto: 'badge-success',
  parcial: 'badge-warning',
  simulado: 'badge-info',
  visual: 'border border-border bg-muted text-muted-foreground',
}

export function SeloDeSituacao({
  situacao,
  complemento,
  className,
}: {
  situacao: Situacao
  complemento?: string
  className?: string
}) {
  const { emoji, rotulo } = SITUACAO[situacao]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
        TOM[situacao],
        className,
      )}
    >
      <span aria-hidden>{emoji}</span>
      {rotulo}
      {complemento ? (
        <span className="font-normal normal-case tracking-normal opacity-80">· {complemento}</span>
      ) : null}
    </span>
  )
}
