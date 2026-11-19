import type { AutorPublico } from '../../types/artigo'
import { iniciais, nomeDoAutor } from '../../lib/apresentacao'
import { cn } from '@/lib/utils'

/** Foto do autor (perfil público) ou marca da Vincis no institucional. */
export function AvatarAutor({ autor, tamanho = 'md' }: { autor: AutorPublico; tamanho?: 'sm' | 'md' | 'lg' }) {
  const classes = cn(
    'shrink-0 overflow-hidden rounded-full border border-border bg-muted',
    tamanho === 'sm' && 'size-8 text-xs',
    tamanho === 'md' && 'size-11 text-sm',
    tamanho === 'lg' && 'size-16 text-lg',
  )
  // Profissional e equipe Vincis usam a foto real da conta; institucional, a marca.
  if (autor.tipo !== 'institucional' && autor.fotoUrl)
    return (
      <span className={classes}>
        <img src={autor.fotoUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </span>
    )
  return (
    <span
      aria-hidden
      className={cn(
        classes,
        'flex items-center justify-center font-bold',
        autor.tipo === 'institucional' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
      )}
    >
      {autor.tipo === 'institucional' ? 'V' : iniciais(nomeDoAutor(autor))}
    </span>
  )
}
