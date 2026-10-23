'use client'

import { useState, useTransition } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarGrupoNavegacaoCms, editarGrupoNavegacaoCms } from '../../actions/navegacao'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import { schemasCms } from '../../integracao/schemas'
import { gerarIdentificador } from '../../nucleo/lib/identificador'
import type { LocalNavegacao } from '../../nucleo/types'
import type { GrupoNavegacaoGestaoDTO } from '../../types'

type Entrada = z.input<typeof schemasCms.criarGrupo>
type Saida = z.output<typeof schemasCms.criarGrupo>

/**
 * Criar ou editar um grupo do rodapé (uma coluna de links).
 *
 * O local vem da aba (rodapé ou cabeçalho) e fica fixo depois de criado.
 * Ativar e desativar ficam no interruptor da lista, para não esconder um gesto
 * de um clique atrás de um formulário.
 */
export function FormularioGrupoCms({
  aberto,
  aoFechar,
  aoSalvar,
  grupo,
  local,
}: {
  aberto: boolean
  aoFechar: () => void
  aoSalvar: () => void
  grupo?: GrupoNavegacaoGestaoDTO
  /** Onde o grupo novo nasce. Fixado na criação. */
  local: LocalNavegacao
}) {
  const [pendente, iniciar] = useTransition()
  const [identificadorManual, setIdentificadorManual] = useState(Boolean(grupo))
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Entrada, unknown, Saida>({
    resolver: zodResolver(schemasCms.criarGrupo),
    defaultValues: {
      nome: grupo?.nome ?? '',
      tituloPublico: grupo?.tituloPublico ?? '',
      identificador: grupo?.identificador ?? '',
      local: grupo?.local ?? local,
      ativo: grupo?.ativo ?? false,
    },
  })

  const enviar = handleSubmit((dados) =>
    iniciar(async () => {
      const resultado = await chamarAcaoCms(() =>
        grupo
          ? editarGrupoNavegacaoCms({ grupoId: grupo.id, ...dados })
          : criarGrupoNavegacaoCms(dados),
      )
      if (!resultado.sucesso) {
        if (resultado.campo === 'identificador')
          setError('identificador', { message: resultado.mensagem })
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      aoSalvar()
    }),
  )

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={() => !pendente && aoFechar()}
      titulo={grupo ? 'Editar grupo' : local === 'cabecalho' ? 'Novo grupo do cabeçalho' : 'Novo grupo do rodapé'}
      descricao={
        local === 'cabecalho'
          ? 'Os itens dos grupos ativos do cabeçalho formam o menu do site, na ordem dos grupos.'
          : 'Cada grupo é uma coluna de links no rodapé do site.'
      }
      largura="md"
      rodape={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={pendente} onClick={aoFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="cms-formulario-grupo" disabled={pendente}>
            {pendente ? 'Salvando…' : 'Salvar grupo'}
          </Button>
        </div>
      }
    >
      <form id="cms-formulario-grupo" noValidate onSubmit={enviar} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cms-grupo-titulo">Título no site</Label>
          <Input
            id="cms-grupo-titulo"
            placeholder="Institucional"
            aria-invalid={Boolean(errors.tituloPublico)}
            {...register('tituloPublico', {
              onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
                if (!identificadorManual)
                  setValue('identificador', gerarIdentificador(evento.target.value))
              },
            })}
          />
          {errors.tituloPublico && (
            <p className="text-sm text-destructive">{errors.tituloPublico.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cms-grupo-nome">Nome interno</Label>
          <Input
            id="cms-grupo-nome"
            placeholder="Rodapé — institucional"
            aria-invalid={Boolean(errors.nome)}
            {...register('nome')}
          />
          <p className="text-sm text-muted-foreground">Só aparece aqui na Gestão.</p>
          {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cms-grupo-identificador">Identificador</Label>
          <Input
            id="cms-grupo-identificador"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(errors.identificador)}
            {...register('identificador', { onChange: () => setIdentificadorManual(true) })}
          />
          {errors.identificador && (
            <p className="text-sm text-destructive">{errors.identificador.message}</p>
          )}
        </div>
        {!grupo && (
          <label className="alvo-toque-h flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...register('ativo')} />
            Já exibir no site
          </label>
        )}
      </form>
    </ModalResponsivo>
  )
}
