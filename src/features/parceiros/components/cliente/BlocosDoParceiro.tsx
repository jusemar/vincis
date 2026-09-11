import {
  ArrowUpRight,
  BadgeDollarSign,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Instagram,
  MessageCircle,
  Play,
  QrCode,
  Repeat,
  Share2,
  Target,
  TrendingUp,
  Trophy,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import { cn } from '@/lib/utils'
import type { LinkDoParceiro } from '../../lib/link-de-indicacao'
import { AtivarParceiro } from './AtivarParceiro'
import {
  ACADEMIA,
  CAMPANHAS,
  COMUNIDADE,
  CUPOM_PARCEIRO,
  FUNIL,
  LINK_INDICACAO,
  MATERIAIS,
  MEDIAS_HIBRIDO,
  PREVISAO_RENDA,
  RANKING,
} from '../../constants/mock-painel'
import {
  PERCENTUAL_AVULSO,
  formatarPercentualCentesimos,
  percentualFormatado,
} from '../../constants/programa'
import type { SituacaoDeNivel } from '../../lib/niveis'
import { BotaoCopiar } from './BotaoCopiar'

/**
 * Os blocos sem estado do Painel do Parceiro.
 *
 * Todos são componentes de **servidor**: nenhum tem interação própria, e por
 * isso não precisam atravessar para o navegador — o mesmo desenho que o resto
 * da Área do Cliente já segue. A única exceção é o botão de copiar, que é
 * cliente por natureza e entra como filho.
 *
 * O conteúdo é de demonstração e vive todo em `constants/mock-painel`. Nada
 * aqui consulta banco, calcula comissão ou registra clique.
 */

/** Cabeçalho padrão de bloco: sobrenome pequeno em cima, título embaixo. */
function CabecalhoDeBloco({
  contexto,
  titulo,
  acao,
  icone: Icone,
}: {
  contexto: string
  titulo: string
  acao?: React.ReactNode
  icone?: LucideIcon
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {contexto}
        </p>
        <p className="mt-1 flex items-center gap-2 font-serif text-lg font-semibold">
          {Icone ? <Icone className="size-4 text-primary" aria-hidden /> : null}
          {titulo}
        </p>
      </div>
      {acao}
    </div>
  )
}

/* ------------------------------ sistema híbrido ------------------------------ */

export function SistemaHibrido({
  situacao = null,
}: {
  /** Os percentuais recorrentes vêm da configuração publicada. */
  situacao?: SituacaoDeNivel | null
} = {}) {
  const percentuais = situacao?.niveis.map((nivel) => nivel.percentualCentesimos) ?? []
  const faixa = percentuais.length
    ? Math.min(...percentuais) === Math.max(...percentuais)
      ? formatarPercentualCentesimos(percentuais[0])
      : `${formatarPercentualCentesimos(Math.min(...percentuais))}–${formatarPercentualCentesimos(Math.max(...percentuais))}`
    : '—'
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Sistema híbrido"
        titulo="Como você ganha na Vincis"
        acao={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Detalhes
            <ChevronRight className="size-3" aria-hidden />
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <article className="relative overflow-hidden rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 65%)' }}
          />
          <div className="relative">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Zap className="size-3.5" aria-hidden /> Recompensa rápida
            </p>
            <p className="mt-2 font-serif text-lg font-semibold">Serviços avulsos</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-serif text-4xl font-bold text-primary">
                {percentualFormatado(PERCENTUAL_AVULSO)}
              </span>
              <span className="text-xs text-muted-foreground">fixo por venda</span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Comissão imediata em consultorias, projetos pontuais e serviços únicos.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <BadgeDollarSign className="size-4 text-primary" aria-hidden />
              Média parceiros Ouro:{' '}
              <span className="font-medium text-foreground">{MEDIAS_HIBRIDO.avulso}</span>
            </p>
          </div>
        </article>

        <article className="relative overflow-hidden rounded-xl border border-info/30 bg-info/5 p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, hsl(var(--info) / 0.28), transparent 65%)' }}
          />
          <div className="relative">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-info">
              <Repeat className="size-3.5" aria-hidden /> Renda recorrente
            </p>
            <p className="mt-2 font-serif text-lg font-semibold">Planos recorrentes</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="whitespace-nowrap font-serif text-4xl font-bold text-info">
                {faixa}
              </span>
              <span className="text-xs text-muted-foreground">
                todo mês enquanto elegível
              </span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Cada cliente recorrente paga sua comissão mês após mês. O percentual
              acompanha o seu nível.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-4 text-info" aria-hidden />
              Sua projeção em 12m:{' '}
              <span className="font-medium text-foreground">
                {MEDIAS_HIBRIDO.recorrente}
              </span>
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}

/* ---------------------------------- cupom ---------------------------------- */

export function CupomDoParceiro() {
  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cupom exclusivo
          </p>
          {CUPOM_PARCEIRO.ativo ? <Pilula rotulo="Ativo" tom="sucesso" /> : null}
        </div>

        <div className="relative mt-4 rounded-xl border-2 border-dashed border-primary/40 bg-background/60 p-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            cupom do parceiro
          </p>
          <p className="mt-1 font-serif text-3xl font-bold tracking-wider text-primary">
            {CUPOM_PARCEIRO.codigo}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {CUPOM_PARCEIRO.descricao}
          </p>
          <div className="absolute right-3 top-3">
            <BotaoCopiar
              texto={CUPOM_PARCEIRO.codigo}
              rotulo="Copiar cupom"
              size="icon"
              apenasIcone
            />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {CUPOM_PARCEIRO.metricas.map((metrica) => (
            <div key={metrica.rotulo} className="rounded-xl border bg-muted/30 p-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {metrica.rotulo}
              </dt>
              <dd className="mt-0.5 whitespace-nowrap font-serif text-lg font-semibold tabular-nums">
                {metrica.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* ------------------------------ previsão de renda ---------------------------- */

export function PrevisaoDeRenda() {
  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 size-72 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--info) / 0.2), transparent 65%)' }}
      />
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Previsão de renda
        </p>
        <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight">
          Com{' '}
          <span className="text-info">{PREVISAO_RENDA.clientesAlvo} clientes ativos</span>
          , sua recorrência será de{' '}
          <span className="text-primary">
            {PREVISAO_RENDA.valorAlvo.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
            })}
            /mês
          </span>
          .
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Projeção baseada no seu ticket médio e na taxa de retenção atual de{' '}
          {PREVISAO_RENDA.retencao}%.
        </p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {PREVISAO_RENDA.marcos.map((marco) => (
            <div
              key={marco.rotulo}
              className={cn(
                'rounded-xl border p-4',
                'destaque' in marco && marco.destaque
                  ? 'border-primary/40 bg-primary/5'
                  : 'bg-muted/30',
              )}
            >
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {marco.rotulo}
              </dt>
              <dd
                className={cn(
                  'mt-1 font-serif text-xl font-semibold tabular-nums',
                  'destaque' in marco && marco.destaque && 'text-primary',
                )}
              >
                {marco.valor.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 0,
                })}
              </dd>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {marco.clientes} clientes ativos
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* ---------------------------- link de indicação ----------------------------- */

/**
 * QR de demonstração.
 *
 * É um desenho determinístico — não codifica endereço nenhum, e não deve ser
 * lido por leitor de código. Quando o rastreamento existir, aqui entra um QR
 * real gerado a partir do link do parceiro.
 */
function QrDemonstrativo() {
  const celulas = Array.from({ length: 64 }, (_, i) => {
    const borda = i < 8 || i > 55 || i % 8 === 0 || i % 8 === 7
    return borda || (i * 7 + (i % 3)) % 3 === 0
  })

  return (
    <div
      aria-hidden
      className="grid size-24 shrink-0 grid-cols-8 grid-rows-8 gap-px rounded-xl border bg-background p-2"
    >
      {celulas.map((preenchida, i) => (
        <span
          key={i}
          className={cn('rounded-[1px]', preenchida ? 'bg-foreground' : 'bg-transparent')}
        />
      ))}
    </div>
  )
}

/**
 * O link de indicação — o único dado real desta tela.
 *
 * `link` vem do banco, pelo código do parceiro. Quando é `null`, a conta ainda
 * não ativou o programa e o card oferece a ativação no lugar do endereço: o
 * bloco é o mesmo, o desenho é o mesmo, muda o que cabe dentro dele.
 *
 * As visitas continuam vindo do mock, como todo o resto do painel — medir
 * acesso é a próxima fatia, e inventar um número real seria pior do que exibir
 * um declaradamente demonstrativo, que é o que o rodapé da tela já avisa.
 */
export function LinkDeIndicacao({ link }: { link: LinkDoParceiro | null }) {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Link de indicação
        </p>
        <Share2 className="size-4 text-primary" aria-hidden />
      </div>

      {link === null ? (
        <AtivarParceiro />
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {link.base}
              <span className="text-primary">{link.codigo}</span>
            </span>
            <BotaoCopiar texto={link.url} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <QrDemonstrativo />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Visitas (30d)</p>
              <p className="font-serif text-2xl font-semibold tabular-nums">
                {LINK_INDICACAO.visitas30d.toLocaleString('pt-BR')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm">Compartilhar</Button>
                <Button size="icon-sm" variant="outline" aria-label="Ver QR Code">
                  <QrCode className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/* --------------------------------- campanhas -------------------------------- */

export function CampanhasAtivas() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Campanhas ativas"
        titulo="Acelere seu crescimento"
        acao={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Ver todas
            <ChevronRight className="size-3" aria-hidden />
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPANHAS.map((campanha) => (
          <article
            key={campanha.titulo}
            className="relative rounded-xl border bg-muted/30 p-4 transition-colors hover:border-primary/30"
          >
            {campanha.destaque ? (
              <span className="absolute right-3 top-3">
                <Pilula rotulo="Em alta" tom="atencao" />
              </span>
            ) : null}
            <p className="pr-24 font-serif font-semibold">{campanha.titulo}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {campanha.descricao}
            </p>
            <div
              className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={campanha.progresso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso da campanha ${campanha.titulo}`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${campanha.progresso}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{campanha.progresso}% concluído</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden /> {campanha.dias}d restantes
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ----------------------------------- funil ---------------------------------- */

export function FunilDeConversao() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Funil de conversão"
        titulo="Últimos 30 dias"
        acao={<Target className="size-4 text-info" aria-hidden />}
      />

      <div className="space-y-3">
        {FUNIL.map((etapa) => (
          <div key={etapa.etapa}>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">{etapa.etapa}</span>
              <span className="font-medium tabular-nums">
                {etapa.valor.toLocaleString('pt-BR')}
              </span>
            </div>
            <div
              className="h-9 overflow-hidden rounded-lg bg-muted"
              role="progressbar"
              aria-valuenow={etapa.percentual}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={etapa.etapa}
            >
              <div
                className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-primary/70 to-primary/20 pr-3 text-[11px] font-medium text-foreground"
                style={{ width: `${etapa.percentual}%` }}
              >
                {etapa.percentual}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------- ranking --------------------------------- */

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()
}

export function RankingSemanal() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Ranking semanal"
        titulo="Top parceiros"
        icone={Trophy}
      />

      <ol className="space-y-2">
        {RANKING.map((parceiro, indice) => (
          <li
            key={parceiro.nome}
            className={cn(
              'flex items-center gap-3 rounded-xl p-2.5 transition-colors',
              parceiro.voce
                ? 'border border-primary/30 bg-primary/5'
                : 'hover:bg-muted/40',
            )}
          >
            {/*
              O pódio tem diferenciação intencional: o primeiro em âmbar (a cor
              de destaque da casa), segundo e terceiro em texto forte, do quarto
              em diante no neutro. A posição continua legível em número — a cor
              reforça, não substitui.
            */}
            <span
              className={cn(
                'w-6 text-center font-serif text-sm font-bold tabular-nums',
                indice === 0
                  ? 'text-primary'
                  : indice <= 2
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {indice + 1}
            </span>
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                indice === 0
                  ? 'bg-primary text-primary-foreground'
                  : parceiro.voce
                    ? 'bg-info/15 text-info'
                    : indice <= 2
                      ? 'bg-muted text-foreground'
                      : 'bg-muted text-muted-foreground',
              )}
            >
              {iniciais(parceiro.nome)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {parceiro.nome}
                {parceiro.voce && parceiro.nome !== 'Você' ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    você
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {parceiro.cidade}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums">
                {parceiro.valor.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 0,
                })}
              </p>
              <p className="flex items-center justify-end gap-0.5 text-[11px] text-success">
                <ArrowUpRight className="size-3" aria-hidden />+{parceiro.crescimento}%
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* -------------------------------- comunidade -------------------------------- */

export function ComunidadeVincis() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Comunidade Vincis
          </p>
          <p className="mt-1 font-serif text-lg font-semibold">Networking ao vivo</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-success">
          <span aria-hidden className="size-1.5 rounded-full bg-success" />
          {COMUNIDADE.online} online
        </span>
      </div>

      <div className="mb-4 flex -space-x-2">
        {COMUNIDADE.iniciais.map((letras) => (
          <span
            key={letras}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-card"
          >
            {letras}
          </span>
        ))}
        <span className="flex size-9 items-center justify-center rounded-full bg-muted/60 text-[11px] text-muted-foreground ring-2 ring-card">
          +{COMUNIDADE.restantes}
        </span>
      </div>

      <ul className="space-y-2.5">
        {COMUNIDADE.atividade.map((item) => (
          <li
            key={item.nome}
            className="flex items-start gap-2 rounded-lg p-2 text-xs transition-colors hover:bg-muted/40"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
              {iniciais(item.nome)}
            </span>
            <div className="min-w-0 flex-1">
              <p>
                <span className="font-medium">{item.nome}</span>{' '}
                <span className="text-muted-foreground">{item.texto}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">{item.quando}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --------------------------------- academia --------------------------------- */

export function AcademiaVincis() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Academia Vincis"
        titulo="Continue aprendendo"
        icone={GraduationCap}
      />

      <ul className="space-y-3">
        {ACADEMIA.map((curso) => (
          <li
            key={curso.titulo}
            className="rounded-xl border bg-muted/30 p-3 transition-colors hover:border-primary/30"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Play className="size-5 fill-current" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{curso.titulo}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {curso.detalhe}
                </p>
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={curso.progresso}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progresso em ${curso.titulo}`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${curso.progresso}%` }}
                  />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --------------------------------- materiais -------------------------------- */

const ICONE_DO_MATERIAL: Record<string, LucideIcon> = {
  instagram: Instagram,
  whatsapp: MessageCircle,
  banners: ImageIcon,
  reels: Video,
  ebook: FileText,
}

export function MateriaisDeDivulgacao() {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <CabecalhoDeBloco
        contexto="Materiais de divulgação"
        titulo="Pronto para postar"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {MATERIAIS.map((material) => {
          const Icone = ICONE_DO_MATERIAL[material.id] ?? FileText
          return (
            <article
              key={material.id}
              className="rounded-xl border bg-muted/30 p-4 transition-colors hover:border-primary/30"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icone className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium">{material.nome}</p>
              <p className="text-[11px] text-muted-foreground">{material.tipo}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" className="px-2 text-[11px]">
                  <Play className="size-3" aria-hidden /> Preview
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`Baixar ${material.nome}`}
                >
                  <Download className="size-3" aria-hidden />
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
