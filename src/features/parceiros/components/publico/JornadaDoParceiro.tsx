'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Link2,
  MousePointer2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Send,
  Smartphone,
  User,
  UserPlus,
  Wallet,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { DIAS_COOKIE_INDICACAO } from '../../constants/indicacao'
import { PERCENTUAL_AVULSO } from '../../constants/programa'

/**
 * "Como funciona": a parceria contada em seis cenas.
 *
 * Cada cena mostra o fato acontecendo — o clique que ativa o link, a mensagem
 * levando o link, o cliente chegando, a contratação paga, a comissão sendo
 * liberada, o pedido de saque — com um texto curto do que aconteceu e da regra
 * que vale ali. Toca sozinha (pausa ao interagir) e pode ser repetida.
 *
 * Os valores e códigos dentro das cenas são **ilustrativos** — a legenda diz.
 * Os percentuais vêm da configuração publicada (recorrente) e da regra fixa do
 * avulso; nenhum número de resultado é inventado.
 *
 * Acessibilidade: as etapas são botões (setas do teclado navegam), o texto da
 * etapa atual é anunciado (`aria-live`), as cenas são decorativas para leitor
 * de tela (o texto as descreve) e, com `prefers-reduced-motion`, não há
 * reprodução automática nem movimento — só a troca de cena.
 */

const DURACAO_ETAPA_MS = 6500

type Etapa = { titulo: string; resumo: string; detalhe: string }

function etapas(faixaRecorrente: string): Etapa[] {
  return [
    {
      titulo: 'Você se torna parceiro',
      resumo: 'Com sua conta na Vincis, você ativa o programa e recebe seu link de indicação.',
      detalhe: 'A ativação é gratuita e imediata — sem análise e sem mensalidade.',
    },
    {
      titulo: 'Você compartilha seu link',
      resumo: 'Envie o link para quem precisa de contabilidade ou apoio jurídico: mensagem, rede social, e-mail.',
      detalhe: 'Indicar é apresentar a Vincis. Você não presta o serviço.',
    },
    {
      titulo: 'A pessoa conhece a Vincis',
      resumo: 'Quem clica no link chega à Vincis e cria a conta dela. A indicação fica registrada para você.',
      detalhe: `Vale para conta nova, criada depois do clique. O link fica guardado no navegador por até ${DIAS_COOKIE_INDICACAO} dias.`,
    },
    {
      titulo: 'O cliente contrata',
      resumo: 'A contratação acontece na própria Vincis — um plano contábil ou um serviço do catálogo — e é paga por Pix.',
      detalhe: 'Sem contratação paga pela plataforma, não há comissão.',
    },
    {
      titulo: 'Sua comissão é gerada',
      resumo: `Plano: a cada mês prestado e pago, comissão de ${faixaRecorrente}, conforme seu nível. Serviço avulso: ${PERCENTUAL_AVULSO}% do valor.`,
      detalhe: 'Avulsa é liberada quando o serviço é concluído. Cancelamento, estorno ou pagamento não confirmado não geram comissão.',
    },
    {
      titulo: 'Você acompanha e pede o saque',
      resumo: 'No painel, você vê indicações e comissões. Com saldo disponível e chave Pix cadastrada, solicita o saque.',
      detalhe: 'A Vincis faz o Pix para a sua chave e registra o pagamento no painel.',
    },
  ]
}

/* ------------------------------ peças das cenas ----------------------------- */

function Pessoa({ rotulo, tom = 'primario' }: { rotulo: string; tom?: 'primario' | 'neutro' }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'grid size-12 place-items-center rounded-full shadow-sm sm:size-14',
          tom === 'primario' ? 'bg-gradient-gold text-on-primary' : 'border border-border bg-card text-foreground',
        )}
      >
        <User className="size-6" />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">{rotulo}</span>
    </div>
  )
}

function Janela({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full max-w-[17rem] overflow-hidden rounded-2xl border border-border bg-card shadow-lg', className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className="size-2 rounded-full bg-red-400/70" />
        <span className="size-2 rounded-full bg-amber-400/70" />
        <span className="size-2 rounded-full bg-emerald-400/70" />
        <span className="ml-2 truncate text-[10px] text-muted-foreground">{titulo}</span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  )
}

/** Uma linha tracejada com um ponto viajando — a "conexão" entre as partes. */
function Conexao({ movimento, vertical = false }: { movimento: boolean; vertical?: boolean }) {
  return (
    <div className={cn('relative shrink-0', vertical ? 'h-8 w-px' : 'h-px w-10 sm:w-16')} aria-hidden="true">
      <div className={cn('absolute border-dashed border-primary/50', vertical ? 'inset-y-0 left-0 border-l' : 'inset-x-0 top-0 border-t')} />
      {movimento && (
        <motion.span
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-glow"
          style={vertical ? { left: 0 } : { top: 0 }}
          initial={vertical ? { top: '0%' } : { left: '0%' }}
          animate={vertical ? { top: ['0%', '100%'] } : { left: ['0%', '100%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

function Cursor({ movimento, de, para, atraso = 0.6 }: { movimento: boolean; de: { x: number; y: number }; para: { x: number; y: number }; atraso?: number }) {
  if (!movimento) return null
  return (
    <motion.span
      className="pointer-events-none absolute z-10 text-foreground drop-shadow"
      initial={{ x: de.x, y: de.y, opacity: 0 }}
      animate={{ x: para.x, y: para.y, opacity: [0, 1, 1, 0.9] }}
      transition={{ duration: 1.1, delay: atraso, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      <MousePointer2 className="size-5 fill-background" />
    </motion.span>
  )
}

function Etiqueta({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'ok' | 'alerta' | 'info' }) {
  const tons = {
    neutro: 'border-border bg-muted/50 text-muted-foreground',
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    alerta: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    info: 'border-primary/30 bg-primary/10 text-foreground',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', tons[tom])}>{children}</span>
}

/* --------------------------------- as cenas -------------------------------- */

function Aparece({ atraso = 0, children, className }: { atraso?: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: atraso }}>
      {children}
    </motion.div>
  )
}

function CenaAtivar({ movimento }: { movimento: boolean }) {
  const [ativo, setAtivo] = useState(!movimento)
  useEffect(() => {
    if (!movimento) return
    const t = setTimeout(() => setAtivo(true), 1900)
    return () => clearTimeout(t)
  }, [movimento])
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      <Pessoa rotulo="Você" />
      <Conexao movimento={movimento} />
      <div className="relative">
        <Janela titulo="vincis.com.br · Sua área">
          <div className="text-[11px] font-semibold text-foreground">Programa de Parceiros</div>
          <AnimatePresence mode="wait" initial={false}>
            {ativo ? (
              <motion.div key="ativo" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 space-y-2">
                <Etiqueta tom="ok"><BadgeCheck className="size-3" /> Link ativo</Etiqueta>
                <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-[10px] text-foreground">
                  <Link2 className="size-3 shrink-0 text-primary" /> vincis.com.br/p/SEULINK
                </div>
              </motion.div>
            ) : (
              <motion.div key="inativo" exit={{ opacity: 0 }} className="mt-3">
                <span className="inline-flex rounded-lg bg-gradient-gold px-3 py-1.5 text-[11px] font-semibold text-on-primary">Ativar meu link</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Janela>
        <Cursor movimento={movimento} de={{ x: 200, y: 120 }} para={{ x: 60, y: 62 }} />
      </div>
    </div>
  )
}

function CenaCompartilhar({ movimento }: { movimento: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      <div className="relative w-32 rounded-[1.6rem] border-4 border-foreground/80 bg-card p-2 shadow-lg sm:w-36">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-foreground/30" />
        <div className="space-y-1.5 text-[10px]">
          <div className="w-fit rounded-xl rounded-bl-sm bg-muted px-2 py-1 text-muted-foreground">Preciso de contador…</div>
          <motion.div
            initial={movimento ? { opacity: 0, x: 20 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="ml-auto w-fit rounded-xl rounded-br-sm bg-gradient-gold px-2 py-1 text-on-primary"
          >
            Conhece a Vincis?
          </motion.div>
          <motion.div
            initial={movimento ? { opacity: 0, x: 20 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4, duration: 0.4 }}
            className="ml-auto flex w-fit items-center gap-1 rounded-xl rounded-br-sm border border-primary/40 bg-primary/10 px-2 py-1 text-foreground"
          >
            <Link2 className="size-3 text-primary" /> seu link
          </motion.div>
        </div>
        <Smartphone className="absolute -right-2 -top-2 size-5 rounded-full bg-background p-0.5 text-primary" aria-hidden="true" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Conexao movimento={movimento} />
        {movimento && (
          <motion.span
            className="text-primary"
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            aria-hidden="true"
          >
            <Send className="size-4" />
          </motion.span>
        )}
      </div>
      <Pessoa rotulo="Quem você indica" tom="neutro" />
    </div>
  )
}

function CenaConhecer({ movimento }: { movimento: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4">
      <Pessoa rotulo="Futuro cliente" tom="neutro" />
      <Conexao movimento={movimento} />
      <div className="relative">
        <Janela titulo="vincis.com.br">
          <div className="grid grid-cols-3 gap-1.5">
            {['Profissionais', 'Planos', 'Serviços'].map((t, i) => (
              <Aparece key={t} atraso={movimento ? 0.3 + i * 0.25 : 0}>
                <div className="rounded-lg border border-border bg-muted/40 px-1 py-2 text-center text-[9px] font-medium text-foreground">{t}</div>
              </Aparece>
            ))}
          </div>
          <Aparece atraso={movimento ? 1.4 : 0} className="mt-3">
            <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-gold px-2.5 py-1.5 text-[10px] font-semibold text-on-primary">
              <UserPlus className="size-3" /> Criar conta
            </span>
          </Aparece>
          <Aparece atraso={movimento ? 2.2 : 0} className="mt-2">
            <Etiqueta tom="info"><CheckCircle2 className="size-3 text-primary" /> Indicação registrada para você</Etiqueta>
          </Aparece>
        </Janela>
        <Cursor movimento={movimento} de={{ x: 210, y: 140 }} para={{ x: 40, y: 84 }} atraso={0.9} />
      </div>
    </div>
  )
}

function CenaContratar({ movimento }: { movimento: boolean }) {
  const cartoes = [
    { Icone: Repeat, titulo: 'Plano contábil', sub: 'Mensalidade', nota: 'Recorrente' },
    { Icone: Briefcase, titulo: 'Serviço avulso', sub: 'Do catálogo', nota: 'Avulso' },
  ]
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
      {cartoes.map((c, i) => (
        <Aparece key={c.titulo} atraso={movimento ? i * 0.35 : 0}>
          <div className="w-52 rounded-2xl border border-border bg-card p-3 shadow-md sm:w-56">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary"><c.Icone className="size-4" /></span>
              <div>
                <div className="text-xs font-semibold text-foreground">{c.titulo}</div>
                <div className="text-[10px] text-muted-foreground">{c.sub}</div>
              </div>
              <span className="ml-auto"><Etiqueta>{c.nota}</Etiqueta></span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-[10px]">
              <span className="text-muted-foreground">Pagamento por Pix</span>
              <motion.span
                initial={movimento ? { opacity: 0, scale: 0.6 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: movimento ? 1.2 + i * 0.4 : 0, type: 'spring', stiffness: 260, damping: 18 }}
              >
                <Etiqueta tom="ok"><CheckCircle2 className="size-3" /> confirmado</Etiqueta>
              </motion.span>
            </div>
          </div>
        </Aparece>
      ))}
    </div>
  )
}

function Trilha({ passos, movimento, atrasoBase = 0 }: { passos: { texto: string; tom: 'neutro' | 'ok' | 'alerta' | 'info' }[]; movimento: boolean; atrasoBase?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {passos.map((p, i) => (
        <Aparece key={p.texto} atraso={movimento ? atrasoBase + i * 0.45 : 0} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />}
          <Etiqueta tom={p.tom}>{p.texto}</Etiqueta>
        </Aparece>
      ))}
    </div>
  )
}

function CenaComissao({ movimento, faixaRecorrente }: { movimento: boolean; faixaRecorrente: string }) {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-3">
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Repeat className="size-4 text-primary" /> Recorrente · plano contábil
          <span className="ml-auto text-[10px] font-medium text-muted-foreground">{faixaRecorrente} conforme o nível</span>
        </div>
        <div className="mt-2">
          <Trilha movimento={movimento} passos={[{ texto: 'Mês prestado', tom: 'neutro' }, { texto: 'Mensalidade paga', tom: 'neutro' }, { texto: 'Comissão disponível', tom: 'ok' }]} />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Briefcase className="size-4 text-primary" /> Avulsa · serviço do catálogo
          <span className="ml-auto text-[10px] font-medium text-muted-foreground">{PERCENTUAL_AVULSO}% do valor</span>
        </div>
        <div className="mt-2">
          <Trilha movimento={movimento} atrasoBase={1.4} passos={[{ texto: 'Contratação paga', tom: 'neutro' }, { texto: 'Comissão gerada', tom: 'info' }, { texto: 'Serviço concluído', tom: 'neutro' }, { texto: 'Disponível', tom: 'ok' }]} />
        </div>
        <Aparece atraso={movimento ? 3.4 : 0} className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <XCircle className="size-3 text-red-500" aria-hidden="true" /> Se a contratação for cancelada antes da conclusão, a comissão é cancelada.
        </Aparece>
      </div>
    </div>
  )
}

function CenaSaque({ movimento }: { movimento: boolean }) {
  const [solicitado, setSolicitado] = useState(!movimento)
  useEffect(() => {
    if (!movimento) return
    const t = setTimeout(() => setSolicitado(true), 2100)
    return () => clearTimeout(t)
  }, [movimento])
  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <Janela titulo="Painel do parceiro" className="max-w-[19rem]">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-gradient-gold text-on-primary"><Wallet className="size-4" /></span>
            <div>
              <div className="text-[10px] text-muted-foreground">Saldo disponível</div>
              <div className="text-sm font-semibold text-foreground">R$ 0,00 <span className="text-[9px] font-normal text-muted-foreground">(ilustração)</span></div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Etiqueta><CircleDollarSign className="size-3" /> Chave Pix cadastrada</Etiqueta>
            <AnimatePresence mode="wait" initial={false}>
              {solicitado ? (
                <motion.span key="s" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                  <Etiqueta tom="info">Saque solicitado</Etiqueta>
                </motion.span>
              ) : (
                <motion.span key="b" exit={{ opacity: 0 }} className="rounded-lg bg-gradient-gold px-2.5 py-1 text-[10px] font-semibold text-on-primary">
                  Solicitar saque
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <Aparece atraso={movimento ? 2.7 : 0} className="mt-3 rounded-lg bg-muted/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
            A Vincis faz o Pix para a sua chave e marca o saque como pago no painel.
          </Aparece>
        </Janela>
        <Cursor movimento={movimento} de={{ x: 260, y: 150 }} para={{ x: 215, y: 82 }} atraso={0.9} />
      </div>
    </div>
  )
}

/* ------------------------------- o componente ------------------------------ */

export function JornadaDoParceiro({ faixaRecorrente }: { faixaRecorrente: string }) {
  const reduzir = useReducedMotion() ?? false
  const lista = etapas(faixaRecorrente)
  const [atual, setAtual] = useState(0)
  const [tocando, setTocando] = useState(true)
  const [rodada, setRodada] = useState(0)
  const botoes = useRef<(HTMLButtonElement | null)[]>([])
  const reproduzir = tocando && !reduzir

  useEffect(() => {
    if (!reproduzir) return
    const t = setTimeout(() => {
      if (atual === lista.length - 1) setTocando(false)
      else setAtual((a) => a + 1)
    }, DURACAO_ETAPA_MS)
    return () => clearTimeout(t)
  }, [reproduzir, atual, lista.length, rodada])

  const irPara = (i: number, focar = false) => {
    setAtual(i)
    setTocando(false)
    setRodada((r) => r + 1)
    if (focar) botoes.current[i]?.focus()
  }
  const repetir = () => {
    setAtual(0)
    setTocando(true)
    setRodada((r) => r + 1)
  }
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); irPara(Math.min(lista.length - 1, atual + 1), true) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); irPara(Math.max(0, atual - 1), true) }
    if (e.key === 'Home') { e.preventDefault(); irPara(0, true) }
    if (e.key === 'End') { e.preventDefault(); irPara(lista.length - 1, true) }
  }

  const movimento = !reduzir
  const cenas = [
    <CenaAtivar key="a" movimento={movimento} />,
    <CenaCompartilhar key="b" movimento={movimento} />,
    <CenaConhecer key="c" movimento={movimento} />,
    <CenaContratar key="d" movimento={movimento} />,
    <CenaComissao key="e" movimento={movimento} faixaRecorrente={faixaRecorrente} />,
    <CenaSaque key="f" movimento={movimento} />,
  ]
  const etapa = lista[atual]

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Etapas */}
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:col-span-4 lg:flex-col lg:overflow-visible" aria-label="Etapas da parceria" onKeyDown={aoTeclar}>
        {lista.map((e, i) => (
          <li key={e.titulo} className="shrink-0 lg:shrink">
            <button
              ref={(el) => { botoes.current[i] = el }}
              type="button"
              onClick={() => irPara(i)}
              aria-current={i === atual ? 'step' : undefined}
              tabIndex={i === atual ? 0 : -1}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i === atual ? 'border-primary/50 bg-primary/10 shadow-sm' : 'border-border bg-card/60 hover:bg-muted/60',
              )}
            >
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', i === atual ? 'bg-gradient-gold text-on-primary' : i < atual ? 'bg-primary/20 text-foreground' : 'bg-muted text-muted-foreground')}>
                {i < atual ? <CheckCircle2 className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className="whitespace-nowrap text-sm font-medium text-foreground lg:whitespace-normal">{e.titulo}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Palco */}
      <div className="lg:col-span-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm sm:p-6">
          <div className="absolute right-3 top-3"><Etiqueta>Ilustração</Etiqueta></div>
          <div className="grid min-h-[17rem] place-items-center py-6 sm:min-h-[19rem]" aria-hidden="true">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${atual}-${rodada}`}
                className="w-full"
                initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, x: -24 }}
                transition={{ duration: reduzir ? 0.15 : 0.35 }}
              >
                {cenas[atual]}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progresso da reprodução automática */}
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {reproduzir ? (
              <motion.div key={`${atual}-${rodada}`} className="h-full bg-gradient-gold" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: DURACAO_ETAPA_MS / 1000, ease: 'linear' }} />
            ) : (
              <div className="h-full bg-gradient-gold" style={{ width: `${((atual + 1) / lista.length) * 100}%` }} />
            )}
          </div>

          <div className="mt-4" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Etapa {atual + 1} de {lista.length}</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">{etapa.titulo}</h3>
            <p className="mt-1 text-sm text-foreground/90 sm:text-base">{etapa.resumo}</p>
            <p className="mt-1 text-sm text-muted-foreground">{etapa.detalhe}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => irPara(Math.max(0, atual - 1))} disabled={atual === 0} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
            </button>
            {!reduzir && (
              <button type="button" onClick={() => setTocando((t) => !t)} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={tocando}>
                {tocando ? <><Pause className="size-4" aria-hidden="true" /> Pausar</> : <><Play className="size-4" aria-hidden="true" /> Reproduzir</>}
              </button>
            )}
            <button type="button" onClick={() => irPara(Math.min(lista.length - 1, atual + 1))} disabled={atual === lista.length - 1} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Próxima <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={repetir} className="alvo-toque ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RotateCcw className="size-4" aria-hidden="true" /> Repetir do início
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

