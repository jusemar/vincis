'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatarValorRepasse } from '../../lib/formato'
import { formatarPercentualMilesimos } from '@/features/servicos/constants/comissao'
import { cn } from '@/lib/utils'
import { registrarRepasseProfissional } from '../../actions/repasses'
import {
  ROTULO_MOTIVO_REVISAO,
  ROTULO_ORIGEM_REPASSE,
  ROTULO_SITUACAO_REPASSE,
  SITUACOES_REPASSE,
  type SituacaoRepasse,
} from '../../constants/repasse'
import type { FiltroRepasses, RepasseGestao, ResumoRepasses } from '../../queries/listar-repasses'
import { RegistrarRepasseSchema, type RegistrarRepasseDTO } from '../../schemas/repasse'

function data(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

const COR_SITUACAO: Record<SituacaoRepasse, string> = {
  aguardando_liberacao: 'bg-muted text-muted-foreground',
  disponivel: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  repassado: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  em_revisao: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
}

/**
 * Repasses manuais aos profissionais.
 *
 * A Vincis recebe 100% e transfere a parte do profissional por fora, depois da
 * prestação. Aqui a Gestão vê o que é devido, o que já pode sair e registra o
 * que saiu. Nada é transferido pela plataforma.
 */
export function RepassesGestao({
  repasses,
  resumo,
  total,
  pagina,
  porPagina,
  filtro,
}: {
  repasses: RepasseGestao[]
  resumo: ResumoRepasses
  total: number
  pagina: number
  porPagina: number
  filtro: FiltroRepasses
}) {
  const [registrando, setRegistrando] = useState<RepasseGestao | null>(null)
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina))
  const href = (novo: FiltroRepasses, novaPagina = 1) =>
    `/admin/repasses?filtro=${novo}${novaPagina > 1 ? `&pagina=${novaPagina}` : ''}`

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Repasses aos profissionais</h1>
        <p className="text-sm text-muted-foreground">
          A Vincis recebe o pagamento do cliente e repassa manualmente a parte do profissional depois da prestação.
          A comissão do parceiro indicador sai somente da parte da Vincis.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SITUACOES_REPASSE.map((situacao) => (
          <Link
            key={situacao}
            href={href(situacao)}
            className={cn(
              'rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50',
              filtro === situacao && 'ring-2 ring-primary',
            )}
          >
            <p className="text-xs text-muted-foreground">{ROTULO_SITUACAO_REPASSE[situacao]}</p>
            <p className="text-lg font-semibold">{formatarValorRepasse(resumo[situacao].profissionalCentavos)}</p>
            <p className="text-xs text-muted-foreground">
              {resumo[situacao].quantidade} {resumo[situacao].quantidade === 1 ? 'item' : 'itens'}
            </p>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant={filtro === 'todos' ? 'default' : 'outline'}>
          <Link href={href('todos')}>Todos</Link>
        </Button>
      </div>

      {repasses.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum valor nesta situação.
        </div>
      ) : (
        <ul className="space-y-3">
          {repasses.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.descricao}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {ROTULO_ORIGEM_REPASSE[r.origem]}
                </span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', COR_SITUACAO[r.situacao])}>
                  {ROTULO_SITUACAO_REPASSE[r.situacao]}
                </span>
                {r.pagoEm ? <span className="ml-auto text-xs text-muted-foreground">Pago em {data(r.pagoEm)}</span> : null}
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                Profissional:{' '}
                <span className="text-foreground">{r.profissional ? r.profissional.nome : 'Sem contador alocado'}</span>
                {r.profissional ? ` · ${r.profissional.email}` : ''}
              </p>
              <p className="text-sm text-muted-foreground">
                Cliente: <span className="text-foreground">{r.cliente.nome}</span>
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Recebido</dt>
                  <dd className="font-semibold">{formatarValorRepasse(r.valorBrutoCentavos)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Devido ao profissional</dt>
                  <dd className="font-semibold">
                    {r.valorProfissionalCentavos === null ? '—' : formatarValorRepasse(r.valorProfissionalCentavos)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Vincis{r.comissaoVincisMilesimos ? ` (${formatarPercentualMilesimos(r.comissaoVincisMilesimos)})` : ''}
                  </dt>
                  <dd className="font-semibold">
                    {r.comissaoVincisCentavos === null ? '—' : formatarValorRepasse(r.comissaoVincisCentavos)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Indicador · Vincis líquido</dt>
                  <dd className="font-semibold">
                    {formatarValorRepasse(r.comissaoIndicadorCentavos)} ·{' '}
                    <span className={cn(r.liquidoVincisCentavos !== null && r.liquidoVincisCentavos < 0 && 'text-destructive')}>
                      {r.liquidoVincisCentavos === null ? '—' : formatarValorRepasse(r.liquidoVincisCentavos)}
                    </span>
                  </dd>
                </div>
              </dl>

              {r.liquidoVincisCentavos !== null && r.liquidoVincisCentavos < 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  A comissão do indicador supera a parte da Vincis. O valor do profissional não é afetado.
                </p>
              ) : null}

              {r.situacao === 'em_revisao' && r.motivoRevisao ? (
                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <strong>Em revisão:</strong> {ROTULO_MOTIVO_REVISAO[r.motivoRevisao]}. Nada é repassado nem devolvido
                  automaticamente.
                </p>
              ) : null}

              <p className="mt-2 break-all text-xs text-muted-foreground">
                Pagamento de origem: {r.referenciaPagamento ?? '—'}
              </p>

              {r.situacao === 'repassado' && r.repassadoEm ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong className="text-foreground">Repassado em {data(r.repassadoEm)}</strong>
                  {r.repassadoPor ? ` por ${r.repassadoPor}` : ''} · Comprovante: {r.comprovante}
                  {r.observacao ? ` · ${r.observacao}` : ''}
                </p>
              ) : null}

              {r.situacao === 'disponivel' ? (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={() => setRegistrando(r)}>
                    <Banknote className="size-4" aria-hidden />
                    Registrar repasse
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ultimaPagina > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {pagina} de {ultimaPagina} · {total} itens
          </span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" disabled={pagina <= 1}>
              <Link href={href(filtro, Math.max(1, pagina - 1))} aria-disabled={pagina <= 1}>
                Anterior
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" disabled={pagina >= ultimaPagina}>
              <Link href={href(filtro, Math.min(ultimaPagina, pagina + 1))} aria-disabled={pagina >= ultimaPagina}>
                Próxima
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {registrando ? (
        <ModalRegistro key={registrando.id} repasse={registrando} onFechar={() => setRegistrando(null)} />
      ) : null}
    </div>
  )
}

function ModalRegistro({ repasse, onFechar }: { repasse: RepasseGestao; onFechar: () => void }) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrarRepasseDTO>({
    resolver: zodResolver(RegistrarRepasseSchema),
    defaultValues: { repasseId: repasse.id, repassadoEm: hojeEmSaoPaulo(), comprovante: '', observacao: '' },
  })

  const enviar = handleSubmit((dados) =>
    iniciarEnvio(async () => {
      const resultado = await registrarRepasseProfissional(dados)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        router.refresh()
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
      titulo="Registrar repasse"
      descricao={`${repasse.profissional?.nome ?? ''} · ${formatarValorRepasse(repasse.valorProfissionalCentavos ?? 0)}`}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button type="submit" form="form-repasse" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Confirmar repasse'}
          </Button>
        </div>
      }
    >
      <form id="form-repasse" onSubmit={enviar} className="space-y-4">
        <input type="hidden" {...register('repasseId')} />
        <p className="text-sm text-muted-foreground">
          Registre somente depois de transferir {formatarValorRepasse(repasse.valorProfissionalCentavos ?? 0)} para{' '}
          {repasse.profissional?.nome}. O registro é definitivo e fica na auditoria.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="repasse-data" className="text-sm font-semibold">
            Data do repasse
          </Label>
          <Input id="repasse-data" type="date" max={hojeEmSaoPaulo()} {...register('repassadoEm')} />
          {errors.repassadoEm ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.repassadoEm.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repasse-comprovante" className="text-sm font-semibold">
            Identificação ou comprovante
          </Label>
          <Input id="repasse-comprovante" placeholder="Ex.: E2E do Pix ou nº do comprovante" {...register('comprovante')} />
          {errors.comprovante ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.comprovante.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repasse-observacao" className="text-sm font-semibold">
            Observação (opcional)
          </Label>
          <Textarea id="repasse-observacao" rows={2} {...register('observacao')} />
          {errors.observacao ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.observacao.message}
            </p>
          ) : null}
        </div>
      </form>
    </ModalResponsivo>
  )
}
