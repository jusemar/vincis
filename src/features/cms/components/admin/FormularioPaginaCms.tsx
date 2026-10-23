'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { ArrowLeft, ExternalLink, Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  criarPaginaCms,
  despublicarPaginaCms,
  editarPaginaCms,
  publicarPaginaCms,
} from '../../actions/paginas'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import {
  ROTULO_STATUS_PAGINA,
  VARIANTE_STATUS_PAGINA,
  formatarDataCms,
} from '../../constants'
import { schemasCms } from '../../integracao/schemas'
import { CONTEUDO_PAGINA_VAZIO, type NoConteudo } from '../../nucleo/conteudo/schema'
import { gerarIdentificador } from '../../nucleo/lib/identificador'
import { LIMITES_CMS } from '../../nucleo/schemas/constantes'
import { ROTA_GESTAO_CMS } from '../../lib/rotas'
import type { ResultadoCms } from '../../nucleo/types'
import type { PaginaCmsEdicaoDTO } from '../../types'
import { BotaoArquivarPaginaCms } from './BotaoArquivarPaginaCms'

/**
 * Formulário de página do CMS: conteúdo, endereço e SEO.
 *
 * O schema é o mesmo da action (`schemasCms.criarPagina`): o formulário avisa
 * cedo, e o servidor confere de novo — inclusive unicidade do slug, que só o
 * banco sabe responder. Quando a recusa vem de lá, o campo certo é marcado.
 *
 * Estado não é um campo solto: publicar, despublicar e arquivar são ações à
 * parte, cada uma com seu evento de auditoria. "Salvar e publicar" grava e
 * publica em sequência.
 */
const EditorConteudoCms = dynamic(() => import('./EditorConteudoCms'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg border border-border bg-muted" />,
})

type Entrada = z.input<typeof schemasCms.criarPagina>
type Saida = z.output<typeof schemasCms.criarPagina>
type Campo = keyof Entrada

function Contador({ valor, limite }: { valor: string | null | undefined; limite: number }) {
  const tamanho = valor?.length ?? 0
  return (
    <span className={tamanho > limite ? 'text-destructive' : 'text-muted-foreground'}>
      {tamanho}/{limite}
    </span>
  )
}

export function FormularioPaginaCms({ pagina }: { pagina?: PaginaCmsEdicaoDTO }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  // Na criação, o slug acompanha o título até o Gestor mexer nele à mão.
  const [slugManual, setSlugManual] = useState(Boolean(pagina))

  const status = pagina?.status ?? 'rascunho'
  const arquivada = status === 'arquivada'

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(schemasCms.criarPagina),
    defaultValues: {
      titulo: pagina?.titulo ?? '',
      slug: pagina?.slug ?? '',
      conteudo: pagina?.conteudo ?? CONTEUDO_PAGINA_VAZIO,
      tituloSeo: pagina?.tituloSeo ?? '',
      descricaoSeo: pagina?.descricaoSeo ?? '',
    },
  })
  const [slug, tituloSeo, descricaoSeo] = useWatch({
    control,
    name: ['slug', 'tituloSeo', 'descricaoSeo'],
  })

  function tratarFalha(resultado: Extract<ResultadoCms, { sucesso: false }>) {
    if (resultado.campo && ['titulo', 'slug', 'conteudo', 'tituloSeo', 'descricaoSeo'].includes(resultado.campo))
      setError(resultado.campo as Campo, { message: resultado.mensagem })
    toast.error(resultado.mensagem)
  }

  function salvar(publicarDepois: boolean) {
    return handleSubmit((dados) =>
      iniciar(async () => {
        if (!pagina) {
          const criada = await chamarAcaoCms(() => criarPaginaCms(dados))
          if (!criada.sucesso) return tratarFalha(criada)
          if (publicarDepois) {
            const publicada = await chamarAcaoCms(() => publicarPaginaCms({ paginaId: criada.dados!.id }))
            if (!publicada.sucesso)
              toast.error(`Página salva como rascunho, mas não publicada: ${publicada.mensagem}`)
            else toast.success('Página criada e publicada.')
          } else toast.success(criada.mensagem)
          router.replace(`${ROTA_GESTAO_CMS}/paginas/${criada.dados!.id}`)
          return
        }

        const editada = await chamarAcaoCms(() => editarPaginaCms({ paginaId: pagina.id, ...dados }))
        if (!editada.sucesso) return tratarFalha(editada)
        reset(dados)
        if (publicarDepois) {
          const publicada = await chamarAcaoCms(() => publicarPaginaCms({ paginaId: pagina.id }))
          if (!publicada.sucesso) toast.error(publicada.mensagem)
          else toast.success('Alterações salvas e página publicada.')
        } else toast.success(status === 'publicada' ? 'Alterações publicadas.' : editada.mensagem)
        router.refresh()
      }),
    )
  }

  function despublicar() {
    if (!pagina) return
    iniciar(async () => {
      const resultado = await chamarAcaoCms(() => despublicarPaginaCms({ paginaId: pagina.id }))
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  const campoDesabilitado = pendente || arquivada

  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        void salvar(false)()
      }}
      className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]"
    >
      <div className="min-w-0 space-y-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={ROTA_GESTAO_CMS}>
              <ArrowLeft className="size-4" />
              Páginas
            </Link>
          </Button>
        </div>

        {arquivada && (
          <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Esta página está arquivada. O conteúdo fica guardado só para consulta e o endereço
            continua reservado.
          </p>
        )}
        {pagina?.conteudoInvalido && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive">
            O conteúdo gravado desta página não está no formato aceito hoje e abriu vazio. Salvar
            substitui o conteúdo antigo.
          </p>
        )}

        <Card>
          <CardContent className="space-y-5 p-5">
            <h2 className="font-semibold">Conteúdo</h2>

            <div className="space-y-1.5">
              <Label htmlFor="cms-titulo">Título</Label>
              <Input
                id="cms-titulo"
                disabled={campoDesabilitado}
                aria-invalid={Boolean(errors.titulo)}
                {...register('titulo', {
                  onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
                    if (!slugManual)
                      setValue('slug', gerarIdentificador(evento.target.value), {
                        shouldDirty: true,
                      })
                  },
                })}
              />
              {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cms-slug">Endereço</Label>
              <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="pl-3 text-sm text-muted-foreground" aria-hidden>
                  /
                </span>
                <Input
                  id="cms-slug"
                  disabled={campoDesabilitado}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.slug)}
                  aria-describedby="cms-slug-ajuda"
                  className="border-0 pl-1 shadow-none focus-visible:ring-0"
                  {...register('slug', { onChange: () => setSlugManual(true) })}
                />
              </div>
              {errors.slug ? (
                <p className="text-sm text-destructive">{errors.slug.message}</p>
              ) : (
                <p id="cms-slug-ajuda" className="text-sm text-muted-foreground">
                  Letras minúsculas, números e hífens. Não pode repetir o endereço de outra página
                  nem de uma área do sistema.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span id="cms-conteudo-rotulo" className="text-sm font-medium">
                Texto da página
              </span>
              <Controller
                control={control}
                name="conteudo"
                render={({ field }) => (
                  <EditorConteudoCms
                    // A entrada do schema é `unknown` (o servidor não confia no
                    // formato); aqui o valor sempre veio do próprio editor.
                    valor={field.value as NoConteudo}
                    aoAlterar={field.onChange}
                    desabilitado={campoDesabilitado}
                    idRotulo="cms-conteudo-rotulo"
                  />
                )}
              />
              {errors.conteudo && (
                <p className="text-sm text-destructive">
                  {errors.conteudo.message ?? 'O conteúdo não está num formato aceito.'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-5">
            <div>
              <h2 className="font-semibold">SEO</h2>
              <p className="text-sm text-muted-foreground">
                Como a página aparece no Google e ao ser compartilhada. Em branco, o título da
                página é usado.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Label htmlFor="cms-titulo-seo">Título SEO</Label>
                <Contador valor={tituloSeo} limite={LIMITES_CMS.tituloSeo} />
              </div>
              <Input
                id="cms-titulo-seo"
                disabled={campoDesabilitado}
                aria-invalid={Boolean(errors.tituloSeo)}
                {...register('tituloSeo')}
              />
              {errors.tituloSeo && (
                <p className="text-sm text-destructive">{errors.tituloSeo.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Label htmlFor="cms-descricao-seo">Descrição SEO</Label>
                <Contador valor={descricaoSeo} limite={LIMITES_CMS.descricaoSeo} />
              </div>
              <Textarea
                id="cms-descricao-seo"
                rows={3}
                disabled={campoDesabilitado}
                aria-invalid={Boolean(errors.descricaoSeo)}
                {...register('descricaoSeo')}
              />
              {errors.descricaoSeo && (
                <p className="text-sm text-destructive">{errors.descricaoSeo.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Publicação</h2>
              <Badge variant={VARIANTE_STATUS_PAGINA[status]}>{ROTULO_STATUS_PAGINA[status]}</Badge>
            </div>

            {pagina && (
              <dl className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Atualizada</dt>
                  <dd>{formatarDataCms(pagina.updatedAt)}</dd>
                </div>
                {pagina.publicadaEm && (
                  <div className="flex justify-between gap-2">
                    <dt>Publicada pela 1ª vez</dt>
                    <dd>{formatarDataCms(pagina.publicadaEm)}</dd>
                  </div>
                )}
              </dl>
            )}

            {status === 'publicada' && (
              <Button asChild variant="link" className="h-auto px-0">
                <Link href={`/${pagina!.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Ver no site
                </Link>
              </Button>
            )}

            {!arquivada && (
              <div className="flex flex-col gap-2">
                {status === 'rascunho' ? (
                  <>
                    <Button type="button" disabled={pendente} onClick={() => void salvar(true)()}>
                      <Send className="size-4" />
                      {pagina ? 'Salvar e publicar' : 'Criar e publicar'}
                    </Button>
                    <Button type="submit" variant="outline" disabled={pendente}>
                      {pagina ? 'Salvar rascunho' : 'Criar como rascunho'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="submit" disabled={pendente || !isDirty}>
                      Salvar e atualizar no site
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pendente || isDirty}
                      onClick={despublicar}
                    >
                      <Undo2 className="size-4" />
                      Despublicar
                    </Button>
                  </>
                )}
                {pagina && (
                  <BotaoArquivarPaginaCms
                    paginaId={pagina.id}
                    titulo={pagina.titulo}
                    desabilitado={pendente || isDirty}
                  />
                )}
                {pagina && isDirty && (
                  <p className="text-xs text-muted-foreground">
                    Há alterações não salvas. Salve antes de despublicar ou arquivar.
                  </p>
                )}
              </div>
            )}

            {slug && !errors.slug && (
              <p className="break-all text-xs text-muted-foreground">Endereço: /{slug}</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </form>
  )
}
