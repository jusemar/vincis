'use client'

import { useRef, useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { AlertTriangle, ImagePlus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IMAGEM_ARTIGO, LIMITES_ARTIGO } from '../../../constants/limites'
import { enviarImagemDoNavegador } from './enviar-imagem'


/**
 * Imagem de capa: upload (mesma action e armazenamento de sempre), prévia em
 * 16:9, texto alternativo e erros claros na própria tela. O navegador confere
 * tipo e tamanho antes de enviar só para poupar tempo — quem decide é o
 * servidor (tipo, extensão, assinatura dos bytes e 5 MB).
 */
export function CampoCapa({
  capaUrl,
  aoAlterar,
  registrarAlt,
  erroAlt,
  desabilitado,
}: {
  capaUrl: string | null | undefined
  aoAlterar: (url: string | null) => void
  registrarAlt: UseFormRegisterReturn
  erroAlt?: string
  desabilitado: boolean
}) {
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [proporcaoFora, setProporcaoFora] = useState(false)

  async function enviar() {
    const arquivo = arquivoRef.current?.files?.[0]
    if (!arquivo) return
    setErro(null)
    setEnviando(true)
    try {
      const resultado = await enviarImagemDoNavegador(arquivo)
      if (!resultado.ok) {
        setErro(resultado.mensagem)
        return
      }
      setProporcaoFora(false)
      aoAlterar(resultado.url)
    } finally {
      setEnviando(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="artigo-capa">Imagem de capa</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Recomendado: <strong>WebP</strong> em 16:9 (ex.: 1600×900). Também aceita JPG e PNG, até 5 MB.
        </p>
      </div>

      {capaUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
          <img
            src={capaUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover"
            onLoad={(evento) => {
              const { naturalWidth: largura, naturalHeight: altura } = evento.currentTarget
              setProporcaoFora(altura > 0 && Math.abs(largura / altura - 16 / 9) > 0.15)
            }}
          />
          <div className="absolute right-2 top-2 flex gap-2">
            <Button type="button" size="sm" variant="secondary" className="gap-1" disabled={desabilitado || enviando} onClick={() => arquivoRef.current?.click()}>
              <RefreshCw className="size-4" aria-hidden /> Trocar
            </Button>
            <Button type="button" size="sm" variant="secondary" className="gap-1" disabled={desabilitado || enviando} onClick={() => aoAlterar(null)}>
              <X className="size-4" aria-hidden /> Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={desabilitado || enviando}
          onClick={() => arquivoRef.current?.click()}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60 sm:aspect-[3/1]"
        >
          <ImagePlus className="size-7" aria-hidden />
          <span className="font-semibold">{enviando ? 'Enviando…' : 'Escolher imagem de capa'}</span>
          <span className="text-xs">WebP recomendado · 16:9 · até 5 MB</span>
        </button>
      )}

      <input
        ref={arquivoRef}
        id="artigo-capa"
        type="file"
        accept={IMAGEM_ARTIGO.tipos.join(',')}
        className="sr-only"
        onChange={() => void enviar()}
      />

      {enviando && capaUrl ? <p className="text-xs text-muted-foreground">Enviando nova imagem…</p> : null}
      {erro ? (
        <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {erro}
        </p>
      ) : null}
      {capaUrl && proporcaoFora ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          A imagem não está em 16:9 — ela será recortada nos cards. WebP em 1600×900 fica melhor.
        </p>
      ) : null}

      {capaUrl ? (
        <div className="space-y-1.5">
          <Label htmlFor="artigo-capa-alt">Texto alternativo da imagem</Label>
          <Input id="artigo-capa-alt" maxLength={LIMITES_ARTIGO.capaAlt} placeholder="Ex.: Pessoa preenchendo a declaração no computador" aria-invalid={Boolean(erroAlt)} {...registrarAlt} />
          <p className="text-xs text-muted-foreground">Descreve a imagem para quem usa leitor de tela. Obrigatório para enviar.</p>
          {erroAlt ? <p className="text-xs text-destructive">{erroAlt}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
