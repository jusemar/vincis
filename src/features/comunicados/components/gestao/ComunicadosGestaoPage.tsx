'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Megaphone, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  arquivarComunicado,
  atualizarComunicado,
  criarComunicado,
  despublicarComunicado,
  publicarComunicado,
} from '../../actions/comunicados'
import {
  AUDIENCIAS_COMUNICADO,
  ROTULO_AUDIENCIA_COMUNICADO,
  ROTULO_STATUS_COMUNICADO,
  ROTULO_TIPO_COMUNICADO,
  TIPOS_COMUNICADO,
  VISUAL_TIPO_COMUNICADO,
  type AudienciaComunicado,
  type TipoComunicado,
} from '../../constants/comunicado'
import type { ComunicadoGestaoDTO } from '../../types/comunicado'

type Formulario = {
  comunicadoId: string | null
  tipo: TipoComunicado
  titulo: string
  resumo: string
  audiencia: AudienciaComunicado
  publicadoEm: string
}

const FORMULARIO_VAZIO: Formulario = {
  comunicadoId: null,
  tipo: 'novidade',
  titulo: '',
  resumo: '',
  audiencia: 'todos',
  publicadoEm: '',
}

/**
 * Data ISO → valor do `<input type="datetime-local">`.
 *
 * Montada a partir das partes locais: `toISOString()` devolveria UTC e o campo
 * abriria com hora errada no fuso do Brasil — três horas de diferença num aviso
 * de manutenção é a diferença entre avisar e não avisar.
 */
function paraCampoDataHora(iso: string | null) {
  if (!iso) return ''
  const data = new Date(iso)
  const doisDigitos = (valor: number) => `${valor}`.padStart(2, '0')
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(
    data.getDate(),
  )}T${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
}

const CLASSE_STATUS: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  publicado: 'bg-emerald-500/15 text-emerald-600',
  arquivado: 'bg-amber-500/15 text-amber-600',
}

/**
 * Mesa de trabalho do Gestor da Vincis.
 *
 * Um formulário e uma lista, sem CMS: comunicado é texto curto de mural, não
 * artigo. O que a tela oferece é exatamente o ciclo pedido — escrever, salvar
 * como rascunho, publicar (agora ou com data), despublicar e arquivar.
 */
export function ComunicadosGestaoPage({
  gestorNome,
  comunicados,
}: {
  gestorNome: string
  comunicados: ComunicadoGestaoDTO[]
}) {
  const router = useRouter()
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO)
  const [salvando, iniciarTransicao] = useTransition()

  function alterar<T extends keyof Formulario>(campo: T, valor: Formulario[T]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  function editar(comunicado: ComunicadoGestaoDTO) {
    setFormulario({
      comunicadoId: comunicado.id,
      tipo: comunicado.tipo,
      titulo: comunicado.titulo,
      resumo: comunicado.resumo,
      audiencia: comunicado.audiencia,
      publicadoEm: paraCampoDataHora(comunicado.publicadoEm),
    })
  }

  function salvar(publicarAgora: boolean) {
    const { comunicadoId, ...dados } = formulario
    iniciarTransicao(async () => {
      const resultado = comunicadoId
        ? await atualizarComunicado({ comunicadoId, ...dados })
        : await criarComunicado(dados, publicarAgora)

      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setFormulario(FORMULARIO_VAZIO)
      router.refresh()
    })
  }

  function mudarEstado(
    acao: typeof publicarComunicado,
    comunicadoId: string,
  ) {
    iniciarTransicao(async () => {
      const resultado = await acao({ comunicadoId })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Megaphone className="size-5" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold leading-none">
                Comunicados
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mural institucional da Vincis · {gestorNome}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/gestao">
              <ArrowLeft className="size-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Plus className="size-4 text-primary" />
              {formulario.comunicadoId ? 'Editar comunicado' : 'Novo comunicado'}
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                value={formulario.tipo}
                onChange={(evento) =>
                  alterar('tipo', evento.target.value as TipoComunicado)
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {TIPOS_COMUNICADO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULO_TIPO_COMUNICADO[tipo]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={formulario.titulo}
                maxLength={160}
                onChange={(evento) => alterar('titulo', evento.target.value)}
                placeholder="Novo recurso disponível: gestão de protocolos"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resumo">Texto</Label>
              <Textarea
                id="resumo"
                value={formulario.resumo}
                maxLength={600}
                rows={4}
                onChange={(evento) => alterar('resumo', evento.target.value)}
                placeholder="O que muda para quem usa a plataforma."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audiencia">Audiência</Label>
              <select
                id="audiencia"
                value={formulario.audiencia}
                onChange={(evento) =>
                  alterar('audiencia', evento.target.value as AudienciaComunicado)
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {AUDIENCIAS_COMUNICADO.map((audiencia) => (
                  <option key={audiencia} value={audiencia}>
                    {ROTULO_AUDIENCIA_COMUNICADO[audiencia]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publicadoEm">Data de publicação</Label>
              <Input
                id="publicadoEm"
                type="datetime-local"
                value={formulario.publicadoEm}
                onChange={(evento) => alterar('publicadoEm', evento.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Em branco, publicar usa o horário do clique.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => salvar(false)}
                disabled={salvando}
                variant="outline"
                size="sm"
              >
                {formulario.comunicadoId ? 'Salvar alterações' : 'Salvar rascunho'}
              </Button>
              {!formulario.comunicadoId && (
                <Button onClick={() => salvar(true)} disabled={salvando} size="sm">
                  Publicar agora
                </Button>
              )}
              {formulario.comunicadoId && (
                <Button
                  onClick={() => setFormulario(FORMULARIO_VAZIO)}
                  disabled={salvando}
                  variant="ghost"
                  size="sm"
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {comunicados.length === 0 && (
            <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
              Nenhum comunicado publicado até agora.
            </p>
          )}

          {comunicados.map((comunicado) => (
            <Card key={comunicado.id}>
              <CardContent className="flex flex-wrap items-start gap-4 p-5">
                <div
                  className={cn(
                    'flex size-10 items-center justify-center rounded-xl text-lg',
                    VISUAL_TIPO_COMUNICADO[comunicado.tipo].fundo,
                  )}
                >
                  {VISUAL_TIPO_COMUNICADO[comunicado.tipo].icone}
                </div>

                <div className="min-w-0 flex-1 sm:min-w-[16rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{comunicado.titulo}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        CLASSE_STATUS[comunicado.status],
                      )}
                    >
                      {ROTULO_STATUS_COMUNICADO[comunicado.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {comunicado.resumo}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ROTULO_TIPO_COMUNICADO[comunicado.tipo]} ·{' '}
                    {ROTULO_AUDIENCIA_COMUNICADO[comunicado.audiencia]} ·{' '}
                    {comunicado.publicadoEm
                      ? new Date(comunicado.publicadoEm).toLocaleString('pt-BR')
                      : 'sem data'}{' '}
                    · {comunicado.autorNome}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={salvando}
                    onClick={() => editar(comunicado)}
                  >
                    <Pencil className="size-3.5" />
                    Editar
                  </Button>
                  {comunicado.status !== 'publicado' && (
                    <Button
                      size="sm"
                      disabled={salvando}
                      onClick={() =>
                        mudarEstado(publicarComunicado, comunicado.id)
                      }
                    >
                      Publicar
                    </Button>
                  )}
                  {comunicado.status === 'publicado' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={salvando}
                      onClick={() =>
                        mudarEstado(despublicarComunicado, comunicado.id)
                      }
                    >
                      Despublicar
                    </Button>
                  )}
                  {comunicado.status !== 'arquivado' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={salvando}
                      onClick={() =>
                        mudarEstado(arquivarComunicado, comunicado.id)
                      }
                    >
                      Arquivar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
