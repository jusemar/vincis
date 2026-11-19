'use client'

import type { UseFormRegisterReturn } from 'react-hook-form'
import { Search, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LIMITES_ARTIGO, RECOMENDACAO_SEO } from '../../../constants/limites'
import { descricaoSeoArtigo, tituloSeoArtigo } from '../../../lib/seo-artigo'
import { cn } from '@/lib/utils'

/** Contador com a faixa recomendada (verde até a recomendação, âmbar acima). */
function Contador({ tamanho, recomendado, maximo }: { tamanho: number; recomendado: number; maximo: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        tamanho === 0 ? 'text-muted-foreground' : tamanho <= recomendado ? 'text-emerald-700 dark:text-emerald-400' : tamanho <= maximo ? 'text-amber-700 dark:text-amber-400' : 'text-destructive',
      )}
    >
      {tamanho}/{recomendado} recomendados
    </span>
  )
}

/**
 * "Título SEO" e "Meta descrição", com sugestão automática, contadores e prévia
 * aproximada do Google. Campo vazio = a página usa a versão automática (a
 * mesma regra de `lib/seo-artigo`, que é a que o servidor aplica).
 */
export function SecaoSeo({
  titulo,
  resumo,
  slug,
  tituloSeo,
  descricaoSeo,
  registrarTitulo,
  registrarDescricao,
  aplicar,
  desabilitado,
}: {
  titulo: string
  resumo: string
  slug: string
  tituloSeo: string | null | undefined
  descricaoSeo: string | null | undefined
  registrarTitulo: UseFormRegisterReturn
  registrarDescricao: UseFormRegisterReturn
  aplicar: (campo: 'tituloSeo' | 'descricaoSeo', valor: string) => void
  desabilitado: boolean
}) {
  const sugestaoTitulo = tituloSeoArtigo({ titulo: titulo || 'Título do artigo', tituloSeo: null })
  const sugestaoDescricao = descricaoSeoArtigo({ resumo: resumo || 'Resumo do artigo.', descricaoSeo: null })
  const tituloFinal = tituloSeo?.trim() || sugestaoTitulo
  const descricaoFinal = descricaoSeo?.trim() ? descricaoSeoArtigo({ resumo: '', descricaoSeo: descricaoSeo }) : sugestaoDescricao

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="artigo-titulo-seo">Título SEO</Label>
          <Contador tamanho={tituloSeo?.length ?? 0} recomendado={RECOMENDACAO_SEO.titulo} maximo={70} />
        </div>
        <Textarea
          id="artigo-titulo-seo"
          rows={1}
          maxLength={LIMITES_ARTIGO.tituloSeo}
          placeholder={sugestaoTitulo}
          disabled={desabilitado}
          className="min-h-10 resize-none"
          {...registrarTitulo}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Título azul do Google. Vazio = automático (título do artigo + Vincis).</p>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={desabilitado} onClick={() => aplicar('tituloSeo', sugestaoTitulo)}>
            <Wand2 className="size-3.5" aria-hidden /> Usar sugestão
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="artigo-descricao-seo">Meta descrição</Label>
          <Contador tamanho={descricaoSeo?.length ?? 0} recomendado={RECOMENDACAO_SEO.descricao} maximo={160} />
        </div>
        <Textarea
          id="artigo-descricao-seo"
          rows={3}
          maxLength={LIMITES_ARTIGO.descricaoSeo}
          placeholder={sugestaoDescricao}
          disabled={desabilitado}
          {...registrarDescricao}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Texto sob o título no Google. Vazio = automático (resumo do artigo).</p>
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={desabilitado} onClick={() => aplicar('descricaoSeo', sugestaoDescricao)}>
            <Wand2 className="size-3.5" aria-hidden /> Usar sugestão
          </Button>
        </div>
      </div>

      {/* Prévia aproximada: o Google pode reescrever título e descrição. */}
      <figure className="rounded-xl border border-border bg-white p-4 text-left shadow-sm dark:bg-zinc-900" aria-label="Prévia aproximada no Google">
        <figcaption className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Search className="size-3.5" aria-hidden /> Prévia aproximada no Google
        </figcaption>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">V</span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm text-zinc-800 dark:text-zinc-200">Vincis</p>
            <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">https://vincis.com.br › conhecimento › {slug || '…'}</p>
          </div>
        </div>
        <p className="mt-2 line-clamp-1 text-lg leading-snug text-[#1a0dab] dark:text-[#99c3ff]">{tituloFinal}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-700 dark:text-zinc-300">{descricaoFinal}</p>
      </figure>
    </div>
  )
}
