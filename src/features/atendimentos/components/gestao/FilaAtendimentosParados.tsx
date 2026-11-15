'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { encerrarAtendimentoSemConclusao } from '../../actions/encerramento'
import {
  MOTIVOS_ENCERRAMENTO_SEM_CONCLUSAO,
  ROTULO_MOTIVO_ENCERRAMENTO,
} from '../../constants/atendimento'
import type { AtendimentoParadoDTO } from '../../queries/atendimentos-parados'
import {
  EncerrarSemConclusaoSchema,
  type EncerrarSemConclusaoDTO,
} from '../../schemas/encerramento'

function data(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

/**
 * A fila de Atendimentos parados (7+ dias sem interação real).
 *
 * Mostra quem precisa agir e há quanto tempo — o mesmo cálculo que o Cliente e
 * a rotina diária usam — e oferece a única ação da Gestão aqui: encerrar sem
 * conclusão, com motivo e observação interna obrigatórios.
 */
export function FilaAtendimentosParados({
  total,
  itens,
}: {
  total: number
  itens: AtendimentoParadoDTO[]
}) {
  const [encerrando, setEncerrando] = useState<AtendimentoParadoDTO | null>(null)

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Atendimentos parados</h1>
        <p className="text-sm text-muted-foreground">
          Atendimentos abertos há 7 dias ou mais sem interação entre cliente e profissional. Com 14 dias,
          entram em revisão pela Vincis. Nada aqui é cancelado ou estornado automaticamente.
        </p>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum atendimento parado no momento.
        </div>
      ) : (
        <ul className="space-y-3">
          {itens.map((item) => (
            <li key={item.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{item.protocolo}</span>
                <span
                  className={
                    item.emRevisao
                      ? 'rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300'
                      : 'rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground'
                  }
                >
                  {item.alerta ?? 'Atendimento inativo'} · {item.situacao}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.diasSemInteracao} dias sem interação
                </span>
              </div>
              <p className="mt-2 font-semibold">{item.titulo}</p>
              <p className="text-sm text-muted-foreground">
                Cliente: {item.clienteNome} · Profissional: {item.prestadorNome}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Última interação em {data(item.ultimaInteracaoEm)}
                  {item.prazoEm ? ` · prazo ${item.prazoVencido ? 'vencido em' : 'até'} ${data(item.prazoEm)}` : ''}
                </span>
                <Button size="sm" variant="outline" onClick={() => setEncerrando(item)}>
                  Encerrar sem conclusão
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > itens.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Mostrando os {itens.length} mais parados de {total}.
        </p>
      ) : null}

      {encerrando ? (
        <ModalEncerramento
          key={encerrando.id}
          atendimento={encerrando}
          onFechar={() => setEncerrando(null)}
        />
      ) : null}
    </div>
  )
}

function ModalEncerramento({
  atendimento,
  onFechar,
}: {
  atendimento: AtendimentoParadoDTO
  onFechar: () => void
}) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EncerrarSemConclusaoDTO>({
    resolver: zodResolver(EncerrarSemConclusaoSchema),
    defaultValues: { atendimentoId: atendimento.id, observacaoInterna: '' },
  })

  const enviar = handleSubmit((dados) =>
    iniciarEnvio(async () => {
      // A action revalida tudo (Gestor, motivo, observação) no servidor.
      const resultado = await encerrarAtendimentoSemConclusao(dados)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      onFechar()
      router.refresh()
    }),
  )

  return (
    <ModalResponsivo
      aberto
      onFechar={onFechar}
      largura="md"
      titulo="Encerrar sem conclusão"
      descricao={`${atendimento.protocolo} · ${atendimento.titulo}`}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button type="submit" form="form-encerramento" disabled={enviando}>
            {enviando ? 'Encerrando…' : 'Encerrar atendimento'}
          </Button>
        </div>
      }
    >
      <form id="form-encerramento" onSubmit={enviar} className="space-y-5">
        <input type="hidden" {...register('atendimentoId')} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Motivo</legend>
          {MOTIVOS_ENCERRAMENTO_SEM_CONCLUSAO.map((motivo) => (
            <label key={motivo} className="flex items-center gap-2 text-sm">
              <input type="radio" value={motivo} {...register('motivo')} className="size-4 accent-primary" />
              {ROTULO_MOTIVO_ENCERRAMENTO[motivo]}
            </label>
          ))}
          {errors.motivo ? (
            <p role="alert" className="text-xs font-medium text-destructive">{errors.motivo.message}</p>
          ) : null}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="observacao-interna" className="text-sm font-semibold">
            Observação administrativa
          </Label>
          <p className="text-xs text-muted-foreground">
            Interna da Vincis: não é mostrada ao cliente. Ex.: “Cliente não responde após sucessivas
            tentativas de contato. Serviço não concluído.”
          </p>
          <Textarea id="observacao-interna" rows={4} {...register('observacaoInterna')} />
          {errors.observacaoInterna ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.observacaoInterna.message}
            </p>
          ) : null}
        </div>

        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Encerrar não estorna, não credita e não promete nada ao cliente. Questões financeiras são
          analisadas à parte, se o cliente ou o profissional procurarem a Vincis. O cliente verá apenas
          “Atendimento encerrado sem conclusão”.
        </p>
      </form>
    </ModalResponsivo>
  )
}
