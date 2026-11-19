'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { salvarCategoriaConhecimento } from '../../actions/categorias'
import { LIMITES_CATEGORIA } from '../../constants/limites'
import { categoriaSchema } from '../../schemas/artigo'

export type CategoriaGestao = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  areaBusca: string | null
  chamadaConversao: string | null
  ativa: boolean
  ordem: number
  publicados: number
}

type Entrada = z.input<typeof categoriaSchema>
type Saida = z.output<typeof categoriaSchema>

const ROTULO_AREA: Record<string, string> = { contabilidade: 'Contabilidade', advocacia: 'Advocacia' }

/** Categorias da Central: criar, editar, ativar/desativar e ordenar. Sem exclusão. */
export function GestaoCategorias({ categorias }: { categorias: CategoriaGestao[] }) {
  const [editando, setEditando] = useState<CategoriaGestao | 'nova' | null>(null)
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Categoria desativada sai dos filtros públicos e do formulário; artigos que já a usam continuam no ar.
        </p>
        <Button type="button" className="gap-2" onClick={() => setEditando('nova')}>
          <Plus className="size-4" aria-hidden /> Nova categoria
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {categorias.map((categoria) => (
          <li key={categoria.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {categoria.ordem}. {categoria.nome}{' '}
                {!categoria.ativa ? <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">desativada</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                /{categoria.slug} · busca: {categoria.areaBusca ? ROTULO_AREA[categoria.areaBusca] : 'sem filtro'} · {categoria.publicados} publicado(s)
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setEditando(categoria)}>
              <Pencil className="size-3.5" aria-hidden /> Editar
            </Button>
          </li>
        ))}
      </ul>
      {editando ? (
        <FormularioCategoria
          key={editando === 'nova' ? 'nova' : editando.id}
          categoria={editando === 'nova' ? null : editando}
          aoFechar={() => setEditando(null)}
        />
      ) : null}
    </section>
  )
}

function FormularioCategoria({ categoria, aoFechar }: { categoria: CategoriaGestao | null; aoFechar: () => void }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: {
      nome: categoria?.nome ?? '',
      descricao: categoria?.descricao ?? null,
      areaBusca: (categoria?.areaBusca as Saida['areaBusca']) ?? null,
      chamadaConversao: categoria?.chamadaConversao ?? null,
      ativa: categoria?.ativa ?? true,
      ordem: categoria?.ordem ?? 0,
    },
  })

  const enviar = handleSubmit((dados) =>
    iniciar(async () => {
      const resposta = await salvarCategoriaConhecimento({ categoriaId: categoria?.id ?? null, dados })
      if (!resposta.sucesso) {
        toast.error(resposta.mensagem)
        return
      }
      toast.success(resposta.mensagem)
      aoFechar()
      router.refresh()
    }),
  )

  return (
    <ModalResponsivo
      aberto
      onFechar={aoFechar}
      titulo={categoria ? 'Editar categoria' : 'Nova categoria'}
      largura="lg"
      rodape={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void enviar()} disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(evento) => { evento.preventDefault(); void enviar() }}>
        <div className="space-y-1.5">
          <Label htmlFor="categoria-nome">Nome</Label>
          <Input id="categoria-nome" maxLength={LIMITES_CATEGORIA.nome} {...register('nome')} aria-invalid={Boolean(errors.nome)} />
          {errors.nome ? <p className="text-sm text-destructive">{errors.nome.message}</p> : null}
          {categoria ? <p className="text-xs text-muted-foreground">Endereço do filtro: ?categoria={categoria.slug} (não muda)</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria-descricao">Descrição</Label>
          <Textarea id="categoria-descricao" rows={2} maxLength={LIMITES_CATEGORIA.descricao} {...register('descricao')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="categoria-area">Busca de profissionais</Label>
            <select
              id="categoria-area"
              {...register('areaBusca', { setValueAs: (valor) => (valor ? valor : null) })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sem filtro</option>
              <option value="contabilidade">Contabilidade</option>
              <option value="advocacia">Advocacia</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoria-ordem">Ordem</Label>
            <Input id="categoria-ordem" type="number" min={0} max={999} {...register('ordem')} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="categoria-chamada">Chamada no artigo</Label>
          <Input
            id="categoria-chamada"
            maxLength={LIMITES_CATEGORIA.chamada}
            placeholder="Ex.: Precisa de orientação sobre seu MEI? Encontre um profissional."
            {...register('chamadaConversao')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('ativa')} /> Ativa (aparece nos filtros e no formulário)
        </label>
      </form>
    </ModalResponsivo>
  )
}
