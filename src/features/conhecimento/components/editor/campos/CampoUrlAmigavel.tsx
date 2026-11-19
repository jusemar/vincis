'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Link2, Lock, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { verificarSlugArtigo } from '../../../actions/slug'
import { LIMITES_ARTIGO } from '../../../constants/limites'
import { montarBaseSlugArtigo, motivoSlugInvalido, normalizarSlugArtigo } from '../../../lib/slug-artigo'
import type { SituacaoSlug } from '../../../queries/slug'

/** Domínio exibido na prévia — o mesmo do canonical. */
const DOMINIO = 'vincis.com.br'

/**
 * Campo "URL amigável".
 *
 * Enquanto a pessoa não mexe, a URL acompanha o título (e o formulário envia
 * `null`: o servidor gera e resolve conflitos com sufixo). Ao editar, a URL
 * escolhida é conferida ao vivo (formato, reservadas, unicidade) e enviada como
 * está — o servidor confere de novo. Depois da primeira publicação o campo
 * vira só leitura: a URL fica estável.
 */
export function CampoUrlAmigavel({
  titulo,
  artigoId,
  slugAtual,
  fixo,
  desabilitado,
  aoAlterar,
}: {
  titulo: string
  artigoId: string | null
  slugAtual: string | null
  fixo: boolean
  desabilitado: boolean
  /** `null` = automática (do título); texto = escolhida pelo autor. */
  aoAlterar: (slug: string | null) => void
}) {
  // Já personalizada: o slug gravado difere do que o título geraria.
  const [personalizada, setPersonalizada] = useState(
    Boolean(slugAtual && slugAtual !== montarBaseSlugArtigo(titulo)),
  )
  const [texto, setTexto] = useState(slugAtual ?? '')
  const [situacao, setSituacao] = useState<SituacaoSlug | null>(null)

  const automatica = montarBaseSlugArtigo(titulo || 'artigo')
  const exibida = fixo ? (slugAtual ?? '') : personalizada ? normalizarSlugArtigo(texto) : automatica
  const motivoLocal = personalizada && !fixo ? motivoSlugInvalido(exibida) : null

  // Conferência ao vivo (debounce) só quando a URL foi escolhida à mão.
  useEffect(() => {
    if (fixo || !personalizada || motivoLocal) return
    let cancelado = false
    const espera = setTimeout(async () => {
      const resposta = await verificarSlugArtigo({ slug: exibida, artigoId })
      if (!cancelado) setSituacao(resposta)
    }, 450)
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
  }, [exibida, personalizada, fixo, artigoId, motivoLocal])

  function editar(valor: string) {
    setPersonalizada(true)
    setTexto(valor)
    setSituacao(null)
    aoAlterar(normalizarSlugArtigo(valor) || null)
  }

  function voltarAoAutomatico() {
    setPersonalizada(false)
    setTexto('')
    setSituacao(null)
    aoAlterar(null)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <Label htmlFor="artigo-slug" className="flex items-center gap-1.5">
          <Link2 className="size-3.5" aria-hidden /> URL amigável
        </Label>
        {!fixo ? (
          <span className="text-xs text-muted-foreground">
            {exibida.length}/{LIMITES_ARTIGO.slug.max}
          </span>
        ) : null}
      </div>

      {fixo ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="break-all">
            {DOMINIO}/conhecimento/<strong>{exibida}</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              Fixa desde a primeira publicação, para não quebrar links e o histórico nos buscadores.
            </span>
          </span>
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/50">
              <span className="hidden shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground sm:inline">
                /conhecimento/
              </span>
              <input
                id="artigo-slug"
                value={personalizada ? texto : automatica}
                disabled={desabilitado}
                maxLength={200}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="artigo-slug-ajuda artigo-slug-situacao"
                aria-invalid={Boolean(motivoLocal || (situacao && !situacao.disponivel))}
                onChange={(evento) => editar(evento.target.value)}
                onBlur={() => personalizada && setTexto(normalizarSlugArtigo(texto))}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none md:text-sm"
              />
            </div>
            {personalizada ? (
              <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5" disabled={desabilitado} onClick={voltarAoAutomatico}>
                <RotateCcw className="size-3.5" aria-hidden /> Gerar do título
              </Button>
            ) : null}
          </div>
          <p id="artigo-slug-ajuda" className="break-all text-xs text-muted-foreground">
            Prévia: <span className="font-medium text-foreground">{DOMINIO}/conhecimento/{exibida || '…'}</span>
            {personalizada ? '' : ' · gerada do título automaticamente; edite se quiser.'}
          </p>
          <div id="artigo-slug-situacao" aria-live="polite" className="text-xs">
            {motivoLocal ? (
              <p className="flex items-center gap-1 text-destructive">
                <XCircle className="size-3.5" aria-hidden /> {motivoLocal}
              </p>
            ) : situacao && personalizada ? (
              situacao.disponivel ? (
                <p className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" aria-hidden /> URL disponível.
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-1 text-destructive">
                  <XCircle className="size-3.5" aria-hidden /> {situacao.motivo}
                  {situacao.sugestao ? (
                    <button
                      type="button"
                      className="font-semibold text-primary underline underline-offset-2"
                      onClick={() => editar(situacao.sugestao!)}
                    >
                      Usar “{situacao.sugestao}”
                    </button>
                  ) : null}
                </p>
              )
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
