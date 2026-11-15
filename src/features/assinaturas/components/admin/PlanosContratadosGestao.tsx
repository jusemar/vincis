'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { History, Info, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatarCentavos } from '@/features/precificacao/lib/formato'
import type { ContadorParceiro } from '@/features/profissionais/queries/contadores-parceiros'
import { cn } from '@/lib/utils'
import { alocarContadorResponsavel } from '../../actions/alocar-contador'
import { cancelarPlanoPelaGestao } from '../../actions/cancelar-plano'
import { MOTIVOS_SUGERIDOS_CANCELAMENTO, ROTULO_ORIGEM_CANCELAMENTO } from '../../constants/cancelamento'
import { CancelarPlanoGestaoSchema, type CancelarPlanoGestaoDTO } from '../../schemas/cancelamento'
import { ROTULO_PERIODICIDADE, ROTULO_STATUS_ASSINATURA, type Periodicidade } from '../../constants/assinatura'
import {
  AGUARDANDO_ALOCACAO,
  ROTULO_ESCOLHA_CONTADOR,
  ROTULO_ORIGEM_ALOCACAO,
  rotuloDaCapacidade,
} from '../../constants/contador-responsavel'
import type { FiltroPlanosGestao, PlanoGestao } from '../../queries/listar-planos-gestao'
import { AlocarContadorSchema, type AlocarContadorDTO } from '../../schemas/alocacao'

function data(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

function dataHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

const FILTROS: { valor: FiltroPlanosGestao; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'aguardando_alocacao', rotulo: 'Aguardando alocação' },
  { valor: 'cancelados', rotulo: 'Cancelados' },
]

/**
 * Planos contábeis contratados da Vincis — contador responsável por cliente.
 *
 * Mostra plano, cliente, contador atual e como ele chegou lá (escolha do
 * cliente ou alocação da Vincis). Sem contador, o plano aparece como
 * "Aguardando alocação de contador" — nunca com profissional provisório. A
 * troca muda só o responsável; o histórico fica visível no próprio card.
 */
export function PlanosContratadosGestao({
  planos,
  total,
  pagina,
  porPagina,
  filtro,
  contadores,
}: {
  planos: PlanoGestao[]
  total: number
  pagina: number
  porPagina: number
  filtro: FiltroPlanosGestao
  contadores: ContadorParceiro[]
}) {
  const [alocando, setAlocando] = useState<PlanoGestao | null>(null)
  const [cancelandoPlano, setCancelandoPlano] = useState<PlanoGestao | null>(null)
  const ultimaPagina = Math.max(1, Math.ceil(total / porPagina))
  const href = (novoFiltro: FiltroPlanosGestao, novaPagina = 1) =>
    `/admin/planos?filtro=${novoFiltro}${novaPagina > 1 ? `&pagina=${novaPagina}` : ''}`

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Planos contratados</h1>
        <p className="text-sm text-muted-foreground">
          Planos de contabilidade contratados pela Vincis e o contador parceiro responsável por cada cliente.
          Trocar o contador não altera cliente, plano, pagamentos nem histórico.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar planos">
        {FILTROS.map((opcao) => (
          <Button key={opcao.valor} asChild size="sm" variant={filtro === opcao.valor ? 'default' : 'outline'}>
            <Link href={href(opcao.valor)} role="tab" aria-selected={filtro === opcao.valor}>
              {opcao.rotulo}
            </Link>
          </Button>
        ))}
      </div>

      {planos.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {filtro === 'aguardando_alocacao'
            ? 'Nenhum plano aguardando alocação de contador.'
            : filtro === 'cancelados'
              ? 'Nenhum plano cancelado.'
              : 'Nenhum plano contábil contratado ainda.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {planos.map((plano) => (
            <li key={plano.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{plano.planoNome}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {ROTULO_PERIODICIDADE[plano.periodicidade as Periodicidade] ?? plano.periodicidade} ·{' '}
                  {formatarCentavos(plano.valorMensalCentavos)}/mês
                </span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    plano.status === 'ativa'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {ROTULO_STATUS_ASSINATURA[plano.status]}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">Contratado em {data(plano.contratadoEm)}</span>
              </div>

              {plano.cancelamento ? (
                <p className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  <strong className="text-foreground">Cancelado em {dataHora(plano.cancelamento.em)}</strong>
                  {plano.cancelamento.origem ? ` · ${ROTULO_ORIGEM_CANCELAMENTO[plano.cancelamento.origem]}` : ''}
                  {plano.cancelamento.por ? ` (${plano.cancelamento.por})` : ''}
                  {plano.cancelamento.motivo ? ` · Motivo: ${plano.cancelamento.motivo}` : ''}
                </p>
              ) : null}

              <p className="mt-2 text-sm text-muted-foreground">
                Cliente: <span className="text-foreground">{plano.cliente.nome}</span> · {plano.cliente.email}
              </p>

              <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm">
                    <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {plano.contador ? (
                      <span>
                        Contador responsável: <strong>{plano.contador.nome}</strong>
                      </span>
                    ) : (
                      <strong className="text-amber-700 dark:text-amber-300">{AGUARDANDO_ALOCACAO}</strong>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plano.historico[0]
                      ? ROTULO_ORIGEM_ALOCACAO[plano.historico[0].origem]
                      : plano.escolhaContador
                        ? ROTULO_ESCOLHA_CONTADOR[plano.escolhaContador]
                        : 'Contratado antes da escolha de contador'}
                    {plano.escolhaContador === 'vincis' && plano.historico[0] ? ' · cliente deixou a Vincis escolher' : ''}
                  </p>
                </div>
                {plano.cancelamento ? null : (
                  <Button size="sm" variant={plano.contador ? 'outline' : 'default'} onClick={() => setAlocando(plano)}>
                    {plano.contador ? 'Trocar contador' : 'Alocar contador'}
                  </Button>
                )}
              </div>

              {plano.cancelamento ? null : (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCancelandoPlano(plano)}>
                    Cancelar plano
                  </Button>
                </div>
              )}

              {plano.historico.length ? (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                    <History className="size-3.5" aria-hidden />
                    Histórico do contador ({plano.historico.length})
                  </summary>
                  <ol className="mt-2 space-y-1.5 border-l pl-3">
                    {plano.historico.map((evento) => (
                      <li key={evento.id}>
                        <span className="text-foreground">{dataHora(evento.em)}</span> ·{' '}
                        {evento.novo === null
                          ? `${evento.anterior} → sem contador (Vincis escolhe)`
                          : evento.anterior
                            ? `${evento.anterior} → ${evento.novo}`
                            : `Responsável: ${evento.novo}`}{' '}
                        ·{' '}
                        {ROTULO_ORIGEM_ALOCACAO[evento.origem]} por {evento.alteradoPor}
                        {evento.motivo ? ` · Motivo: ${evento.motivo}` : ''}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ultimaPagina > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {pagina} de {ultimaPagina} · {total} planos
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

      {cancelandoPlano ? (
        <ModalCancelamento key={cancelandoPlano.id} plano={cancelandoPlano} onFechar={() => setCancelandoPlano(null)} />
      ) : null}

      {alocando ? (
        <ModalAlocacao key={alocando.id} plano={alocando} contadores={contadores} onFechar={() => setAlocando(null)} />
      ) : null}
    </div>
  )
}

function ModalAlocacao({
  plano,
  contadores,
  onFechar,
}: {
  plano: PlanoGestao
  contadores: ContadorParceiro[]
  onFechar: () => void
}) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AlocarContadorDTO>({
    resolver: zodResolver(AlocarContadorSchema),
    defaultValues: { assinaturaId: plano.id, contadorId: '', motivo: '' },
  })
  // O atual não aparece como opção: trocar por ele mesmo não é troca.
  const opcoes = contadores.filter((c) => c.id !== plano.contador?.id)

  const enviar = handleSubmit((dados) =>
    iniciarEnvio(async () => {
      const resultado = await alocarContadorResponsavel(dados)
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
      titulo={plano.contador ? 'Trocar contador responsável' : 'Alocar contador responsável'}
      descricao={`${plano.planoNome} · ${plano.cliente.nome}`}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button type="submit" form="form-alocacao" disabled={enviando || opcoes.every((c) => c.lotado)}>
            {enviando ? 'Salvando…' : 'Salvar contador'}
          </Button>
        </div>
      }
    >
      <form id="form-alocacao" onSubmit={enviar} className="space-y-5">
        <input type="hidden" {...register('assinaturaId')} />
        {plano.contador ? (
          <p className="text-sm">
            Atual: <strong>{plano.contador.nome}</strong>
          </p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Contador parceiro</legend>
          {opcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum outro contador parceiro apto. Defina o modelo “Contratação pela Vincis” no cadastro do contador
              em Usuários.
            </p>
          ) : (
            opcoes.map((contador) => (
              // No limite: aparece (o Gestor precisa saber que existe), mas não
              // recebe novo cliente — e o servidor recusa do mesmo jeito.
              <label
                key={contador.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-2.5 text-sm',
                  contador.lotado && 'cursor-not-allowed border-amber-500/40 bg-amber-500/5',
                )}
              >
                <input
                  type="radio"
                  value={contador.id}
                  disabled={contador.lotado}
                  {...register('contadorId')}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className={cn(contador.lotado && 'text-muted-foreground')}>{contador.nome}</span>
                  {contador.cidade ? (
                    <span className="text-muted-foreground">
                      {' '}
                      · {contador.cidade}
                      {contador.estado ? `/${contador.estado}` : ''}
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {rotuloDaCapacidade(contador.capacidade, contador)}
                  </span>
                  {contador.lotado ? (
                    <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
                      {contador.acimaDoLimite ? 'Acima da capacidade' : 'No limite da capacidade'} — não recebe novos
                      clientes.
                    </span>
                  ) : null}
                </span>
              </label>
            ))
          )}
          {errors.contadorId ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.contadorId.message}
            </p>
          ) : null}
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="motivo-alocacao" className="text-sm font-semibold">
            Motivo (opcional)
          </Label>
          <Textarea id="motivo-alocacao" rows={3} {...register('motivo')} />
          {errors.motivo ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.motivo.message}
            </p>
          ) : null}
        </div>

        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Muda apenas o contador responsável daqui para frente. Conta do cliente, plano, pagamentos, documentos e
          histórico permanecem. A troca fica registrada com você como responsável.
        </p>
      </form>
    </ModalResponsivo>
  )
}

/**
 * Cancelamento do plano pela Gestão: confirmação com motivo obrigatório.
 *
 * Encerra só a relação recorrente — conta do cliente, histórico, pagamentos e
 * meses já pagos ou prestados ficam como estão. Sem estorno.
 */
function ModalCancelamento({ plano, onFechar }: { plano: PlanoGestao; onFechar: () => void }) {
  const router = useRouter()
  const [enviando, iniciarEnvio] = useTransition()
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CancelarPlanoGestaoDTO>({
    resolver: zodResolver(CancelarPlanoGestaoSchema),
    defaultValues: { assinaturaId: plano.id, motivo: '' },
  })

  const enviar = handleSubmit((dados) =>
    iniciarEnvio(async () => {
      const resultado = await cancelarPlanoPelaGestao(dados)
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
      titulo="Cancelar plano"
      descricao={`${plano.planoNome} · ${plano.cliente.nome}`}
      rodape={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button type="submit" form="form-cancelamento" variant="destructive" disabled={enviando}>
            {enviando ? 'Cancelando…' : 'Confirmar cancelamento'}
          </Button>
        </div>
      }
    >
      <form id="form-cancelamento" onSubmit={enviar} className="space-y-4">
        <input type="hidden" {...register('assinaturaId')} />
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>O plano recorrente é encerrado: sem novas cobranças, Pix ou meses.</li>
          <li>A vaga do contador é liberada; ele continua no histórico.</li>
          <li>Conta do cliente, pagamentos, mês em andamento e meses prestados são preservados.</li>
          <li>Meses futuros são encerrados, mesmo se pagos adiantado. Não há estorno automático.</li>
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-cancelamento" className="text-sm font-semibold">
            Motivo
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_SUGERIDOS_CANCELAMENTO.map((sugestao) => (
              <Button
                key={sugestao}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setValue('motivo', sugestao, { shouldValidate: true })}
              >
                {sugestao}
              </Button>
            ))}
          </div>
          <Textarea id="motivo-cancelamento" rows={3} {...register('motivo')} />
          {errors.motivo ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.motivo.message}
            </p>
          ) : null}
        </div>
      </form>
    </ModalResponsivo>
  )
}
