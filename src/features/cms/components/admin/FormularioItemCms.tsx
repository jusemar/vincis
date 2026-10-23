'use client'

import { useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  adicionarItemNavegacaoCms,
  editarItemNavegacaoCms,
  moverItemNavegacaoCms,
} from '../../actions/navegacao'
import { ROTULO_STATUS_PAGINA } from '../../constants'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import { LIMITES_CMS } from '../../nucleo/schemas/constantes'
import type { ItemNavegacaoGestaoDTO, PaginaAssociavelDTO } from '../../types'

/**
 * Criar ou editar um item de navegação.
 *
 * - **link**: escolhe a página (as oferecidas já vêm filtradas pela regra do
 *   núcleo: sem arquivadas e sem as que já estão no grupo); texto opcional.
 * - **agrupador** (só no cabeçalho): sem página, só abre submenu; nome obrigatório.
 *
 * No cabeçalho, um link pode morar no menu principal ou no submenu de um
 * agrupador. O servidor confere de novo tudo — inclusive as regras de árvore.
 */
export type ModoItem = 'link' | 'agrupador'

const SEM_PAI = ''

const esquema = z.object({
  paginaId: z.string(),
  paiId: z.string(),
  texto: z
    .string()
    .trim()
    .max(LIMITES_CMS.textoItem, `Use no máximo ${LIMITES_CMS.textoItem} caracteres.`),
})
type Dados = z.infer<typeof esquema>

export function FormularioItemCms({
  aberto,
  aoFechar,
  aoSalvar,
  grupoId,
  modo,
  item,
  paginasDisponiveis,
  agrupadores,
  paiInicial = null,
}: {
  aberto: boolean
  aoFechar: () => void
  aoSalvar: () => void
  grupoId: string
  modo: ModoItem
  item?: ItemNavegacaoGestaoDTO
  paginasDisponiveis: PaginaAssociavelDTO[]
  /** Agrupadores do grupo — vazio fora do cabeçalho, e aí não há escolha de pai. */
  agrupadores: ItemNavegacaoGestaoDTO[]
  paiInicial?: string | null
}) {
  const [pendente, iniciar] = useTransition()
  const agrupador = modo === 'agrupador'
  const podeEscolherPai = !agrupador && agrupadores.length > 0

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<Dados>({
    resolver: zodResolver(
      esquema.superRefine((dados, contexto) => {
        if (!item && !agrupador && !dados.paginaId)
          contexto.addIssue({ code: 'custom', path: ['paginaId'], message: 'Escolha a página.' })
        if (agrupador && !dados.texto)
          contexto.addIssue({ code: 'custom', path: ['texto'], message: 'Dê um nome ao agrupador.' })
      }),
    ),
    defaultValues: {
      paginaId: item?.paginaId ?? '',
      paiId: item?.paiId ?? paiInicial ?? SEM_PAI,
      texto: item?.texto ?? '',
    },
  })
  const paginaEscolhida = useWatch({ control, name: 'paginaId' })

  const enviar = handleSubmit((dados) =>
    iniciar(async () => {
      const texto = dados.texto || null
      const paiId = podeEscolherPai ? dados.paiId || null : null

      if (!item) {
        const criado = await chamarAcaoCms(() =>
          adicionarItemNavegacaoCms({
            grupoId,
            paginaId: agrupador ? null : dados.paginaId,
            paiId,
            texto,
          }),
        )
        if (!criado.sucesso) {
          if (criado.campo === 'texto') setError('texto', { message: criado.mensagem })
          toast.error(criado.mensagem)
          return
        }
        toast.success(criado.mensagem)
        aoSalvar()
        return
      }

      const editado = await chamarAcaoCms(() =>
        editarItemNavegacaoCms({ itemId: item.id, texto, ativo: item.ativo }),
      )
      if (!editado.sucesso) {
        if (editado.campo === 'texto') setError('texto', { message: editado.mensagem })
        toast.error(editado.mensagem)
        return
      }
      if (podeEscolherPai && paiId !== item.paiId) {
        const movido = await chamarAcaoCms(() => moverItemNavegacaoCms({ itemId: item.id, paiId }))
        if (!movido.sucesso) {
          toast.error(movido.mensagem)
          return
        }
      }
      toast.success('Item salvo.')
      aoSalvar()
    }),
  )

  const semPaginas = !item && !agrupador && paginasDisponiveis.length === 0
  const tituloPagina =
    item?.paginaTitulo ??
    paginasDisponiveis.find(({ id }) => id === paginaEscolhida)?.titulo ??
    'Em branco usa o título da página'

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={() => !pendente && aoFechar()}
      titulo={
        item
          ? agrupador
            ? 'Editar agrupador'
            : 'Editar link'
          : agrupador
            ? 'Novo agrupador'
            : 'Adicionar página'
      }
      descricao={
        agrupador
          ? 'Agrupador não leva a uma página: ele abre um submenu com os links que você colocar dentro dele.'
          : undefined
      }
      largura="md"
      rodape={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pendente} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="cms-formulario-item" disabled={pendente || semPaginas}>
            {pendente ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <form id="cms-formulario-item" noValidate onSubmit={enviar} className="space-y-4">
        {!agrupador &&
          (item ? (
            <p className="text-sm text-muted-foreground">
              Página: <span className="font-medium text-foreground">{item.paginaTitulo}</span> (/
              {item.paginaSlug})
            </p>
          ) : semPaginas ? (
            <p className="text-sm text-muted-foreground">
              Não há página disponível: todas já estão neste grupo ou foram arquivadas. Crie uma
              página primeiro.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cms-item-pagina">Página</Label>
              <select
                id="cms-item-pagina"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-invalid={Boolean(errors.paginaId)}
                {...register('paginaId')}
              >
                <option value="">Escolha…</option>
                {paginasDisponiveis.map((pagina) => (
                  <option key={pagina.id} value={pagina.id}>
                    {pagina.titulo} — /{pagina.slug}
                    {pagina.status === 'rascunho' ? ` (${ROTULO_STATUS_PAGINA.rascunho})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Página em rascunho só aparece no site depois de publicada.
              </p>
              {errors.paginaId && (
                <p className="text-sm text-destructive">{errors.paginaId.message}</p>
              )}
            </div>
          ))}

        {!semPaginas && (
          <div className="space-y-1.5">
            <Label htmlFor="cms-item-texto">{agrupador ? 'Nome do agrupador' : 'Texto do link'}</Label>
            <Input
              id="cms-item-texto"
              placeholder={agrupador ? 'Serviços' : tituloPagina}
              aria-invalid={Boolean(errors.texto)}
              {...register('texto')}
            />
            {errors.texto && <p className="text-sm text-destructive">{errors.texto.message}</p>}
          </div>
        )}

        {podeEscolherPai && !semPaginas && (
          <div className="space-y-1.5">
            <Label htmlFor="cms-item-pai">Posição no menu</Label>
            <select
              id="cms-item-pai"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register('paiId')}
            >
              <option value={SEM_PAI}>Menu principal</option>
              {agrupadores.map((pai) => (
                <option key={pai.id} value={pai.id}>
                  Dentro de “{pai.texto}”
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </ModalResponsivo>
  )
}
