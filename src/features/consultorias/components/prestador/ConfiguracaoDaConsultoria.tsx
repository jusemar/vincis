'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarOff,
  Clock,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import {
  criarBloqueioDeAgenda,
  listarBloqueiosDaAgenda,
  removerBloqueioDeAgenda,
  salvarDisponibilidadeDaAgenda,
} from '../../actions/agenda-do-prestador'
import { obterMinhaConsultoria, salvarConsultoria } from '../../actions/consultoria'
import {
  DIAS_DA_SEMANA,
  DURACAO_MAXIMA_MINUTOS,
  HORIZONTE_MAXIMO_DIAS,
  ROTULO_DIA_SEMANA,
} from '../../constants/consultoria'
import type { ConflitoDeAgenda } from '../../lib/conflitos-de-agenda'
import { formatarPreco } from '../../lib/formato'
import type { ConsultoriaDoPrestadorDTO } from '../../types/consultoria'

/**
 * A agenda pelo lado de dentro: o que o Profissional controla.
 *
 * ## Por que aqui, e não numa tela nova
 *
 * Porque a pergunta "quando eu atendo?" e a pergunta "quem eu atendo hoje?" são
 * a mesma agenda vista de dois ângulos. Um item novo na barra lateral separaria
 * as duas e obrigaria a pessoa a lembrar qual das duas telas tem o que ela quer.
 *
 * ## Toda regra continua no servidor
 *
 * Esta tela não valida preço, duração, horizonte nem conflito: ela **mostra** o
 * que o servidor respondeu. Os limites aparecem nos campos como cortesia — quem
 * recusa é o schema, e é por isso que um `min`/`max` alterado no HTML não
 * compra nada.
 *
 * ## O conflito é conversa, não bloqueio
 *
 * Quando o horário novo deixa consultas já vendidas de fora, o servidor
 * responde com a lista em vez de gravar. A tela mostra quem ficou de fora e
 * pergunta. Confirmar grava a agenda — e **não** desmarca ninguém: quem desmarca
 * é o cancelamento, com aviso ao Cliente e motivo.
 */

type Faixa = { diaSemana: number; horaInicio: string; horaFim: string }
type Bloqueio = {
  grupoId: string
  dataInicio: string
  dataFim: string
  dias: number
  motivo: string | null
}

const HORA_PADRAO = { inicio: '09:00', fim: '12:00' }

/** `2026-09-10` → `10/09/2026`, sem passar por `Date` (que reinterpretaria o fuso). */
function dataBR(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function ConfiguracaoDaConsultoria() {
  const [dados, setDados] = useState<ConsultoriaDoPrestadorDTO | null | undefined>(
    undefined,
  )
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  /**
   * Relê tudo do servidor.
   *
   * Chamada pelos manipuladores depois de cada gravação — nunca de dentro do
   * corpo de um efeito. O `setState` acontece no retorno da promessa, que é um
   * retorno de chamada de sistema externo, e não uma cascata de render.
   */
  async function recarregar() {
    const [consultoria, lista] = await Promise.all([
      obterMinhaConsultoria(),
      listarBloqueiosDaAgenda(),
    ])
    setDados(consultoria.sucesso ? consultoria.dados : null)
    setBloqueios(lista.sucesso ? lista.dados : [])
  }

  // A carga inicial. `vivo` evita gravar estado numa tela que já saiu.
  useEffect(() => {
    let vivo = true
    Promise.all([obterMinhaConsultoria(), listarBloqueiosDaAgenda()])
      .then(([consultoria, lista]) => {
        if (!vivo) return
        setDados(consultoria.sucesso ? consultoria.dados : null)
        setBloqueios(lista.sucesso ? lista.dados : [])
      })
      .catch(() => {
        if (vivo) setDados(null)
      })
    return () => {
      vivo = false
    }
  }, [])

  if (dados === undefined) {
    return <p className="text-sm text-muted-foreground">Carregando sua consultoria…</p>
  }

  if (dados === null) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="font-medium">Você ainda não configurou sua consultoria.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina preço, duração e horários para que os clientes possam agendar.
        </p>
        <ConsultoriaForm dados={null} aoSalvar={recarregar} aoAvisar={setAviso} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {aviso ? (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            aviso.tom === 'ok'
              ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {aviso.texto}
        </p>
      ) : null}

      <CartaoDaConsultoria dados={dados} aoSalvar={recarregar} aoAvisar={setAviso} />
      <CartaoDaDisponibilidade dados={dados} aoSalvar={recarregar} aoAvisar={setAviso} />
      <CartaoDeBloqueios
        bloqueios={bloqueios}
        aoSalvar={recarregar}
        aoAvisar={setAviso}
      />
    </div>
  )
}

type Aviso = (a: { tom: 'ok' | 'erro'; texto: string } | null) => void

function Cartao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string
  descricao?: string
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{titulo}</h3>
          {descricao ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
          ) : null}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Preço, duração, antecedência, horizonte e o interruptor de ativa/inativa. */
function CartaoDaConsultoria({
  dados,
  aoSalvar,
  aoAvisar,
}: {
  dados: ConsultoriaDoPrestadorDTO
  aoSalvar: () => Promise<void>
  aoAvisar: Aviso
}) {
  const [editando, setEditando] = useState(false)
  const [alternando, alternar] = useTransition()

  function trocarStatus() {
    aoAvisar(null)
    alternar(async () => {
      const r = await salvarConsultoria({ ...dados, ativa: !dados.ativa })
      aoAvisar({
        tom: r.sucesso ? 'ok' : 'erro',
        texto: r.sucesso
          ? dados.ativa
            ? 'Consultoria desativada. Os agendamentos existentes continuam valendo.'
            : 'Consultoria ativada.'
          : r.mensagem,
      })
      if (r.sucesso) await aoSalvar()
    })
  }

  return (
    <Cartao
      titulo="Minha consultoria"
      descricao={dados.titulo}
      acao={
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              dados.ativa
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {dados.ativa ? 'Ativa' : 'Inativa'}
          </span>
          <button
            type="button"
            onClick={trocarStatus}
            disabled={alternando}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {alternando ? '…' : dados.ativa ? 'Desativar' : 'Ativar'}
          </button>
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {editando ? 'Cancelar' : 'Editar'}
          </button>
        </div>
      }
    >
      {!dados.ativa ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Enquanto estiver inativa, novos clientes não conseguem agendar. As
          consultorias já marcadas continuam valendo e aparecem na sua agenda.
        </p>
      ) : null}

      {editando ? (
        <ConsultoriaForm
          dados={dados}
          aoSalvar={async () => {
            setEditando(false)
            await aoSalvar()
          }}
          aoAvisar={aoAvisar}
        />
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info rotulo="Preço" valor={formatarPreco(dados.valorCentavos)} />
          <Info rotulo="Duração" valor={`${dados.duracaoMinutos} minutos`} />
          <Info
            rotulo="Antecedência mínima"
            valor={rotuloAntecedencia(dados.antecedenciaMinimaMinutos)}
          />
          <Info rotulo="Agenda aberta por" valor={`${dados.horizonteDias} dias`} />
          <Info rotulo="Intervalo entre consultas" valor={`${dados.intervaloMinutos} min`} />
          <Info rotulo="Modalidade" valor="Online" />
          <Info rotulo="Fuso" valor={dados.timezone} />
        </dl>
      )}
    </Cartao>
  )
}

function rotuloAntecedencia(minutos: number) {
  if (minutos < 60) return `${minutos} min`
  if (minutos % 1440 === 0) return `${minutos / 1440} dia(s)`
  return `${Math.round(minutos / 60)} h`
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="truncate font-medium">{valor}</dd>
    </div>
  )
}

const DURACOES = [15, 30, 45, 60, 90, 120]
const ANTECEDENCIAS = [
  { valor: 60, rotulo: '1 hora' },
  { valor: 120, rotulo: '2 horas' },
  { valor: 1440, rotulo: '24 horas' },
  { valor: 2880, rotulo: '48 horas' },
]
const HORIZONTES = [30, 60, 90]

function ConsultoriaForm({
  dados,
  aoSalvar,
  aoAvisar,
}: {
  dados: ConsultoriaDoPrestadorDTO | null
  aoSalvar: () => Promise<void>
  aoAvisar: Aviso
}) {
  const [titulo, setTitulo] = useState(dados?.titulo ?? 'Consultoria online')
  const [descricao, setDescricao] = useState(
    dados?.descricaoCurta ?? 'Conversa ao vivo para tirar suas dúvidas.',
  )
  // O preço vive em reais no formulário e em centavos no servidor. A conversão
  // acontece num lugar só, no envio.
  const [reais, setReais] = useState(
    dados ? (dados.valorCentavos / 100).toFixed(2) : '150.00',
  )
  const [duracao, setDuracao] = useState(dados?.duracaoMinutos ?? 60)
  const [intervalo, setIntervalo] = useState(dados?.intervaloMinutos ?? 0)
  const [antecedencia, setAntecedencia] = useState(dados?.antecedenciaMinimaMinutos ?? 120)
  const [horizonte, setHorizonte] = useState(dados?.horizonteDias ?? 60)
  const [salvando, salvar] = useTransition()

  function enviar() {
    aoAvisar(null)
    salvar(async () => {
      const r = await salvarConsultoria({
        titulo,
        descricaoCurta: descricao,
        valorCentavos: Math.round(Number(reais.replace(',', '.')) * 100),
        duracaoMinutos: duracao,
        intervaloMinutos: intervalo,
        antecedenciaMinimaMinutos: antecedencia,
        horizonteDias: horizonte,
        ativa: dados?.ativa ?? true,
      })
      aoAvisar({ tom: r.sucesso ? 'ok' : 'erro', texto: r.mensagem })
      if (r.sucesso) await aoSalvar()
    })
  }

  return (
    <div className="mt-4 grid gap-4 text-left sm:grid-cols-2">
      <Campo rotulo="Nome" htmlFor="cfg-titulo">
        <input
          id="cfg-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={160}
          className={entrada}
        />
      </Campo>
      <Campo rotulo="Preço (R$)" htmlFor="cfg-preco">
        <input
          id="cfg-preco"
          inputMode="decimal"
          value={reais}
          onChange={(e) => setReais(e.target.value)}
          className={entrada}
        />
      </Campo>
      <Campo rotulo="Resumo" htmlFor="cfg-descricao" className="sm:col-span-2">
        <input
          id="cfg-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={280}
          className={entrada}
        />
      </Campo>
      <Campo rotulo="Duração" htmlFor="cfg-duracao">
        <select
          id="cfg-duracao"
          value={duracao}
          onChange={(e) => setDuracao(Number(e.target.value))}
          className={entrada}
        >
          {DURACOES.filter((d) => d <= DURACAO_MAXIMA_MINUTOS).map((d) => (
            <option key={d} value={d}>
              {d} minutos
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Intervalo entre consultas" htmlFor="cfg-intervalo">
        <select
          id="cfg-intervalo"
          value={intervalo}
          onChange={(e) => setIntervalo(Number(e.target.value))}
          className={entrada}
        >
          {[0, 5, 10, 15, 30].map((i) => (
            <option key={i} value={i}>
              {i === 0 ? 'Sem intervalo' : `${i} minutos`}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Antecedência mínima" htmlFor="cfg-antecedencia">
        <select
          id="cfg-antecedencia"
          value={antecedencia}
          onChange={(e) => setAntecedencia(Number(e.target.value))}
          className={entrada}
        >
          {ANTECEDENCIAS.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Agenda aberta por" htmlFor="cfg-horizonte">
        <select
          id="cfg-horizonte"
          value={horizonte}
          onChange={(e) => setHorizonte(Number(e.target.value))}
          className={entrada}
        >
          {HORIZONTES.filter((h) => h <= HORIZONTE_MAXIMO_DIAS).map((h) => (
            <option key={h} value={h}>
              {h} dias
            </option>
          ))}
        </select>
      </Campo>
      <div className="sm:col-span-2">
        <button
          type="button"
          onClick={enviar}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Salvar consultoria
        </button>
      </div>
    </div>
  )
}

const entrada =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Campo({
  rotulo,
  htmlFor,
  className = '',
  children,
}: {
  rotulo: string
  htmlFor: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium">
        {rotulo}
      </label>
      {children}
    </div>
  )
}

/**
 * A semana de trabalho — e os intervalos, que são o espaço **entre** as faixas.
 *
 * Não existe campo "intervalo de almoço": duas faixas no mesmo dia (09–12 e
 * 14–17) já dizem isso, e o gerador de horários simplesmente não produz nada
 * entre elas. Um terceiro conceito para descrever o buraco criaria duas formas
 * de dizer a mesma coisa, com chance de discordarem.
 */
function CartaoDaDisponibilidade({
  dados,
  aoSalvar,
  aoAvisar,
}: {
  dados: ConsultoriaDoPrestadorDTO
  aoSalvar: () => Promise<void>
  aoAvisar: Aviso
}) {
  const [faixas, setFaixas] = useState<Faixa[]>(() =>
    dados.faixas.map((f) => ({
      diaSemana: f.diaSemana,
      horaInicio: f.horaInicio.slice(0, 5),
      horaFim: f.horaFim.slice(0, 5),
    })),
  )
  const [conflitos, setConflitos] = useState<ConflitoDeAgenda[] | null>(null)
  const [salvando, salvar] = useTransition()

  function enviar(confirmarConflitos = false) {
    aoAvisar(null)
    salvar(async () => {
      const r = await salvarDisponibilidadeDaAgenda({ faixas, confirmarConflitos })
      if (r.sucesso) {
        setConflitos(null)
        aoAvisar({ tom: 'ok', texto: r.mensagem })
        await aoSalvar()
        return
      }
      if ('conflitos' in r) {
        setConflitos(r.conflitos)
        aoAvisar({ tom: 'erro', texto: r.mensagem })
        return
      }
      aoAvisar({ tom: 'erro', texto: r.mensagem })
    })
  }

  const porDia = (dia: number) =>
    faixas
      .map((faixa, indice) => ({ faixa, indice }))
      .filter((item) => item.faixa.diaSemana === dia)

  return (
    <Cartao
      titulo="Minha disponibilidade"
      descricao="Os horários em que você aceita consultorias. Dois blocos no mesmo dia criam o intervalo entre eles."
      acao={
        <button
          type="button"
          onClick={() => enviar(false)}
          disabled={salvando}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Salvar horários
        </button>
      }
    >
      <div className="space-y-3">
        {DIAS_DA_SEMANA.map((dia) => {
          const doDia = porDia(dia)
          return (
            <div
              key={dia}
              className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
            >
              <p className="w-full shrink-0 text-sm font-medium sm:w-36">
                {ROTULO_DIA_SEMANA[dia]}
              </p>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {doDia.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Sem atendimento</span>
                ) : (
                  doDia.map(({ faixa, indice }) => (
                    <div
                      key={indice}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5"
                    >
                      <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        type="time"
                        aria-label={`Início em ${ROTULO_DIA_SEMANA[dia]}`}
                        value={faixa.horaInicio}
                        onChange={(e) =>
                          setFaixas((atual) =>
                            atual.map((f, i) =>
                              i === indice ? { ...f, horaInicio: e.target.value } : f,
                            ),
                          )
                        }
                        className="bg-transparent text-sm focus-visible:outline-none"
                      />
                      <span aria-hidden className="text-muted-foreground">
                        –
                      </span>
                      <input
                        type="time"
                        aria-label={`Fim em ${ROTULO_DIA_SEMANA[dia]}`}
                        value={faixa.horaFim}
                        onChange={(e) =>
                          setFaixas((atual) =>
                            atual.map((f, i) =>
                              i === indice ? { ...f, horaFim: e.target.value } : f,
                            ),
                          )
                        }
                        className="bg-transparent text-sm focus-visible:outline-none"
                      />
                      <button
                        type="button"
                        aria-label={`Remover faixa de ${ROTULO_DIA_SEMANA[dia]}`}
                        onClick={() =>
                          setFaixas((atual) => atual.filter((_, i) => i !== indice))
                        }
                        className="ml-1 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() =>
                    setFaixas((atual) => [
                      ...atual,
                      {
                        diaSemana: dia,
                        horaInicio: HORA_PADRAO.inicio,
                        horaFim: HORA_PADRAO.fim,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Adicionar horário
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {conflitos ? (
        <PainelDeConflitos
          conflitos={conflitos}
          ocupado={salvando}
          aoCancelar={() => setConflitos(null)}
          aoConfirmar={() => enviar(true)}
        />
      ) : null}
    </Cartao>
  )
}

/**
 * As consultas que ficariam fora — mostradas antes de gravar.
 *
 * O texto é explícito sobre o que **não** vai acontecer: confirmar muda a
 * agenda e não desmarca ninguém. Sem isso, "confirmar" ao lado de uma lista de
 * clientes se parece perigosamente com "cancelar estas consultas".
 */
function PainelDeConflitos({
  conflitos,
  ocupado,
  aoCancelar,
  aoConfirmar,
}: {
  conflitos: ConflitoDeAgenda[]
  ocupado: boolean
  aoCancelar: () => void
  aoConfirmar: () => void
}) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
        Consultorias marcadas fora do novo horário
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {conflitos.map((c) => (
          <li key={c.consultaId} className="text-muted-foreground">
            {dataBR(c.data)} · {c.inicio} às {c.fim}
            {c.clienteNome ? ` · ${c.clienteNome}` : ''}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Elas continuam valendo e aparecem na sua agenda. Salvar aqui só muda os
        horários que ficam abertos para novas contratações — para desmarcar
        alguma, use o cancelamento no atendimento dela.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={aoCancelar}
          disabled={ocupado}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Rever horários
        </button>
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={ocupado}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          Salvar mesmo assim
        </button>
      </div>
    </div>
  )
}

/** Férias, viagem, licença: períodos inteiros fora do ar. */
function CartaoDeBloqueios({
  bloqueios,
  aoSalvar,
  aoAvisar,
}: {
  bloqueios: Bloqueio[]
  aoSalvar: () => Promise<void>
  aoAvisar: Aviso
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const [conflitos, setConflitos] = useState<ConflitoDeAgenda[] | null>(null)
  const [ocupado, agir] = useTransition()

  function criar(confirmarConflitos = false) {
    aoAvisar(null)
    agir(async () => {
      const r = await criarBloqueioDeAgenda({
        dataInicio: inicio,
        dataFim: fim || inicio,
        motivo: motivo || undefined,
        confirmarConflitos,
      })
      if (r.sucesso) {
        setAbrindo(false)
        setInicio('')
        setFim('')
        setMotivo('')
        setConflitos(null)
        aoAvisar({ tom: 'ok', texto: r.mensagem })
        await aoSalvar()
        return
      }
      if ('conflitos' in r) {
        setConflitos(r.conflitos)
        aoAvisar({ tom: 'erro', texto: r.mensagem })
        return
      }
      aoAvisar({ tom: 'erro', texto: r.mensagem })
    })
  }

  function remover(grupoId: string) {
    aoAvisar(null)
    agir(async () => {
      const r = await removerBloqueioDeAgenda(grupoId)
      aoAvisar({ tom: r.sucesso ? 'ok' : 'erro', texto: r.mensagem })
      if (r.sucesso) await aoSalvar()
    })
  }

  return (
    <Cartao
      titulo="Bloqueios"
      descricao="Períodos em que você não atende — férias, viagem, compromissos."
      acao={
        <button
          type="button"
          onClick={() => setAbrindo((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden />
          {abrindo ? 'Fechar' : 'Adicionar bloqueio'}
        </button>
      }
    >
      {abrindo ? (
        <div className="mb-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
          <Campo rotulo="De" htmlFor="bloq-inicio">
            <input
              id="bloq-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={entrada}
            />
          </Campo>
          <Campo rotulo="Até" htmlFor="bloq-fim">
            <input
              id="bloq-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className={entrada}
            />
          </Campo>
          <Campo rotulo="Motivo (opcional)" htmlFor="bloq-motivo">
            <input
              id="bloq-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={240}
              placeholder="Férias"
              className={entrada}
            />
          </Campo>
          <div className="sm:col-span-3">
            <button
              type="button"
              onClick={() => criar(false)}
              disabled={ocupado || !inicio}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Bloquear período
            </button>
          </div>
          {conflitos ? (
            <div className="sm:col-span-3">
              <PainelDeConflitos
                conflitos={conflitos}
                ocupado={ocupado}
                aoCancelar={() => setConflitos(null)}
                aoConfirmar={() => criar(true)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {bloqueios.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarOff className="size-4 shrink-0" aria-hidden />
          Nenhum bloqueio cadastrado.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {bloqueios.map((b) => (
            <li
              key={b.grupoId}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {b.dataInicio === b.dataFim
                    ? dataBR(b.dataInicio)
                    : `${dataBR(b.dataInicio)} a ${dataBR(b.dataFim)}`}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {b.dias === 1 ? '1 dia' : `${b.dias} dias`}
                  </span>
                </p>
                {b.motivo ? (
                  <p className="truncate text-sm text-muted-foreground">{b.motivo}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remover(b.grupoId)}
                disabled={ocupado}
                aria-label={`Remover bloqueio de ${dataBR(b.dataInicio)}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}
