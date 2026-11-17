'use client'

import { useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CardServicoHome } from '@/features/home/components/CardServicoHome'
import { criarCardHomeCms, editarCardHomeCms } from '../../actions/cards-home'
import { ROTULO_STATUS_PAGINA } from '../../constants'
import {
  ESTILOS_CARD_HOME,
  EXEMPLO_ESTILO_CARD_HOME,
  LIMITES_CARD_HOME,
  ROTAS_INTERNAS_CARD_HOME,
  ROTULO_ESTILO_CARD_HOME,
} from '../../integracao/cards-home/constantes'
import { schemasCardsHome } from '../../integracao/cards-home/schemas'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import type { CardHomeGestaoDTO, PaginaAssociavelDTO } from '../../types'

type Entrada = z.input<typeof schemasCardsHome.criarCard>
type Saida = z.output<typeof schemasCardsHome.criarCard>

const CAMPOS = ['selo', 'titulo', 'descricao', 'textoBotao', 'estilo', 'paginaId', 'rota'] as const
type Campo = (typeof CAMPOS)[number]

const CLASSE_SELECT =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** `<select>` vazio chega como "" — para o schema, "sem valor" é `null`. */
const vazioViraNulo = (valor: unknown) => (valor === '' || valor === undefined ? null : valor)

/**
 * Criar ou editar um Card da Home, com pré-visualização ao vivo.
 *
 * A pré-visualização usa o mesmo componente da Home, nas duas variantes: o
 * card vira "destaque" quando é o primeiro da ordem e "menor" nas outras
 * posições. Nada vai ao site até salvar — e um card novo só aparece se
 * "Exibir na Home" estiver marcado.
 *
 * Destino: uma página publicada do CMS ou uma rota da lista fechada. O servidor
 * confere de novo (e trava a página na gravação).
 */
export function FormularioCardHomeCms({
  aoFechar,
  aoSalvar,
  card,
  paginas,
}: {
  aoFechar: () => void
  aoSalvar: () => void
  card?: CardHomeGestaoDTO
  paginas: PaginaAssociavelDTO[]
}) {
  const [pendente, iniciar] = useTransition()

  // Só páginas publicadas podem ser escolhidas; a página atual de um card que
  // saiu do ar continua na lista (marcada) para o Gestor ver o que está gravado.
  const opcoesPagina = paginas.filter(
    (pagina) => pagina.status === 'publicada' || pagina.id === card?.paginaId,
  )
  const paginaAtualForaDaLista =
    card?.paginaId && !paginas.some((pagina) => pagina.id === card.paginaId)
      ? { id: card.paginaId, titulo: card.paginaTitulo ?? 'Página', status: card.paginaStatus }
      : null

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(schemasCardsHome.criarCard),
    defaultValues: {
      selo: card?.selo ?? '',
      titulo: card?.titulo ?? '',
      descricao: card?.descricao ?? '',
      textoBotao: card?.textoBotao ?? '',
      estilo: card?.estilo ?? 'destaque',
      destinoTipo: card?.destinoTipo ?? 'rota',
      paginaId: card?.paginaId ?? null,
      rota: card?.rota ?? null,
      ativo: card?.ativo ?? false,
    },
  })

  const valores = useWatch({ control })
  const destinoTipo = valores.destinoTipo ?? 'rota'

  const enviar = handleSubmit((dados) =>
    iniciar(async () => {
      const resultado = await chamarAcaoCms(() =>
        card ? editarCardHomeCms({ cardId: card.id, ...dados }) : criarCardHomeCms(dados),
      )
      if (!resultado.sucesso) {
        if (resultado.campo && (CAMPOS as readonly string[]).includes(resultado.campo))
          setError(resultado.campo as Campo, { message: resultado.mensagem })
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      aoSalvar()
    }),
  )

  const previa = {
    selo: valores.selo?.trim() || null,
    titulo: valores.titulo?.trim() || 'Título do card',
    descricao: valores.descricao?.trim() || 'Descrição do card.',
    textoBotao: valores.textoBotao?.trim() || 'Texto do botão',
    estilo: valores.estilo ?? 'destaque',
  }

  const erro = (campo: Campo) =>
    errors[campo] ? (
      <p id={`cms-card-${campo}-erro`} className="text-sm text-destructive">
        {errors[campo]?.message}
      </p>
    ) : null

  return (
    <ModalResponsivo
      aberto
      onFechar={() => !pendente && aoFechar()}
      titulo={card ? 'Editar card da Home' : 'Novo card da Home'}
      descricao="Selo, textos, estilo e destino. O card inteiro leva ao destino escolhido."
      largura="3xl"
      rodape={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pendente} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="cms-formulario-card-home" disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar card'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <form id="cms-formulario-card-home" noValidate onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cms-card-selo">Selo (opcional)</Label>
            <Input
              id="cms-card-selo"
              placeholder="Mais popular"
              maxLength={LIMITES_CARD_HOME.selo}
              aria-invalid={Boolean(errors.selo)}
              {...register('selo')}
            />
            {erro('selo')}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cms-card-botao">Texto do botão</Label>
            <Input
              id="cms-card-botao"
              placeholder="Conhecer planos"
              maxLength={LIMITES_CARD_HOME.textoBotao}
              aria-invalid={Boolean(errors.textoBotao)}
              {...register('textoBotao')}
            />
            {erro('textoBotao')}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cms-card-titulo">Título</Label>
            <Textarea
              id="cms-card-titulo"
              rows={2}
              placeholder={'Contabilidade\n100% digital'}
              maxLength={LIMITES_CARD_HOME.titulo}
              aria-invalid={Boolean(errors.titulo)}
              aria-describedby="cms-card-titulo-ajuda"
              {...register('titulo')}
            />
            <p id="cms-card-titulo-ajuda" className="text-sm text-muted-foreground">
              Enter quebra a linha, como no card original (até {LIMITES_CARD_HOME.linhasTitulo} linhas).
            </p>
            {erro('titulo')}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cms-card-descricao">Descrição</Label>
            <Textarea
              id="cms-card-descricao"
              rows={3}
              maxLength={LIMITES_CARD_HOME.descricao}
              aria-invalid={Boolean(errors.descricao)}
              {...register('descricao')}
            />
            {erro('descricao')}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cms-card-estilo">Estilo visual</Label>
            <select id="cms-card-estilo" className={CLASSE_SELECT} {...register('estilo')}>
              {ESTILOS_CARD_HOME.map((estilo) => (
                <option key={estilo} value={estilo}>
                  {ROTULO_ESTILO_CARD_HOME[estilo]} (como “{EXEMPLO_ESTILO_CARD_HOME[estilo]}”)
                </option>
              ))}
            </select>
            {erro('estilo')}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Destino</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              <label className="alvo-toque-h flex items-center gap-2 text-sm">
                <input type="radio" value="rota" className="size-4 accent-primary" {...register('destinoTipo')} />
                Rota do sistema
              </label>
              <label className="alvo-toque-h flex items-center gap-2 text-sm">
                <input type="radio" value="pagina" className="size-4 accent-primary" {...register('destinoTipo')} />
                Página do CMS
              </label>
            </div>
          </fieldset>

          <div className="space-y-1.5 sm:col-span-2">
            {destinoTipo === 'rota' ? (
              <>
                <Label htmlFor="cms-card-rota">Rota de destino</Label>
                <select
                  id="cms-card-rota"
                  className={CLASSE_SELECT}
                  aria-invalid={Boolean(errors.rota)}
                  {...register('rota', { setValueAs: vazioViraNulo })}
                >
                  <option value="">Escolha uma rota…</option>
                  {ROTAS_INTERNAS_CARD_HOME.map(({ rota, rotulo }) => (
                    <option key={rota} value={rota}>
                      {rotulo} ({rota})
                    </option>
                  ))}
                </select>
                {erro('rota')}
              </>
            ) : (
              <>
                <Label htmlFor="cms-card-pagina">Página publicada</Label>
                <select
                  id="cms-card-pagina"
                  className={CLASSE_SELECT}
                  aria-invalid={Boolean(errors.paginaId)}
                  {...register('paginaId', { setValueAs: vazioViraNulo })}
                >
                  <option value="">Escolha uma página…</option>
                  {paginaAtualForaDaLista && (
                    <option value={paginaAtualForaDaLista.id}>
                      {paginaAtualForaDaLista.titulo} — fora do site
                    </option>
                  )}
                  {opcoesPagina.map((pagina) => (
                    <option key={pagina.id} value={pagina.id}>
                      {pagina.titulo} (/{pagina.slug})
                      {pagina.status !== 'publicada' ? ` — ${ROTULO_STATUS_PAGINA[pagina.status]}, fora do site` : ''}
                    </option>
                  ))}
                </select>
                {opcoesPagina.length === 0 && !paginaAtualForaDaLista && (
                  <p className="text-sm text-muted-foreground">Nenhuma página publicada no CMS ainda.</p>
                )}
                {erro('paginaId')}
              </>
            )}
          </div>

          <label className="alvo-toque-h flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-primary" {...register('ativo')} />
            Exibir na Home
          </label>
        </form>

        <section aria-labelledby="cms-card-previa" className="space-y-3">
          <h3 id="cms-card-previa" className="text-sm font-semibold">
            Pré-visualização
          </h3>
          <div className="grid gap-4 rounded-xl border border-dashed border-border bg-background p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Como destaque (1º da ordem)</p>
              <CardServicoHome card={previa} variante="destaque" />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Como card menor (demais posições)</p>
              <CardServicoHome card={previa} variante="menor" />
            </div>
          </div>
        </section>
      </div>
    </ModalResponsivo>
  )
}
