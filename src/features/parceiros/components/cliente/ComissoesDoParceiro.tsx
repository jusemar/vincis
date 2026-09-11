'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  BadgeDollarSign,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Filter,
  HelpCircle,
  Info,
  Landmark,
  Receipt,
  Repeat,
  Search,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import {
  ROTULO_COMISSAO,
  ROTULO_TIPO_COMISSAO,
  STATUS_COMISSAO,
  TOM_COMISSAO,
  type StatusComissao,
} from '../../constants/comissao'
import { PERCENTUAL_AVULSO, percentualFormatado } from '../../constants/programa'
import {
  PRAZO_PAGAMENTO_SIMULADO,
  RECEBIMENTO_SIMULADO,
} from '../../constants/mock-financeiro'
import { ROTULO_SAQUE, TOM_SAQUE } from '../../constants/saque'
import { solicitarSaque } from '../../actions/solicitar-saque'
import { rotuloDaReferencia } from '../../constants/prazo'
import type {
  ComissaoDoParceiro,
  ResumoDeComissoes,
  SaqueDoParceiro,
} from '../../queries/listar-comissoes'
import { toast } from 'sonner'
import { NumeroAnimado } from './NumeroAnimado'

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const reais = (centavos: number) => MOEDA.format(centavos / 100)

/**
 * As faixas da barra de composição.
 *
 * As cores saem dos tokens semânticos da plataforma, e não de uma paleta
 * própria desta tela: é o que faz a barra continuar legível quando o tema
 * muda, sem nenhuma regra de tema aqui dentro.
 */
const FAIXAS: { status: StatusComissao; barra: string; ponto: string }[] = [
  { status: 'disponivel', barra: 'bg-success', ponto: 'bg-success' },
  { status: 'gerada', barra: 'bg-info', ponto: 'bg-info' },
  { status: 'paga', barra: 'bg-primary', ponto: 'bg-primary' },
  { status: 'cancelada', barra: 'bg-muted-foreground/50', ponto: 'bg-muted-foreground/50' },
]

const FLUXO = [
  { rotulo: 'Negócio', icone: Briefcase },
  { rotulo: 'Comissão gerada', icone: Receipt },
  { rotulo: 'Comissão disponível', icone: CheckCircle2 },
  { rotulo: 'Saldo disponível', icone: Wallet },
  { rotulo: 'Solicitação de saque', icone: Wallet },
  { rotulo: 'Pagamento', icone: Landmark },
]

const GLOSSARIO: { status: StatusComissao; texto: string }[] = [
  {
    status: 'gerada',
    texto: 'A contratação já criou a comissão, mas ela aguarda a conclusão do serviço.',
  },
  {
    status: 'disponivel',
    texto: 'O serviço foi concluído e a comissão está liberada para saque.',
  },
  { status: 'paga', texto: 'O valor já foi transferido para você.' },
  {
    status: 'cancelada',
    texto: 'A comissão perdeu o direito à liberação e não será paga.',
  },
]

const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'tudo', rotulo: 'Todo o período' },
] as const

function Cartao({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border bg-card', className)}>{children}</div>
  )
}

/**
 * Um número grande da área financeira.
 *
 * O ícone ganha um fundo suave do próprio token, em vez do gradiente da
 * referência: gradiente fixo escurece no tema claro e some no escuro, e esta
 * tela precisa dos dois.
 */
function Indicador({
  icone: Icone,
  rotulo,
  valorCentavos,
  texto,
  dica,
  tom = 'primary',
}: {
  icone: typeof Wallet
  rotulo: string
  valorCentavos?: number
  texto?: string
  dica: string
  tom?: 'primary' | 'success' | 'info' | 'muted'
}) {
  const fundo = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
    muted: 'bg-muted text-muted-foreground',
  }[tom]

  return (
    <Cartao className="p-5">
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl',
          fundo,
        )}
      >
        <Icone className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1 font-serif text-2xl font-semibold tracking-tight tabular-nums">
        {texto ?? (
          <NumeroAnimado valor={(valorCentavos ?? 0) / 100} prefixo="R$ " casas={2} />
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{dica}</p>
    </Cartao>
  )
}

/** "Mês 2 (11/10–10/11)": o mês da assinatura que gerou a comissão recorrente. */
function rotuloDaCompetencia(competencia: {
  numero: number
  inicio: string | null
  fim: string | null
}): string {
  const base = `Mês ${competencia.numero}`
  if (!competencia.inicio || !competencia.fim) return base
  const curta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`
  return `${base} (${curta(competencia.inicio)}–${curta(competencia.fim)})`
}

/**
 * A área financeira do parceiro.
 *
 * ## Real e simulado, separados à vista
 *
 * Tudo que é dinheiro **gerado** vem de `parceiro_comissoes`: os seis
 * indicadores, a composição, a lista e os filtros. O que ainda não tem backend
 * — saldo sacável, método de recebimento e histórico de saques — vem de
 * `constants/mock-financeiro` e carrega o aviso de simulação no próprio bloco.
 * Nenhum valor simulado entra em soma com valor real; se entrasse, o parceiro
 * leria um saldo que a plataforma não deve a ele.
 *
 * ## Por que os totais não são recalculados aqui
 *
 * Eles chegam somados do servidor, sobre as mesmas linhas listadas. Duas contas
 * para o mesmo número acabam divergindo em um centavo, e um centavo de
 * diferença numa tela financeira é um chamado de suporte.
 *
 * ## Tema
 *
 * Só tokens semânticos — `card`, `muted`, `primary`, `success`, `info`. A
 * referência visual usava vidro escuro e cores fixas, que no tema claro viram
 * manchas cinzas; aqui a mesma hierarquia é obtida com borda, superfície e
 * peso tipográfico, e por isso a tela funciona nos dois temas sem nenhuma
 * condicional de tema no código.
 */
export function ComissoesDoParceiro({
  comissoes,
  resumo,
  saques,
}: {
  comissoes: ComissaoDoParceiro[]
  resumo: ResumoDeComissoes
  saques: SaqueDoParceiro[]
}) {
  const [aba, setAba] = useState<'todas' | StatusComissao>('todas')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [periodo, setPeriodo] = useState<string>('tudo')
  const [pedindo, comecarPedido] = useTransition()

  /*
    O botão obedece ao saldo **livre**, não ao disponível.

    Comissão liberada que já está num pedido continua `disponivel` — ela não foi
    paga —, mas não pode sustentar um segundo saque. Quem manda no botão é o que
    sobrou; o servidor confere de novo e o índice único decide a corrida.
  */
  const podeSacar = resumo.livreCentavos > 0

  function pedirSaque() {
    comecarPedido(async () => {
      const resultado = await solicitarSaque()
      if (resultado.sucesso) toast.success(resultado.mensagem)
      else toast.error(resultado.mensagem)
    })
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const limite = (() => {
      const agora = new Date()
      if (periodo === '30') return new Date(agora.getTime() - 30 * 864e5)
      if (periodo === '90') return new Date(agora.getTime() - 90 * 864e5)
      if (periodo === 'ano') return new Date(agora.getFullYear(), 0, 1)
      return null
    })()

    return comissoes.filter((comissao) => {
      if (aba !== 'todas' && comissao.status !== aba) return false
      if (tipo === 'avulsa' && comissao.tipo !== 'avulso') return false
      if (tipo === 'recorrente' && comissao.tipo !== 'recorrente') return false
      if (limite && comissao.geradaEm < limite) return false
      if (!termo) return true
      return [
        comissao.servico,
        comissao.clienteNome,
        comissao.profissionalNome,
        comissao.profissionalCodigo,
      ].some((campo) => campo?.toLowerCase().includes(termo))
    })
  }, [comissoes, aba, busca, tipo, periodo])

  const baseDaBarra =
    resumo.totalCentavos + resumo.canceladaCentavos || 1

  const valorDaFaixa: Record<StatusComissao, number> = {
    disponivel: resumo.disponivelCentavos,
    gerada: resumo.geradaCentavos,
    paga: resumo.pagaCentavos,
    cancelada: resumo.canceladaCentavos,
  }

  return (
    <div className="space-y-6">
      {/*
        Sem título próprio: `CabecalhoSecao` já abre a seção com contexto,
        título e descrição. Repetir aqui daria dois cabeçalhos na mesma tela.
      */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" disabled>
            <Download className="size-4" aria-hidden />
            Extrato
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={pedirSaque}
            disabled={!podeSacar || pedindo}
          >
            <Wallet className="size-4" aria-hidden />
            {pedindo ? 'Solicitando…' : 'Solicitar saque'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Indicador
          icone={BadgeDollarSign}
          tom="primary"
          rotulo="Comissões geradas"
          valorCentavos={resumo.totalCentavos}
          dica={`${resumo.negocios} negócio(s) com comissão`}
        />
        <Indicador
          icone={Clock}
          tom="info"
          rotulo="Aguardando conclusão"
          valorCentavos={resumo.geradaCentavos}
          dica="Liberado após o serviço concluir"
        />
        <Indicador
          icone={Wallet}
          tom="success"
          rotulo="Disponível"
          valorCentavos={resumo.disponivelCentavos}
          dica="Serviço concluído, comissão liberada"
        />
        <Indicador
          icone={CheckCircle2}
          tom="primary"
          rotulo="Total já pago"
          valorCentavos={resumo.pagaCentavos}
          dica="Transferências concluídas"
        />
        <Indicador
          icone={XCircle}
          tom="muted"
          rotulo="Canceladas"
          valorCentavos={resumo.canceladaCentavos}
          dica="Sem direito à liberação"
        />
        <Indicador
          icone={Briefcase}
          tom="primary"
          rotulo="Negócios com comissão"
          texto={String(resumo.negocios)}
          dica="Somente contratações efetivas"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Composição das comissões</p>
            <p className="text-[11px] text-muted-foreground">
              Serviços avulsos: comissão fixa de{' '}
              {percentualFormatado(PERCENTUAL_AVULSO)}
            </p>
          </div>

          <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {FAIXAS.map((faixa) => (
              <div
                key={faixa.status}
                className={faixa.barra}
                style={{
                  width: `${(valorDaFaixa[faixa.status] / baseDaBarra) * 100}%`,
                }}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FAIXAS.map((faixa) => (
              <div key={faixa.status} className="rounded-xl border bg-muted/30 px-3 py-2.5">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn('size-2 rounded-full', faixa.ponto)} />
                  {ROTULO_COMISSAO[faixa.status]}
                </p>
                <p className="mt-1 font-serif text-base tabular-nums">
                  {reais(valorDaFaixa[faixa.status])}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t pt-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Fluxo financeiro
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {FLUXO.map((etapa, indice) => (
                <div key={etapa.rotulo} className="flex items-center gap-2">
                  <span className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
                    <etapa.icone className="size-3.5 text-primary" aria-hidden />
                    {etapa.rotulo}
                  </span>
                  {indice < FLUXO.length - 1 ? (
                    <ChevronRight
                      className="size-3.5 text-muted-foreground/60"
                      aria-hidden
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Cartao>

        {/* Bloco simulado: saque depende de pagamento ao parceiro, que não existe. */}
        <Cartao className="flex flex-col p-6">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden />
            Saque
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Disponível agora
          </p>
          <p className="mt-1 font-serif text-3xl font-semibold tracking-tight tabular-nums">
            {reais(resumo.livreCentavos)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reais(resumo.geradaCentavos)} aguardando conclusão
          </p>
          {resumo.reservadoCentavos > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {reais(resumo.reservadoCentavos)} reservados em saques solicitados
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border bg-muted/30 px-3.5 py-3">
            <p className="text-[11px] text-muted-foreground">
              Método de recebimento
            </p>
            <p className="mt-1 truncate text-sm">
              {RECEBIMENTO_SIMULADO.descricao}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {RECEBIMENTO_SIMULADO.titular}
            </p>
          </div>

          <Button
            className="mt-4 w-full"
            onClick={pedirSaque}
            disabled={!podeSacar || pedindo}
          >
            {pedindo ? 'Solicitando…' : 'Solicitar saque'}
          </Button>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            {PRAZO_PAGAMENTO_SIMULADO} O pagamento é processado pela Vincis; o
            método de recebimento acima ainda é de demonstração.
          </p>
        </Cartao>
      </div>

      <Cartao className="overflow-hidden">
        <div className="space-y-4 border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Histórico de comissões</p>
              <p className="text-[11px] text-muted-foreground">
                Cada valor com serviço, cliente, profissional e percentual
                aplicado
              </p>
            </div>
            <p className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <Filter className="size-3.5" aria-hidden />
              {filtradas.length} registro(s)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['todas', ...STATUS_COMISSAO] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setAba(opcao)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-colors',
                  aba === opcao
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {opcao === 'todas' ? 'Todas' : ROTULO_COMISSAO[opcao]}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative min-w-0">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Cliente, profissional, serviço ou PRO-XXXXXX"
                className="pl-9"
                aria-label="Buscar comissões"
              />
            </div>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="sm:w-44" aria-label="Tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="avulsa">Avulsa</SelectItem>
                <SelectItem value="recorrente">Recorrente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="sm:w-44" aria-label="Período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((opcao) => (
                  <SelectItem key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtradas.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {comissoes.length === 0
              ? 'Quando alguém que você indicou contratar um serviço, a comissão daquele negócio aparece aqui.'
              : 'Nenhuma comissão encontrada com esses filtros.'}
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {[
                      'Serviço / Cliente',
                      'Profissional',
                      'Valor do serviço',
                      '%',
                      'Comissão',
                      'Tipo',
                      'Data',
                      'Status',
                    ].map((coluna) => (
                      <th
                        key={coluna}
                        className="whitespace-nowrap px-5 py-3 text-left font-normal"
                      >
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((comissao) => (
                    <tr key={comissao.id} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <p className="font-medium">
                          {comissao.servico ?? 'Serviço'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {comissao.clienteNome}
                          {comissao.competencia
                            ? ` · ${rotuloDaCompetencia(comissao.competencia)}`
                            : ''}
                          {comissao.categoria
                            ? ` · ${rotuloDaReferencia(comissao.categoria)}`
                            : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p>{comissao.profissionalNome ?? '—'}</p>
                        {comissao.profissionalCodigo ? (
                          <p className="font-mono text-xs text-muted-foreground">
                            {comissao.profissionalCodigo}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 tabular-nums">
                        {reais(comissao.valorBaseCentavos)}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
                        {percentualFormatado(comissao.percentual)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-serif font-semibold tabular-nums text-primary">
                        {reais(comissao.valorCentavos)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {ROTULO_TIPO_COMISSAO[comissao.tipo]}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-muted-foreground">
                        {DIA.format(comissao.geradaEm)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Pilula
                          rotulo={ROTULO_COMISSAO[comissao.status]}
                          tom={TOM_COMISSAO[comissao.status]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y lg:hidden">
              {filtradas.map((comissao) => (
                <li key={comissao.id} className="space-y-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {comissao.servico ?? 'Serviço'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {comissao.clienteNome}
                        {comissao.competencia
                          ? ` · ${rotuloDaCompetencia(comissao.competencia)}`
                          : ''}
                      </p>
                    </div>
                    <Pilula
                      rotulo={ROTULO_COMISSAO[comissao.status]}
                      tom={TOM_COMISSAO[comissao.status]}
                    />
                  </div>
                  {comissao.profissionalNome ? (
                    <p className="text-xs text-muted-foreground">
                      {comissao.profissionalNome}
                      {comissao.profissionalCodigo ? (
                        <span className="font-mono">
                          {' '}
                          · {comissao.profissionalCodigo}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      Serviço {reais(comissao.valorBaseCentavos)}
                    </span>
                    <span className="tabular-nums">
                      {percentualFormatado(comissao.percentual)}
                    </span>
                    <span className="tabular-nums">
                      {DIA.format(comissao.geradaEm)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="size-3" aria-hidden />
                      {ROTULO_TIPO_COMISSAO[comissao.tipo]}
                    </span>
                    <span className="ml-auto font-serif font-semibold tabular-nums text-primary">
                      {reais(comissao.valorCentavos)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao className="p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Histórico de saques</p>
            <p className="text-[11px] text-muted-foreground">
              {saques.length} solicitação(ões)
            </p>
          </div>
          {saques.length === 0 ? (
            <p className="mt-4 rounded-xl border bg-muted/30 px-3.5 py-6 text-center text-xs text-muted-foreground">
              Nenhum saque solicitado ainda. Quando houver saldo disponível, o
              pedido aparece aqui.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {saques.map((saque) => (
                <li
                  key={saque.id}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      Solicitação {saque.id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {DIA.format(saque.solicitadoEm)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-serif font-semibold tabular-nums">
                      {reais(saque.valorCentavos)}
                    </p>
                    <Pilula
                      rotulo={ROTULO_SAQUE[saque.status]}
                      tom={TOM_SAQUE[saque.status]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Solicitar reserva o valor; o pagamento é registrado pela Vincis numa
            etapa seguinte.
          </p>
        </Cartao>

        <Cartao className="p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="size-4 text-primary" aria-hidden />O que
            significa cada status
          </p>
          <ul className="mt-4 space-y-2.5">
            {GLOSSARIO.map((item) => (
              <li
                key={item.status}
                className="flex items-start gap-3 rounded-xl border bg-muted/30 px-3.5 py-3"
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    FAIXAS.find((faixa) => faixa.status === item.status)?.ponto,
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm">{ROTULO_COMISSAO[item.status]}</p>
                  <p className="text-xs text-muted-foreground">{item.texto}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3 text-xs text-muted-foreground">
            Serviços avulsos geram comissão fixa de{' '}
            <span className="font-medium text-primary">
              {percentualFormatado(PERCENTUAL_AVULSO)}
            </span>{' '}
            sobre o valor do serviço. A comissão sai da parte da Vincis e não
            reduz o valor do profissional.
          </p>
        </Cartao>
      </div>
    </div>
  )
}
