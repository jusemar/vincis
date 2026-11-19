import Link from 'next/link'
import { caminhoArtigo } from '../../constants/rotas'
import { descricaoDoAutor, formatarData, nomeDoAutor } from '../../lib/apresentacao'
import type { CardArtigo as Artigo } from '../../types/artigo'
import { AvatarAutor } from './AvatarAutor'
import { cn } from '@/lib/utils'

/**
 * Card de artigo: capa (opcional — sem ela o card começa pelo texto), categoria, título, resumo, autor e data.
 * O card inteiro é um link (um alvo de toque grande no celular); o título é o
 * nome acessível do link.
 */
export function CardArtigo({
  artigo,
  destaque = false,
  titulo: NivelTitulo = 'h3',
}: {
  artigo: Artigo
  destaque?: boolean
  titulo?: 'h2' | 'h3'
}) {
  /*
    Altura: com capa, o card acompanha a linha da grade (h-full + texto flex-1 +
    autor mt-auto) para alinhar as capas. Sem capa, nada disso — o card tem a
    altura do próprio conteúdo e termina logo após o autor, mesmo ao lado de um
    card com imagem (o <li> da grade estica, mas é invisível).
  */
  const comCapa = Boolean(artigo.capaUrl)
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg',
        comCapa && 'h-full',
        destaque && 'md:flex-row',
      )}
    >
      {/* Sem capa não há área de imagem: o card começa direto pelo texto. */}
      {artigo.capaUrl ? (
        <div className={cn('relative aspect-[16/9] shrink-0 overflow-hidden bg-muted', destaque && 'md:aspect-auto md:w-1/2')}>
          <img
            src={artigo.capaUrl}
            alt={artigo.capaAlt ?? ''}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {artigo.categoria ? (
            <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
              {artigo.categoria.nome}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn('flex flex-col gap-3 p-5', comCapa && 'flex-1', destaque && comCapa && 'md:justify-center', destaque && 'md:p-8')}>
        {!artigo.capaUrl && artigo.categoria ? (
          <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {artigo.categoria.nome}
          </span>
        ) : null}
        <NivelTitulo
          className={cn(
            'font-bold leading-snug tracking-tight text-foreground',
            destaque ? 'text-xl md:text-2xl' : 'text-lg',
          )}
        >
          <Link
            href={caminhoArtigo(artigo.slug)}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-focus-within:text-primary"
          >
            {artigo.titulo}
          </Link>
        </NivelTitulo>
        <p className={cn('text-sm leading-6 text-muted-foreground', destaque ? 'line-clamp-4' : 'line-clamp-3')}>
          {artigo.resumo}
        </p>
        <div className={cn('flex items-center gap-3 pt-2', comCapa && 'mt-auto')}>
          <AvatarAutor autor={artigo.autor} tamanho="sm" />
          <div className="min-w-0 text-xs">
            <p className="truncate font-semibold text-foreground">{nomeDoAutor(artigo.autor)}</p>
            <p className="truncate text-muted-foreground">
              {[descricaoDoAutor(artigo.autor), formatarData(artigo.publicadoEm)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
