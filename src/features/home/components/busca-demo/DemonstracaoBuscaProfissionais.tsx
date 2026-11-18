"use client";

import { MotionConfig, motion, useInView, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { carregarDemonstracaoBusca } from "../../actions/demonstracao-busca";
import { cn } from "@/lib/utils";
import { ETAPAS_DEMONSTRACAO_BUSCA, LEITURA_APOS_ETAPA_MS } from "../../constants/demonstracao-busca";
import type { DadosDemonstracaoBusca } from "../../queries/demonstracao-busca";
import { PalcoBusca } from "./PalcoBusca";

/**
 * "Encontre seu profissional, passo a passo" — seção da Home.
 *
 * Mesma arquitetura da jornada de /parceiros (`JornadaDoParceiro`): etapas
 * clicáveis, texto sincronizado (`aria-live`), reprodução automática,
 * pausa, anterior/próxima e repetir. A diferença é o palco: aqui ele desenha
 * as telas reais da Vincis (ver `PalcoBusca`), com cursor e zoom.
 *
 * Reprodução:
 * - toca sozinha quando a seção entra na tela e pausa ao sair dela;
 * - "Anterior"/"Próxima"/clique numa etapa mostram aquela etapa e param o
 *   avanço automático (a cena da etapa ainda é animada);
 * - com `prefers-reduced-motion`, não há reprodução automática, cursor nem
 *   zoom: cada etapa é um quadro parado com o alvo marcado.
 */
export function DemonstracaoBuscaProfissionais() {
  const reduzir = useReducedMotion() ?? false;
  const secaoRef = useRef<HTMLElement>(null);
  const visivel = useInView(secaoRef, { amount: 0.35 });
  // Os dados reais são pedidos uma única vez, quando a seção se aproxima da tela.
  const proxima = useInView(secaoRef, { once: true, margin: "600px 0px" });
  const [dados, setDados] = useState<DadosDemonstracaoBusca | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [jaVista, setJaVista] = useState(false);
  const [atual, setAtual] = useState(0);
  const [rodada, setRodada] = useState(0);
  /** Avança sozinho para a próxima etapa ao terminar a atual. */
  const [automatico, setAutomatico] = useState(true);
  /** Congela a cena no ponto em que está. */
  const [pausado, setPausado] = useState(false);
  /** Etapa cujo roteiro já terminou (para o avanço automático). */
  const [concluida, setConcluida] = useState<number | null>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const total = ETAPAS_DEMONSTRACAO_BUSCA.length;

  // A demonstração só começa quando alguém chega até ela.
  useEffect(() => {
    if (!proxima) return;
    let ativo = true;
    // Leitura pública e em cache; nenhuma pesquisa é disparada pela digitação.
    carregarDemonstracaoBusca()
      .then((resposta) => {
        if (!ativo) return;
        if (resposta.sucesso) setDados(resposta.dados);
        else setFalhou(true);
      })
      .catch(() => {
        if (ativo) setFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, [proxima]);

  // Ajuste durante a renderização (padrão do React para estado derivado de evento).
  if (visivel && !jaVista) setJaVista(true);

  const congelado = pausado || !visivel;
  const avancando = automatico && !pausado && !reduzir;

  // Avanço automático: espera o tempo de leitura depois do fim da etapa.
  useEffect(() => {
    if (!avancando || !visivel || concluida !== atual) return;
    const temporizador = window.setTimeout(() => {
      if (atual === total - 1) setAutomatico(false);
      else {
        setConcluida(null);
        setAtual((a) => a + 1);
      }
    }, LEITURA_APOS_ETAPA_MS);
    return () => window.clearTimeout(temporizador);
  }, [avancando, visivel, concluida, atual, total]);

  const irPara = (indice: number, focar = false) => {
    setConcluida(null);
    setAtual(indice);
    setAutomatico(false);
    setPausado(false);
    setRodada((r) => r + 1);
    if (focar) botoes.current[indice]?.focus();
  };
  const repetir = () => {
    setConcluida(null);
    setAtual(0);
    setAutomatico(true);
    setPausado(false);
    setRodada((r) => r + 1);
  };
  const alternarReproducao = () => {
    if (avancando) {
      setPausado(true);
      return;
    }
    // Reproduzir: retoma de onde parou; no fim, recomeça.
    if (!pausado && atual === total - 1 && concluida === atual) {
      repetir();
      return;
    }
    setPausado(false);
    setAutomatico(true);
  };
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); irPara(Math.min(total - 1, atual + 1), true); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); irPara(Math.max(0, atual - 1), true); }
    if (e.key === "Home") { e.preventDefault(); irPara(0, true); }
    if (e.key === "End") { e.preventDefault(); irPara(total - 1, true); }
  };

  const etapa = ETAPAS_DEMONSTRACAO_BUSCA[atual];
  const progresso = ((atual + (concluida === atual ? 1 : 0.5)) / total) * 100;

  return (
    <MotionConfig reducedMotion="user">
      <section
        ref={secaoRef}
        id="como-encontrar"
        aria-labelledby="titulo-como-encontrar"
        className="scroll-mt-24 overflow-x-hidden border-y border-border bg-muted/20 py-16 sm:py-24"
      >
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Sparkles className="size-3 text-primary" aria-hidden="true" /> Como encontrar
            </p>
            <h2 id="titulo-como-encontrar" className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              Seu profissional, <span className="text-gradient-amber">passo a passo</span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Veja como buscar, comparar e abrir o perfil de um profissional na Vincis.
            </p>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-12">
            {/* Etapas */}
            <ol
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 xl:col-span-3 xl:flex-col xl:overflow-visible"
              aria-label="Etapas da busca"
              onKeyDown={aoTeclar}
            >
              {ETAPAS_DEMONSTRACAO_BUSCA.map((item, i) => (
                <li key={item.titulo} className="shrink-0 xl:shrink">
                  <button
                    ref={(el) => { botoes.current[i] = el; }}
                    type="button"
                    onClick={() => irPara(i)}
                    aria-current={i === atual ? "step" : undefined}
                    tabIndex={i === atual ? 0 : -1}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      i === atual ? "border-primary/50 bg-primary/10 shadow-sm" : "border-border bg-card/60 hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                        i === atual ? "bg-gradient-gold text-on-primary" : i < atual ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i < atual ? <CheckCircle2 className="size-4" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium text-foreground xl:whitespace-normal">{item.titulo}</span>
                  </button>
                </li>
              ))}

              {/* No desktop largo, o texto da etapa fica ao lado do palco. */}
              <li className="hidden xl:mt-4 xl:block" aria-hidden="true">
                <TextoDaEtapa atual={atual} total={total} titulo={etapa.titulo} resumo={etapa.resumo} detalhe={etapa.detalhe} />
              </li>
            </ol>

            {/* Palco */}
            <div className="min-w-0 xl:col-span-9">
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                {/* Barra de navegador: deixa claro que é a reprodução de uma tela. */}
                <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
                  <span className="size-2.5 rounded-full bg-red-400/70" />
                  <span className="size-2.5 rounded-full bg-amber-400/70" />
                  <span className="size-2.5 rounded-full bg-emerald-400/70" />
                  <span className="ml-2 truncate rounded-md bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                    vincis.com.br{atual === 0 ? "" : atual === total - 1 ? "/perfil-profissional" : "/profissionais"}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Demonstração
                  </span>
                </div>
                <PalcoBusca
                  etapa={atual}
                  rodada={rodada}
                  pausado={congelado}
                  reduzir={reduzir}
                  ativo={jaVista}
                  dados={dados}
                  aoConcluirEtapa={setConcluida}
                />
                {!dados && (
                  <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
                    {falhou ? "Não foi possível carregar os profissionais agora." : "Carregando profissionais…"}
                  </p>
                )}
                {/* Progresso */}
                <div className="h-1 bg-muted" aria-hidden="true">
                  <motion.div className="h-full bg-gradient-gold" animate={{ width: `${progresso}%` }} transition={{ duration: 0.4 }} />
                </div>
              </div>

              <div className="mt-4 xl:hidden">
                <TextoDaEtapa atual={atual} total={total} titulo={etapa.titulo} resumo={etapa.resumo} detalhe={etapa.detalhe} />
              </div>
              {/* Um único anúncio para leitores de tela, em qualquer layout. */}
              <p className="sr-only" aria-live="polite">
                Etapa {atual + 1} de {total}: {etapa.titulo}. {etapa.resumo} {etapa.detalhe}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => irPara(Math.max(0, atual - 1))} disabled={atual === 0} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ChevronLeft className="size-4" aria-hidden="true" /> Anterior
                </button>
                {!reduzir && (
                  <button type="button" onClick={alternarReproducao} aria-pressed={avancando} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {avancando ? <><Pause className="size-4" aria-hidden="true" /> Pausar</> : <><Play className="size-4" aria-hidden="true" /> Reproduzir</>}
                  </button>
                )}
                <button type="button" onClick={() => irPara(Math.min(total - 1, atual + 1))} disabled={atual === total - 1} className="alvo-toque inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Próxima <ChevronRight className="size-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={repetir} className="alvo-toque ml-auto inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <RotateCcw className="size-4" aria-hidden="true" /> Repetir
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Profissionais e perfil reais, com as informações públicas da vitrine. Nesta demonstração nada é contratado, agendado ou gravado.
                {reduzir && " Movimento reduzido ativo: avance pelas etapas no seu ritmo."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

function TextoDaEtapa({ atual, total, titulo, resumo, detalhe }: { atual: number; total: number; titulo: string; resumo: string; detalhe: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Etapa {atual + 1} de {total}</p>
      <h3 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">{titulo}</h3>
      <p className="mt-1 text-sm text-foreground/90 sm:text-base">{resumo}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detalhe}</p>
    </div>
  );
}
