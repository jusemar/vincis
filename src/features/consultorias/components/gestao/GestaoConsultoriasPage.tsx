'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Search,
  Video,
  X,
} from 'lucide-react'
import {
  abrirConsultoriaGestao,
  buscarConsultoriasGestao,
} from '../../actions/gestao-consultorias'
import { formatarPreco } from '../../lib/formato'
import type {
  ConsultoriaGestaoDTO,
  DetalheConsultoriaGestaoDTO,
  IndicadoresConsultoriasDTO,
} from '../../types/gestao-consultorias'

/**
 * O acompanhamento operacional das Consultorias Agendadas.
 *
 * ## O que esta tela deliberadamente não faz
 *
 * Nada. Não há um botão que cancele, remarque, conclua ou altere avaliação —
 * e a ausência é a regra, não um recorte de escopo a ser preenchido depois. A
 * consultoria é um acordo entre duas pessoas; a Vincis administra a plataforma
 * onde ele acontece. Um painel que agisse no lugar delas transformaria suporte
 * em intervenção, e a primeira vez que isso acontecesse ninguém saberia dizer
 * quem tinha decidido o quê.
 *
 * ## O que ela mostra
 *
 * O registro operacional: quem, quando, quanto, status, protocolo, pagamento e
 * o histórico técnico. O assunto que o Cliente escreveu **não chega até aqui** —
 * ele não é escondido por CSS, ele não existe no dado que o servidor devolve.
 */

const STATUS_ROTULO: Record<string, string> = {
  agendada: 'Agendada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const STATUS_TOM: Record<string, string> = {
  agendada: 'bg-green-500/10 text-green-600 dark:text-green-400',
  concluida: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  cancelada: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

/** `2026-09-10` → `10/09/2026`, sem passar por `Date` (que trocaria o fuso). */
function dataBR(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function momentoBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function GestaoConsultoriasPage({
  gestorNome,
  indicadores,
  inicial,
  prestadores,
}: {
  gestorNome: string
  indicadores: IndicadoresConsultoriasDTO
  inicial: {
    consultorias: ConsultoriaGestaoDTO[]
    total: number
    pagina: number
    totalPaginas: number
  }
  prestadores: { id: string; nome: string }[]
}) {
  const [resultado, setResultado] = useState(inicial)
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const [periodo, setPeriodo] = useState('todos')
  const [prestadorId, setPrestadorId] = useState('')
  const [pagamento, setPagamento] = useState('todos')
  const [avaliacao, setAvaliacao] = useState('todos')
  const [somenteProblemas, setSomenteProblemas] = useState(false)
  const [detalhe, setDetalhe] = useState<DetalheConsultoriaGestaoDTO | null>(null)
  const [carregando, iniciar] = useTransition()

  function consultar(pagina = 1, ajustes: Record<string, unknown> = {}) {
    iniciar(async () => {
      const r = await buscarConsultoriasGestao({
        busca,
        status,
        periodo,
        prestadorId: prestadorId || undefined,
        pagamento,
        avaliacao,
        somenteProblemas,
        pagina,
        porPagina: 20,
        ...ajustes,
      })
      if (r.sucesso) setResultado(r)
    })
  }

  function abrir(id: string) {
    iniciar(async () => {
      const r = await abrirConsultoriaGestao(id)
      if (r.sucesso) setDetalhe(r.dados)
    })
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/gestao"
            className="mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Gestão
          </Link>
          <h1 className="text-2xl font-bold">Consultorias</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhamento operacional. {gestorNome}, esta tela é somente de
            leitura — cancelar, remarcar e concluir seguem com o cliente e o
            profissional.
          </p>
        </div>
      </div>

      <Indicadores dados={indicadores} />

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="g-busca" className="mb-1 block text-xs font-medium">
              Buscar
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="g-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') consultar(1)
                }}
                placeholder="Protocolo, cliente ou profissional"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <Seletor
            id="g-status"
            rotulo="Status"
            valor={status}
            aoMudar={setStatus}
            opcoes={[
              ['todos', 'Todos'],
              ['agendada', 'Agendada'],
              ['concluida', 'Concluída'],
              ['cancelada', 'Cancelada'],
            ]}
          />
          <Seletor
            id="g-periodo"
            rotulo="Período"
            valor={periodo}
            aoMudar={setPeriodo}
            opcoes={[
              ['todos', 'Todos'],
              ['hoje', 'Hoje'],
              ['semana', 'Próximos 7 dias'],
              ['mes', 'Próximo mês'],
            ]}
          />
          <Seletor
            id="g-prestador"
            rotulo="Profissional"
            valor={prestadorId}
            aoMudar={setPrestadorId}
            opcoes={[['', 'Todos'], ...prestadores.map((p) => [p.id, p.nome] as [string, string])]}
          />
          <Seletor
            id="g-pagamento"
            rotulo="Pagamento"
            valor={pagamento}
            aoMudar={setPagamento}
            opcoes={[
              ['todos', 'Todos'],
              ['aprovado', 'Aprovado'],
              ['sem_pagamento', 'Sem pagamento'],
            ]}
          />
          <Seletor
            id="g-avaliacao"
            rotulo="Avaliação"
            valor={avaliacao}
            aoMudar={setAvaliacao}
            opcoes={[
              ['todos', 'Todas'],
              ['avaliadas', 'Avaliadas'],
              ['sem_avaliacao', 'Sem avaliação'],
            ]}
          />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={somenteProblemas}
                onChange={(e) => setSomenteProblemas(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Só problemas
            </label>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => consultar(1)}
              disabled={carregando}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {carregando ? 'Buscando…' : 'Filtrar'}
            </button>
          </div>
        </div>
      </section>

      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
        {resultado.total} {resultado.total === 1 ? 'consultoria' : 'consultorias'}
        {resultado.totalPaginas > 1
          ? ` · página ${resultado.pagina} de ${resultado.totalPaginas}`
          : ''}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {['Protocolo', 'Cliente', 'Profissional', 'Quando', 'Valor', 'Status', 'Pagamento', ''].map(
                (h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {resultado.consultorias.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhuma consultoria encontrada com estes filtros.
                </td>
              </tr>
            ) : (
              resultado.consultorias.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    {c.protocolo ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">{c.clienteNome}</td>
                  <td className="px-3 py-2.5">{c.prestadorNome}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {dataBR(c.data)} · {c.inicio}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {c.duracaoMinutos}min
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {formatarPreco(c.valorCentavos)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${STATUS_TOM[c.status] ?? 'bg-muted'}`}
                    >
                      {STATUS_ROTULO[c.status] ?? c.status}
                    </span>
                    {c.problemas.length ? (
                      <span
                        title={c.problemas.join(' · ')}
                        className="ml-1 inline-flex items-center text-amber-600"
                      >
                        <AlertTriangle className="size-3.5" aria-hidden />
                        <span className="sr-only">{c.problemas.join('. ')}</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {c.pagamentoStatus ? c.pagamentoReferencia : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => abrir(c.id)}
                      className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {resultado.totalPaginas > 1 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={resultado.pagina <= 1 || carregando}
            onClick={() => consultar(resultado.pagina - 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={resultado.pagina >= resultado.totalPaginas || carregando}
            onClick={() => consultar(resultado.pagina + 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      ) : null}

      {detalhe ? (
        <DetalheDaConsultoria dados={detalhe} aoFechar={() => setDetalhe(null)} />
      ) : null}
    </main>
  )
}

function Seletor({
  id,
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  opcoes: [string, string][]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
    </div>
  )
}

function Indicadores({ dados }: { dados: IndicadoresConsultoriasDTO }) {
  const itens: [string, string][] = [
    ['Total', String(dados.total)],
    ['Agendadas', String(dados.agendadas)],
    ['Concluídas', String(dados.concluidas)],
    ['Canceladas', String(dados.canceladas)],
    ['Valor simulado', formatarPreco(dados.valorTotalCentavos)],
    [
      'Avaliações',
      dados.avaliacoes
        ? `${dados.avaliacoes} · ${dados.mediaAvaliacoes?.toFixed(1)}★`
        : '0',
    ],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          <p className="mt-0.5 truncate text-lg font-bold">{valor}</p>
        </div>
      ))}
      {dados.comProblema > 0 ? (
        <div className="col-span-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 sm:col-span-3 lg:col-span-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
            {dados.comProblema}{' '}
            {dados.comProblema === 1
              ? 'consultoria com inconsistência'
              : 'consultorias com inconsistência'}{' '}
            — use o filtro “Só problemas”.
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * O detalhe operacional.
 *
 * Repare no bloco da videochamada: ele diz *se* a sala existe e *quando* a
 * janela abre. Não há nome de sala, não há link e não há token — o suporte
 * precisa saber se a porta foi provisionada, não abrir a porta.
 */
function DetalheDaConsultoria({
  dados,
  aoFechar,
}: {
  dados: DetalheConsultoriaGestaoDTO
  aoFechar: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Consultoria ${dados.protocolo ?? ''}`}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={aoFechar}
      onKeyDown={(e) => {
        if (e.key === 'Escape') aoFechar()
      }}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Consultoria online</h2>
            <p className="font-mono text-sm text-muted-foreground">
              {dados.protocolo ?? 'sem protocolo'}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            autoFocus
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <Bloco titulo="Resumo">
          <Par rotulo="Cliente" valor={dados.clienteNome} />
          <Par rotulo="Profissional" valor={dados.prestadorNome} />
          <Par rotulo="Serviço" valor={dados.servico} />
          <Par rotulo="Data" valor={`${dataBR(dados.data)} · ${dados.inicio} às ${dados.fim}`} />
          <Par rotulo="Duração" valor={`${dados.duracaoMinutos} minutos`} />
          <Par rotulo="Valor" valor={formatarPreco(dados.valorCentavos)} />
          <Par rotulo="Status" valor={STATUS_ROTULO[dados.status] ?? dados.status} />
          <Par rotulo="Fuso" valor={dados.timezone} />
          <Par rotulo="Criada em" valor={momentoBR(dados.criadoEm)} />
          <Par rotulo="Atualizada em" valor={momentoBR(dados.atualizadoEm)} />
        </Bloco>

        <Bloco titulo="Pagamento">
          {dados.pagamento ? (
            <>
              <Par rotulo="Status" valor={dados.pagamento.status} />
              <Par rotulo="Referência" valor={dados.pagamento.referencia ?? '—'} />
              <Par rotulo="Origem" valor={dados.pagamento.origem} />
              <Par rotulo="Aprovado em" valor={momentoBR(dados.pagamento.aprovadoEm)} />
            </>
          ) : (
            <p className="text-sm text-amber-600">Sem pagamento registrado.</p>
          )}
        </Bloco>

        <Bloco titulo="Agenda">
          <Par rotulo="Remarcações" valor={String(dados.remarcacoes)} />
          <Par rotulo="Última remarcação" valor={momentoBR(dados.remarcadoEm)} />
          <Par rotulo="Cancelada em" valor={momentoBR(dados.canceladoEm)} />
          {dados.motivoCancelamento ? (
            <Par rotulo="Motivo" valor={dados.motivoCancelamento} />
          ) : null}
          <Par rotulo="Concluída em" valor={momentoBR(dados.concluidoEm)} />
        </Bloco>

        <Bloco titulo="Videochamada">
          <Par
            rotulo="Sala"
            valor={dados.videochamada.salaCriada ? 'Provisionada' : 'Ainda não criada'}
          />
          <Par rotulo="Criada em" valor={momentoBR(dados.videochamada.salaCriadaEm)} />
          <Par rotulo="Janela abre" valor={momentoBR(dados.videochamada.janelaAbreEm)} />
          <Par rotulo="Janela fecha" valor={momentoBR(dados.videochamada.janelaFechaEm)} />
          <p className="col-span-2 mt-1 flex items-start gap-2 text-xs text-muted-foreground">
            <Video className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Estado técnico apenas. O acesso à sala é emitido no clique de quem
            participa, e não existe caminho para a Gestão entrar na chamada.
          </p>
        </Bloco>

        {dados.avaliacaoNota ? (
          <Bloco titulo="Avaliação">
            <Par rotulo="Nota" valor={`${dados.avaliacaoNota} de 5`} />
            {dados.avaliacaoComentario ? (
              <Par rotulo="Comentário" valor={dados.avaliacaoComentario} />
            ) : null}
          </Bloco>
        ) : null}

        <Bloco titulo="Histórico do atendimento">
          {dados.eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
          ) : (
            <ol className="col-span-2 space-y-2">
              {dados.eventos.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <CalendarDays
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="break-words">{e.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {momentoBR(e.criadoEm)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="col-span-2 mt-1 text-xs text-muted-foreground">
            Só eventos operacionais. A conversa e os arquivos do atendimento são
            privados entre cliente e profissional.
          </p>
        </Bloco>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-border p-4">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border/50 py-1 last:border-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="break-words text-sm font-medium">{valor}</dd>
    </div>
  )
}
