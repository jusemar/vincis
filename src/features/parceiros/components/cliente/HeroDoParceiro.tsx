'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Flame, Gem, Repeat, Share2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import {
  NIVEIS_PARCEIRO,
  indiceDoNivel,
  percentualFormatado,
  progressoParaProximoNivel,
  type CodigoNivel,
} from '../../constants/programa'
import { CUPOM_PARCEIRO, DESTAQUES_HERO } from '../../constants/mock-painel'
import { NumeroAnimado } from './NumeroAnimado'
import { BotaoCopiar } from './BotaoCopiar'

/**
 * Abertura do Painel do Parceiro.
 *
 * Mantém a composição da referência — texto à esquerda, medidor circular à
 * direita — porque é ela que dá ao painel a cara de "sua carteira está
 * crescendo" em vez de a de um relatório. O que mudou é o material: nenhum
 * `oklch`, nenhuma cor literal, nenhum vidro branco sobre fundo escuro. Cada
 * superfície aqui é `bg-card`, `bg-muted` ou `primary` com transparência, e por
 * isso a peça nasce correta nos dois temas.
 *
 * O anel giratório e as partículas obedecem a `prefers-reduced-motion`: são
 * animações de JavaScript, e a media query global do `globals.css` só alcança
 * as de CSS.
 */
export function HeroDoParceiro({
  nome,
  nivel,
  recorrentesAtivos,
  clientesAtivos,
  rendaRecorrente,
  mesesConsecutivos,
}: {
  nome: string
  nivel: CodigoNivel
  recorrentesAtivos: number
  clientesAtivos: number
  rendaRecorrente: number
  mesesConsecutivos: number
}) {
  const semMovimento = useReducedMotion()
  const nivelAtual = NIVEIS_PARCEIRO[indiceDoNivel(nivel)]
  const { percentual, faltam, proximo } = progressoParaProximoNivel(
    nivel,
    recorrentesAtivos,
  )

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card p-6 sm:p-8">
      {/* Ambiência: dois halos do próprio primary e a grade — sem cor nova. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.18), transparent 65%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-72 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--info) / 0.14), transparent 65%)' }}
      />

      {!semMovimento &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute size-1.5 rounded-full bg-primary/40"
            style={{ left: `${10 + i * 14}%`, top: `${20 + (i % 3) * 22}%` }}
            animate={{ y: [0, -16, 0], opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: 4 + i, repeat: Infinity, delay: i * 0.4 }}
          />
        ))}

      <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div className="min-w-0">
          <Pilula
            tom="destaque"
            rotulo={`Parceiro ${nivelAtual.nome} · ${mesesConsecutivos}º mês consecutivo`}
          />

          <h1 className="mt-5 font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Bom te ver, {nome}.
            <br className="hidden sm:block" /> Sua carteira está crescendo.
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {proximo ? (
              <>
                Mais{' '}
                <span className="font-semibold text-foreground">
                  {faltam} {faltam === 1 ? 'cliente recorrente ativo' : 'clientes recorrentes ativos'}
                </span>{' '}
                e você desbloqueia o nível{' '}
                <span className="font-semibold text-foreground">{proximo.nome}</span> —
                comissão de {percentualFormatado(proximo.percentual)}, aplicada a toda
                a sua carteira elegível.
              </>
            ) : (
              <>
                Você está no nível mais alto do programa —{' '}
                <span className="font-semibold text-foreground">
                  {percentualFormatado(nivelAtual.percentual)}
                </span>{' '}
                sobre toda a sua carteira elegível.
              </>
            )}
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            <Button>
              <Share2 className="size-4" aria-hidden />
              Compartilhar meu link
            </Button>
            <Button variant="outline">
              <Flame className="size-4 text-primary" aria-hidden />
              Ver campanhas ativas
            </Button>
            <BotaoCopiar
              texto={CUPOM_PARCEIRO.codigo}
              rotulo="Copiar cupom"
              rotuloCopiado="Cupom copiado"
              variant="outline"
              size="default"
            />
          </div>

          <dl className="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Renda recorrente
              </dt>
              <dd className="mt-1 whitespace-nowrap font-serif text-2xl font-semibold leading-none">
                <NumeroAnimado valor={rendaRecorrente} prefixo="R$ " />
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                  /mês
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Clientes ativos
              </dt>
              <dd className="mt-1 whitespace-nowrap font-serif text-2xl font-semibold leading-none">
                <NumeroAnimado valor={clientesAtivos} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Próximo nível
              </dt>
              <dd className="mt-1 whitespace-nowrap font-serif text-2xl font-semibold leading-none">
                {proximo ? faltam : '—'}
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                  {proximo ? 'recorrentes' : 'no topo'}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Medidor de nível. Fora do celular: ali o espaço pertence ao texto. */}
        <div className="relative hidden h-[320px] lg:block">
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, hsl(var(--primary) / 0.45), transparent 35%, hsl(var(--info) / 0.45), transparent 70%, hsl(var(--primary) / 0.45))',
              maskImage:
                'radial-gradient(circle, transparent 55%, black 56%, black 70%, transparent 71%)',
              WebkitMaskImage:
                'radial-gradient(circle, transparent 55%, black 56%, black 70%, transparent 71%)',
            }}
            animate={semMovimento ? undefined : { rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          />
          <div className="absolute inset-12 flex flex-col items-center justify-center rounded-full border bg-card/80 p-6 text-center backdrop-blur">
            <Gem className="mb-2 size-7 text-primary" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {proximo ? `Progresso ${proximo.nome}` : 'Nível máximo'}
            </span>
            <span className="mt-2 font-serif text-5xl font-semibold leading-none">
              <NumeroAnimado valor={percentual} sufixo="%" />
            </span>
            <span className="mt-2 text-xs text-muted-foreground">
              {proximo ? (
                <>
                  Faltam{' '}
                  <span className="font-medium text-foreground">
                    {faltam} recorrentes
                  </span>
                </>
              ) : (
                'Carteira no percentual máximo'
              )}
            </span>
          </div>

          <div className="absolute right-2 top-4 flex items-center gap-2 rounded-xl border bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
            <TrendingUp className="size-3.5 text-primary" aria-hidden />
            {DESTAQUES_HERO[0].texto}
          </div>
          <motion.div
            className="absolute bottom-6 left-0 flex items-center gap-2 rounded-xl border bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
            animate={semMovimento ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          >
            <Repeat className="size-3.5 text-info" aria-hidden />
            {DESTAQUES_HERO[1].texto}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
