'use client'

import { useState, useTransition, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { AlertTriangle, Archive, Eye, Plus, Save, Send, Trash2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { operarArtigoProfissional, salvarArtigoProfissional } from '../../actions/artigos-autor'
import { operarArtigoInstitucional, salvarArtigoInstitucional } from '../../actions/moderacao'
import { LIMITES_ARTIGO } from '../../constants/limites'
import { montarBaseSlugArtigo } from '../../lib/slug-artigo'
import { CampoCapa } from './campos/CampoCapa'
import { CampoPalavrasChave } from './campos/CampoPalavrasChave'
import { CampoUrlAmigavel } from './campos/CampoUrlAmigavel'
import { SecaoCardsHome } from './campos/SecaoCardsHome'
import { SecaoSeo } from './campos/SecaoSeo'
import { caminhoArtigo, caminhoPreviaArtigo } from '../../constants/rotas'
import { CONTEUDO_ARTIGO_VAZIO, type NoConteudo } from '../../lib/conteudo/schema-conteudo'
import type { RespostaAcao } from '../../lib/respostas'
import { dadosArtigoSchema, type DadosArtigo, type DadosArtigoEntrada } from '../../schemas/artigo'
import type { PainelCardsHomeDoArtigo } from '../../queries/destaques-home'
import type { ArtigoEmEdicao } from '../../queries/privado'
import { HistoricoEditorial } from '../HistoricoEditorial'
import { SituacaoEditorialBadge } from '../SituacaoEditorialBadge'

const EditorArtigo = dynamic(() => import('./EditorArtigo'), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-lg border border-border bg-muted" />,
})

/**
 * Formulário do artigo — mesmo componente para o profissional e para a Gestão
 * (artigo institucional). Validação dupla: Zod aqui e de novo na action.
 *
 * Não existe campo de autor: quem assina é a sessão (profissional) ou, no
 * institucional, a escolha fechada entre "Vincis" e o próprio Gestor.
 */
type Propriedades = {
  modo: 'profissional' | 'institucional'
  artigo: ArtigoEmEdicao | null
  categorias: { id: string; nome: string; ativa: boolean }[]
  /** Profissional: perfil na vitrine (pode criar/enviar). */
  elegivel?: boolean
  /** Institucional: nome do Gestor da sessão (opção de assinatura). */
  nomeGestor?: string
  rotaVoltar: string
  /** Prefixo da tela de edição (`/admin/artigos` ou `/admin/conhecimento/artigos`). */
  prefixoEdicao: string
  /**
   * Cards da Home — só chega preenchido para o Gestor (a query devolve `null`
   * para as demais sessões); profissional não vê a seção.
   */
  cardsHome?: PainelCardsHomeDoArtigo | null
}

/** Bloco visual do formulário: título curto e uma linha de explicação. */
function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <header>
        <h2 className="text-base font-bold text-foreground">{titulo}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
      </header>
      {children}
    </section>
  )
}

function Contador({ valor, limite }: { valor: string | null | undefined; limite: number }) {
  const tamanho = valor?.length ?? 0
  return (
    <span className={tamanho > limite ? 'text-destructive' : 'text-muted-foreground'}>
      {tamanho}/{limite}
    </span>
  )
}

export function FormularioArtigo({ modo, artigo, categorias, elegivel = true, nomeGestor, rotaVoltar, prefixoEdicao, cardsHome }: Propriedades) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [problemas, setProblemas] = useState<string[]>([])
  const [assinatura, setAssinatura] = useState<'vincis' | 'responsavel'>(artigo?.assinatura ?? 'vincis')

  const somenteLeitura = Boolean(artigo && !artigo.pode.editar)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DadosArtigoEntrada, unknown, DadosArtigo>({
    resolver: zodResolver(dadosArtigoSchema),
    defaultValues: artigo
      ? {
          ...artigo.dados,
          // URL que só repete o título é "automática" (`null`): continua
          // acompanhando o título até a primeira publicação.
          slug:
            artigo.dados.slug && artigo.dados.slug !== montarBaseSlugArtigo(artigo.dados.titulo)
              ? artigo.dados.slug
              : null,
        }
      : {
      titulo: '',
      slug: null,
      palavrasChave: [],
      resumo: '',
      categoriaId: null,
      capaUrl: null,
      capaAlt: null,
      conteudo: CONTEUDO_ARTIGO_VAZIO,
      fontes: [],
      tituloSeo: null,
      descricaoSeo: null,
    },
  })
  const fontes = useFieldArray({ control, name: 'fontes' })
  const [titulo, resumo, capaUrl, tituloSeo, descricaoSeo, slugEscolhido] = useWatch({
    control,
    name: ['titulo', 'resumo', 'capaUrl', 'tituloSeo', 'descricaoSeo', 'slug'],
  })

  function tratar(resposta: RespostaAcao<{ artigoId?: string }>, depois?: (id?: string) => void) {
    if (!resposta.sucesso) {
      toast.error(resposta.mensagem)
      setProblemas(resposta.problemas ?? [])
      return
    }
    setProblemas([])
    toast.success(resposta.mensagem)
    depois?.('artigoId' in resposta ? resposta.artigoId : undefined)
  }

  function salvar(intencao: 'rascunho' | 'enviar' | 'publicar') {
    return handleSubmit(
      (dados) =>
        iniciar(async () => {
          const resposta =
            modo === 'profissional'
              ? await salvarArtigoProfissional({ artigoId: artigo?.id ?? null, dados, intencao: intencao === 'publicar' ? 'enviar' : intencao })
              : await salvarArtigoInstitucional({
                  artigoId: artigo?.id ?? null,
                  dados,
                  assinatura,
                  intencao: intencao === 'enviar' ? 'publicar' : intencao,
                })
          tratar(resposta, (id) => {
            if (!artigo && id) router.replace(`${prefixoEdicao}/${encodeURIComponent(id)}`)
            else router.refresh()
          })
        }),
      () => toast.error('Revise os campos destacados.'),
    )()
  }

  function operar(operacao: 'cancelar_envio' | 'descartar_revisao' | 'arquivar') {
    if (!artigo) return
    if (operacao === 'arquivar' && !window.confirm('Arquivar este artigo? Ele sai do ar e deixa de ser editável.')) return
    iniciar(async () => {
      const resposta =
        modo === 'profissional'
          ? await operarArtigoProfissional({ artigoId: artigo.id, operacao })
          : operacao === 'cancelar_envio'
            ? { sucesso: false as const, mensagem: 'Operação indisponível.' }
            : await operarArtigoInstitucional({ artigoId: artigo.id, operacao })
      tratar(resposta, () => router.refresh())
    })
  }

  const desabilitado = pendente || somenteLeitura

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <form className="min-w-0 space-y-6 lg:col-span-8" onSubmit={(evento) => evento.preventDefault()} noValidate>
        {modo === 'profissional' && !elegivel ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p>
              Para criar e enviar artigos, seu perfil público precisa estar completo e visível na busca (com foto ou
              logotipo). <Link href="/admin?pagina=profile" className="font-semibold text-primary underline">Completar meu perfil</Link>
            </p>
          </div>
        ) : null}

        {artigo?.observacaoModeracao ? (
          <div role="alert" className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm">
            <p className="font-semibold text-foreground">Orientação da equipe Vincis</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{artigo.observacaoModeracao}</p>
          </div>
        ) : null}

        {artigo?.pode.motivoBloqueio ? (
          <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">{artigo.pode.motivoBloqueio}</p>
        ) : null}

        {artigo?.revisaoEmAndamento || (artigo && artigo.statusPublicacao === 'publicado' && artigo.pode.editar) ? (
          <p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            Este artigo está publicado. Alterações salvas viram uma <strong>revisão</strong>: o texto aprovado continua no
            ar até a Vincis aprovar a nova versão.
          </p>
        ) : null}

        {problemas.length ? (
          <ul role="alert" className="list-disc space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-4 pl-8 text-sm text-destructive">
            {problemas.map((problema) => (
              <li key={problema}>{problema}</li>
            ))}
          </ul>
        ) : null}

        {/* No topo e fora do fieldset: o Gestor encontra a opção ao abrir o
            artigo (no fim do formulário ficava abaixo do editor de texto), e um
            artigo publicado com revisão em análise — somente leitura — continua
            podendo ocupar um card da Home. */}
        {cardsHome ? <SecaoCardsHome painel={cardsHome} /> : null}

        <fieldset disabled={desabilitado} className="min-w-0 space-y-6">
          <legend className="sr-only">Conteúdo do artigo</legend>

          <Secao titulo="Informações básicas" descricao="Como o artigo é apresentado nos cards e na Central.">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label htmlFor="artigo-titulo">Título</Label>
                <Contador valor={titulo} limite={LIMITES_ARTIGO.titulo.max} />
              </div>
              <Input id="artigo-titulo" {...register('titulo')} aria-invalid={Boolean(errors.titulo)} className="h-11 text-base" />
              <p className="text-xs text-muted-foreground">Claro e específico — é o que o leitor vê primeiro. Mínimo de {LIMITES_ARTIGO.titulo.min} caracteres para enviar.</p>
              {errors.titulo ? <p className="text-sm text-destructive">{errors.titulo.message}</p> : null}
            </div>

            <CampoUrlAmigavel
              titulo={titulo ?? ''}
              artigoId={artigo?.id ?? null}
              slugAtual={artigo?.dados.slug ?? null}
              fixo={Boolean(artigo?.slugFixo)}
              desabilitado={desabilitado}
              aoAlterar={(slug) => setValue('slug', slug, { shouldDirty: true })}
            />
            {errors.slug ? <p className="text-sm text-destructive">{errors.slug.message}</p> : null}

            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label htmlFor="artigo-resumo">Resumo</Label>
                <Contador valor={resumo} limite={LIMITES_ARTIGO.resumo.max} />
              </div>
              <Textarea id="artigo-resumo" rows={3} {...register('resumo')} aria-invalid={Boolean(errors.resumo)} />
              <p className="text-xs text-muted-foreground">Duas ou três frases sobre o que o leitor vai aprender. Aparece nos cards e vira a meta descrição automática. Mínimo de {LIMITES_ARTIGO.resumo.min} caracteres para enviar.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="artigo-categoria">Categoria</Label>
              <select
                id="artigo-categoria"
                {...register('categoriaId', { setValueAs: (valor) => (valor ? valor : null) })}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground"
              >
                <option value="">Escolha uma categoria</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                    {categoria.ativa ? '' : ' (desativada)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Define o filtro da Central e o botão “Encontrar um profissional” do artigo.</p>
            </div>
          </Secao>

          <Secao titulo="Imagem de capa" descricao="Aparece no topo do artigo, nos cards e no compartilhamento.">
            <CampoCapa
              capaUrl={capaUrl}
              aoAlterar={(url) => {
                setValue('capaUrl', url, { shouldDirty: true })
                if (!url) setValue('capaAlt', null, { shouldDirty: true })
              }}
              registrarAlt={register('capaAlt')}
              erroAlt={errors.capaAlt?.message}
              desabilitado={desabilitado}
            />
          </Secao>

          <Secao titulo="Texto do artigo" descricao={`Títulos, listas, links, tabelas e imagens. Mínimo de ${LIMITES_ARTIGO.corpoMinimoEnvio} caracteres para enviar.`}>
            <span id="artigo-texto-rotulo" className="sr-only">Texto do artigo</span>
            <Controller
              control={control}
              name="conteudo"
              render={({ field }) => (
                <EditorArtigo valor={field.value as NoConteudo} aoAlterar={field.onChange} desabilitado={desabilitado} idRotulo="artigo-texto-rotulo" />
              )}
            />
          </Secao>

          <Secao titulo="Fontes e palavras-chave" descricao="Referências dão credibilidade; palavras-chave ajudam o leitor a encontrar o artigo na Central.">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Fontes e referências</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={desabilitado || fontes.fields.length >= LIMITES_ARTIGO.fontes}
                  onClick={() => fontes.append({ titulo: '', url: null })}
                >
                  <Plus className="size-4" aria-hidden /> Adicionar fonte
                </Button>
              </div>
              {fontes.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cite leis, normas e publicações usadas no texto.</p>
              ) : null}
              {fontes.fields.map((campo, indice) => (
                <div key={campo.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={`fonte-${indice}-titulo`} className="text-xs">Referência</Label>
                    <Input id={`fonte-${indice}-titulo`} {...register(`fontes.${indice}.titulo`)} placeholder="Ex.: Lei Complementar 123/2006" />
                    {errors.fontes?.[indice]?.titulo ? <p className="text-xs text-destructive">{errors.fontes[indice]?.titulo?.message}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`fonte-${indice}-url`} className="text-xs">Endereço (opcional)</Label>
                    <Input id={`fonte-${indice}-url`} inputMode="url" {...register(`fontes.${indice}.url`)} placeholder="https://" />
                    {errors.fontes?.[indice]?.url ? <p className="text-xs text-destructive">{errors.fontes[indice]?.url?.message}</p> : null}
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="self-end" aria-label="Remover referência" onClick={() => fontes.remove(indice)}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>

            <Controller
              control={control}
              name="palavrasChave"
              render={({ field }) => (
                <CampoPalavrasChave
                  valor={(field.value as string[] | undefined) ?? []}
                  aoAlterar={field.onChange}
                  desabilitado={desabilitado}
                  erro={errors.palavrasChave?.message}
                />
              )}
            />
          </Secao>

          <Secao titulo="SEO — como o artigo aparece no Google" descricao="Opcional. Campos vazios usam a versão automática gerada do título e do resumo.">
            <SecaoSeo
              titulo={titulo ?? ''}
              resumo={resumo ?? ''}
              slug={artigo?.slugFixo ? (artigo.dados.slug ?? '') : (slugEscolhido ?? montarBaseSlugArtigo(titulo || 'artigo'))}
              tituloSeo={tituloSeo}
              descricaoSeo={descricaoSeo}
              registrarTitulo={register('tituloSeo')}
              registrarDescricao={register('descricaoSeo')}
              aplicar={(campo, valor) => setValue(campo, valor, { shouldDirty: true })}
              desabilitado={desabilitado}
            />
          </Secao>

          {modo === 'institucional' && !artigo ? (
            <Secao titulo="Assinatura" descricao="Como a autoria aparece no artigo institucional.">
              <fieldset className="space-y-2">
                <legend className="sr-only">Assinatura</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="assinatura" checked={assinatura === 'vincis'} onChange={() => setAssinatura('vincis')} />
                  Vincis
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="assinatura" checked={assinatura === 'responsavel'} onChange={() => setAssinatura('responsavel')} />
                  Vincis, com {nomeGestor ?? 'você'} como responsável editorial
                </label>
              </fieldset>
            </Secao>
          ) : null}
        </fieldset>

        {/* Ações — fixas no rodapé no celular. */}
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="outline" className="gap-2" disabled={desabilitado || (modo === 'profissional' && !artigo && !elegivel)} onClick={() => void salvar('rascunho')}>
            <Save className="size-4" aria-hidden /> Salvar rascunho
          </Button>
          {modo === 'profissional' ? (
            <Button type="button" className="gap-2" disabled={desabilitado || !elegivel} onClick={() => void salvar('enviar')}>
              <Send className="size-4" aria-hidden /> Enviar para aprovação
            </Button>
          ) : (
            <Button type="button" className="gap-2" disabled={desabilitado} onClick={() => void salvar('publicar')}>
              <Send className="size-4" aria-hidden /> Salvar e publicar
            </Button>
          )}
          {artigo ? (
            <Button asChild variant="ghost" className="gap-2">
              <Link href={caminhoPreviaArtigo(artigo.id)} target="_blank" rel="noopener">
                <Eye className="size-4" aria-hidden /> Pré-visualizar
              </Link>
            </Button>
          ) : null}
        </div>
      </form>

      <aside className="min-w-0 space-y-4 lg:col-span-4">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Situação</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {artigo ? <SituacaoEditorialBadge situacao={artigo.situacao} /> : <SituacaoEditorialBadge situacao="rascunho" />}
              {artigo?.revisaoEmAndamento ? <span className="text-xs text-muted-foreground">revisão em andamento</span> : null}
            </div>
            {artigo?.statusPublicacao === 'publicado' ? (
              <Link href={caminhoArtigo(artigo.slug)} target="_blank" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
                Ver artigo publicado
              </Link>
            ) : null}
          </div>

          {artigo ? (
            <div className="flex flex-col gap-2">
              {artigo.pode.cancelarEnvio && modo === 'profissional' ? (
                <Button type="button" variant="outline" size="sm" className="justify-start gap-2" disabled={pendente} onClick={() => operar('cancelar_envio')}>
                  <Undo2 className="size-4" aria-hidden /> Cancelar envio e voltar a editar
                </Button>
              ) : null}
              {artigo.pode.descartarRevisao ? (
                <Button type="button" variant="outline" size="sm" className="justify-start gap-2" disabled={pendente} onClick={() => operar('descartar_revisao')}>
                  <X className="size-4" aria-hidden /> Descartar revisão
                </Button>
              ) : null}
              {artigo.pode.arquivar ? (
                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" disabled={pendente} onClick={() => operar('arquivar')}>
                  <Archive className="size-4" aria-hidden /> Arquivar artigo
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {modo === 'profissional'
                ? 'Salve o rascunho quando quiser. Ao enviar, a equipe Vincis revisa o artigo antes de publicá-lo.'
                : 'Artigos institucionais são publicados pela própria Gestão.'}
            </p>
          )}

          {artigo ? (
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Histórico</p>
              <HistoricoEditorial itens={artigo.historico} mostrarExecutor={modo === 'institucional'} />
            </div>
          ) : null}

          <Link href={rotaVoltar} className="inline-block text-sm font-semibold text-primary hover:underline">
            ← Voltar
          </Link>
        </div>
      </aside>
    </div>
  )
}
