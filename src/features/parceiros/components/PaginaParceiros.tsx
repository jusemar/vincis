"use client";

import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion";
import {
  ArrowRight, Award, BadgeCheck, Briefcase, ChevronDown, CircleDollarSign, Crown, FileText, Gem,
  Handshake, Link2, Repeat, Scale, ShieldCheck, Sparkles, UserCheck, Users, Wallet, XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DIAS_COOKIE_INDICACAO } from "../constants/indicacao";
import { formatarPercentualCentesimos, PERCENTUAL_AVULSO } from "../constants/programa";
import type { NiveisPublicos } from "../lib/niveis";
import type { SituacaoNaPaginaPublica } from "../queries/situacao-publica";
import { ChamadaParticipar } from "./publico/ChamadaParticipar";
import { JornadaDoParceiro } from "./publico/JornadaDoParceiro";
import { SimuladorDeComissoes } from "./publico/SimuladorDeComissoes";

/*
  Página pública do Programa de Parceiros Indicadores.

  Regra da página: só afirma o que o sistema faz. Percentuais, mínimos e
  proteção vêm da configuração publicada pela Gestão (`obterNiveisPublicos`);
  a comissão avulsa vem de `PERCENTUAL_AVULSO`, a mesma constante do motor. O
  que é exemplo (valores no simulador, saldo no painel ilustrativo) diz que é.

  Saíram da versão anterior: ranking com nomes e ganhos, depoimentos, "comissões
  pagas agora — ao vivo", "Top 3 nacional", "aprovação em 24h", "pagamento
  semanal", "mentoria", "centenas de parceiros", "renda vitalícia", "vagas
  limitadas", estatísticas sem fonte e botões de cadastro que rolavam até o
  simulador.
*/

const ICONE_DO_NIVEL: Record<string, typeof Award> = { bronze: Award, prata: Gem, ouro: Crown };

function faixaDosPercentuais(niveis: NiveisPublicos | null): string {
  const lista = niveis?.niveis ?? [];
  if (!lista.length) return "um percentual definido pela Vincis";
  const primeiro = formatarPercentualCentesimos(lista[0].percentualCentesimos);
  const ultimo = formatarPercentualCentesimos(lista.at(-1)!.percentualCentesimos);
  return primeiro === ultimo ? primeiro : `${primeiro} a ${ultimo}`;
}

function Cabecalho({ id, sobretitulo, titulo, descricao }: { id?: string; sobretitulo: string; titulo: React.ReactNode; descricao?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Sparkles className="size-3 text-primary" aria-hidden="true" /> {sobretitulo}
      </p>
      <h2 id={id} className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">{titulo}</h2>
      {descricao && <p className="mt-4 text-base text-muted-foreground sm:text-lg">{descricao}</p>}
    </div>
  );
}

function Revelar({ children, atraso = 0, className }: { children: React.ReactNode; atraso?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: atraso }}>
      {children}
    </motion.div>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function FluxoDoHero() {
  const reduzir = useReducedMotion();
  const passos = [
    { Icone: Link2, texto: "Seu link" },
    { Icone: Users, texto: "Novo cliente" },
    { Icone: BadgeCheck, texto: "Contratação paga" },
    { Icone: CircleDollarSign, texto: "Sua comissão" },
  ];
  return (
    <div className="relative rounded-3xl border border-border bg-card/80 p-5 shadow-elevated backdrop-blur sm:p-7" aria-hidden="true">
      <span className="absolute right-4 top-4 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Ilustração</span>
      <div className="space-y-3 pt-4">
        {passos.map(({ Icone, texto }, i) => (
          <div key={texto}>
            <motion.div
              className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 p-3"
              initial={reduzir ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.35, duration: 0.45 }}
            >
              <span className={cn("grid size-10 place-items-center rounded-xl", i === passos.length - 1 ? "bg-gradient-gold text-on-primary" : "bg-primary/10 text-primary")}>
                <Icone className="size-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">{texto}</span>
              {i === passos.length - 1 && (
                <motion.span className="ml-auto text-xs text-muted-foreground" initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
                  conforme as regras
                </motion.span>
              )}
            </motion.div>
            {i < passos.length - 1 && (
              <div className="relative ml-8 h-4 w-px border-l border-dashed border-primary/50">
                {!reduzir && (
                  <motion.span
                    className="absolute -left-1 size-2 rounded-full bg-primary"
                    animate={{ top: ["0%", "100%"], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero({ situacao, faixa }: { situacao: SituacaoNaPaginaPublica; faixa: string }) {
  const selos = [
    { Icone: ShieldCheck, texto: "Participação gratuita" },
    { Icone: BadgeCheck, texto: "Ativação imediata na sua conta" },
    { Icone: Wallet, texto: "Saque por Pix, pedido no painel" },
  ];
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pb-28" aria-labelledby="titulo-parceiros">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute -left-40 -top-40 size-[32rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 60%)" }} />
        <div className="absolute -bottom-40 -right-32 size-[36rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--amber-400) / 0.2), transparent 60%)" }} />
      </div>
      <div className="container mx-auto grid items-center gap-12 px-4 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Handshake className="size-3.5 text-primary" aria-hidden="true" /> Programa de Parceiros Indicadores
          </motion.p>
          <motion.h1 id="titulo-parceiros" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Indique a Vincis e ganhe <span className="text-gradient-amber">comissão</span> quando seus indicados contratarem.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Apresente a Vincis a pessoas e empresas que precisam de contabilidade ou apoio jurídico. Quando uma contratação
            acontece e é paga pela plataforma, você recebe comissão: {faixa} por mês nos planos, conforme o seu nível, e{" "}
            {PERCENTUAL_AVULSO}% nos serviços avulsos.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
            <ChamadaParticipar situacao={situacao} />
            <a href="#como-funciona" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3.5 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Ver como funciona <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </motion.div>
          <ul className="mt-8 flex flex-wrap gap-2">
            {selos.map(({ Icone, texto }) => (
              <li key={texto} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground">
                <Icone className="size-3.5 text-primary" aria-hidden="true" /> {texto}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-5">
          <FluxoDoHero />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- Quem pode participar ----------------------------- */

function QuemPode() {
  const respostas = [
    { Icone: UserCheck, titulo: "Precisa de uma conta na Vincis", texto: "O programa é ativado pela sua conta, depois de confirmar o cadastro. A ativação é feita na área do cliente." },
    { Icone: ShieldCheck, titulo: "É gratuito", texto: "Não há taxa de adesão nem mensalidade para ser parceiro." },
    { Icone: BadgeCheck, titulo: "Sem análise ou espera", texto: "Ao clicar em “Ativar meu link”, o link de indicação é criado na hora." },
    { Icone: Scale, titulo: "Não precisa ser contador nem advogado", texto: "Nem ter experiência comercial. Basta conhecer pessoas que possam precisar da Vincis." },
  ];
  return (
    <section className="container mx-auto px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="quem-pode">
      <Cabecalho id="quem-pode" sobretitulo="Participação" titulo={<>Quem pode ser um <span className="text-gradient-gold">Parceiro Indicador</span> da Vincis?</>}
        descricao="Qualquer pessoa com uma conta confirmada na Vincis que queira apresentar a plataforma a outras pessoas." />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {respostas.map(({ Icone, titulo, texto }, i) => (
          <Revelar key={titulo} atraso={i * 0.06}>
            <div className="h-full rounded-3xl border border-border bg-card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icone className="size-5" aria-hidden="true" /></span>
              <h3 className="mt-4 font-semibold text-foreground">{titulo}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
            </div>
          </Revelar>
        ))}
      </div>

      <Revelar className="mt-10">
        <div className="grid overflow-hidden rounded-3xl border border-border md:grid-cols-2">
          <div className="bg-primary/5 p-6 sm:p-8">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><Handshake className="size-4" aria-hidden="true" /> Parceiro Indicador</p>
            <p className="mt-2 text-lg font-semibold text-foreground">Apresenta novos clientes à Vincis.</p>
            <p className="mt-2 text-sm text-muted-foreground">Compartilha o próprio link e pode receber comissões conforme as regras do programa. Não executa serviços contábeis nem jurídicos.</p>
          </div>
          <div className="border-t border-border bg-card p-6 sm:p-8 md:border-l md:border-t-0">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><Briefcase className="size-4" aria-hidden="true" /> Profissional prestador</p>
            <p className="mt-2 text-lg font-semibold text-foreground">Realiza o serviço contratado.</p>
            <p className="mt-2 text-sm text-muted-foreground">Contador, advogado ou outro profissional habilitado, responsável técnico pelo trabalho. Indicar clientes não transforma ninguém em prestador.</p>
          </div>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Hoje, o programa é ativado pela área do cliente. Contas exclusivamente profissionais podem{" "}
          <Link href="/contato" className="text-primary underline underline-offset-4">falar com a Vincis</Link> para saber como participar.
        </p>
      </Revelar>
    </section>
  );
}

/* --------------------------------- Como você ganha --------------------------------- */

function ComoGanha({ faixa }: { faixa: string }) {
  const modalidades = [
    {
      Icone: Repeat, titulo: "Comissão recorrente", subtitulo: "Planos contábeis da Vincis", percentual: faixa, sufixo: "por mês, conforme o nível",
      passos: ["O cliente que você indicou contrata o primeiro plano contábil dele.", "A cada mês prestado e com a mensalidade paga, nasce uma comissão.", "Ela já fica disponível para saque."],
      atencao: "Mês não prestado, pagamento pendente, estornado ou plano cancelado não geram comissão.",
    },
    {
      Icone: Briefcase, titulo: "Comissão avulsa", subtitulo: "Serviços do catálogo", percentual: `${PERCENTUAL_AVULSO}%`, sufixo: "do valor, em qualquer nível",
      passos: ["O cliente contrata e paga um serviço do catálogo pela Vincis.", "A comissão é gerada na contratação paga.", "Fica disponível quando o serviço é concluído."],
      atencao: "Contratação cancelada antes da conclusão cancela a comissão. Serviço sob orçamento, sem valor definido, não gera comissão.",
    },
  ];
  return (
    <section className="container mx-auto px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="como-ganha">
      <Cabecalho id="como-ganha" sobretitulo="Comissões" titulo={<>Como você <span className="text-gradient-amber">ganha</span></>}
        descricao="São duas modalidades, com regras diferentes. A comissão sai da parte da Vincis: o cliente não paga a mais e o profissional não recebe menos." />
      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        {modalidades.map((m, i) => (
          <Revelar key={m.titulo} atraso={i * 0.08}>
            <div className="h-full rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-on-primary"><m.Icone className="size-5" aria-hidden="true" /></span>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">{m.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{m.subtitulo}</p>
                </div>
              </div>
              <p className="mt-6 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-4xl font-semibold text-foreground">{m.percentual}</span>
                <span className="text-sm text-muted-foreground">{m.sufixo}</span>
              </p>
              <ol className="mt-6 space-y-3">
                {m.passos.map((p, k) => (
                  <li key={p} className="flex gap-3 text-sm text-foreground/90">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{k + 1}</span> {p}
                  </li>
                ))}
              </ol>
              <p className="mt-5 flex gap-2 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden="true" /> {m.atencao}
              </p>
            </div>
          </Revelar>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------ Níveis ------------------------------------ */

function Niveis({ niveis }: { niveis: NiveisPublicos | null }) {
  const lista = niveis?.niveis ?? [];
  return (
    <section id="niveis" className="container mx-auto px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="titulo-niveis">
      <Cabecalho id="titulo-niveis" sobretitulo="Níveis" titulo={<>Quanto mais clientes ativos, <span className="text-gradient-gold">maior o percentual</span></>}
        descricao="O nível define o percentual da comissão recorrente e depende de quantos clientes que você indicou têm plano ativo, prestado e pago. Ao subir de nível, as próximas comissões já usam o novo percentual." />
      {lista.length ? (
        <>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {lista.map((nivel, i) => {
              const Icone = ICONE_DO_NIVEL[nivel.codigo] ?? Award;
              return (
                <Revelar key={nivel.codigo} atraso={i * 0.08}>
                  <div className="h-full rounded-3xl border border-border bg-card p-6 sm:p-7">
                    <div className="flex items-center gap-3">
                      <span className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-on-primary"><Icone className="size-5" aria-hidden="true" /></span>
                      <div>
                        <h3 className="font-display text-xl font-semibold text-foreground">{nivel.nome}</h3>
                        <p className="text-xs text-muted-foreground">
                          {i === 0 ? "Nível de entrada" : `A partir de ${nivel.minimoClientes} ${nivel.minimoClientes === 1 ? "cliente recorrente ativo" : "clientes recorrentes ativos"}`}
                        </p>
                      </div>
                    </div>
                    <p className="mt-6 flex items-baseline gap-2">
                      <span className="font-display text-5xl font-semibold text-foreground">{formatarPercentualCentesimos(nivel.percentualCentesimos)}</span>
                      <span className="text-sm text-muted-foreground">recorrente</span>
                    </p>
                    <p className="mt-4 text-sm text-muted-foreground">Comissão avulsa: {PERCENTUAL_AVULSO}%, igual em todos os níveis.</p>
                  </div>
                </Revelar>
              );
            })}
          </div>
          {niveis && niveis.protecaoDias > 0 && (
            <p className="mx-auto mt-6 flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Proteção de {niveis.protecaoDias} {niveis.protecaoDias === 1 ? "dia" : "dias"}: se a quantidade de clientes ativos cair abaixo do mínimo do seu nível, você mantém o nível por esse período antes de descer.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">Percentuais e mínimos publicados pela Vincis. Podem ser atualizados; comissões já geradas mantêm o percentual delas.</p>
        </>
      ) : (
        <p className="mt-12 text-center text-sm text-muted-foreground">Os níveis do programa estão sendo atualizados e aparecem aqui assim que forem publicados.</p>
      )}
    </section>
  );
}

/* ------------------------------- Painel ilustrativo ------------------------------- */

function PainelIlustrativo() {
  const blocos = [
    { Icone: Link2, titulo: "Meu link", texto: "Seu link de indicação para copiar e compartilhar." },
    { Icone: Users, titulo: "Indicações", texto: "Quem chegou pelo seu link e o andamento de cada negócio." },
    { Icone: CircleDollarSign, titulo: "Comissões", texto: "Geradas, disponíveis, pagas e canceladas, com a origem de cada uma." },
    { Icone: Wallet, titulo: "Saque", texto: "Pedido do saldo disponível para a sua chave Pix cadastrada." },
    { Icone: Award, titulo: "Nível", texto: "Seu nível atual e quantos clientes ativos faltam para o próximo." },
    { Icone: Sparkles, titulo: "Campanhas", texto: "Campanhas com bônus, quando a Vincis abrir alguma, com regras próprias." },
  ];
  const linhas = [
    { o: "Plano contábil · mês 1", t: "Recorrente", s: "Disponível", tom: "ok" },
    { o: "Serviço do catálogo", t: "Avulsa", s: "Gerada", tom: "info" },
    { o: "Serviço do catálogo", t: "Avulsa", s: "Cancelada", tom: "neutro" },
  ] as const;
  return (
    <section id="painel" className="container mx-auto px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="titulo-painel">
      <Cabecalho id="titulo-painel" sobretitulo="Painel do parceiro" titulo={<>Acompanhe tudo <span className="text-gradient-gold">no seu painel</span></>}
        descricao="Depois de ativar o programa, sua área de parceiro reúne o link, as indicações, as comissões e os pedidos de saque." />
      <Revelar className="mt-12">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <span className="size-3 rounded-full bg-red-400/70" /><span className="size-3 rounded-full bg-amber-400/70" /><span className="size-3 rounded-full bg-emerald-400/70" />
            <span className="ml-3 text-xs text-muted-foreground">Área do parceiro</span>
            <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">Simulação ilustrativa · dados fictícios</span>
          </div>
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-3">
              {blocos.map(({ Icone, titulo, texto }) => (
                <div key={titulo} className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icone className="size-4 text-primary" aria-hidden="true" /> {titulo}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
                </div>
              ))}
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <p className="text-sm font-semibold text-foreground">Comissões (exemplo)</p>
                <ul className="mt-3 divide-y divide-border text-xs">
                  {linhas.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2.5">
                      <span className="min-w-0"><span className="block truncate text-foreground">{l.o}</span><span className="text-muted-foreground">{l.t}</span></span>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-semibold",
                        l.tom === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : l.tom === "info" ? "border-primary/30 bg-primary/10 text-foreground" : "border-border bg-muted text-muted-foreground")}>{l.s}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  O saque leva todo o saldo disponível. A Vincis faz o Pix para a chave cadastrada e registra o pagamento no painel.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Revelar>
    </section>
  );
}

/* ------------------------------------- FAQ ------------------------------------- */

function Perguntas({ faixa, protecaoDias }: { faixa: string; protecaoDias: number }) {
  const itens = [
    { p: "Preciso pagar para ser parceiro?", r: "Não. A participação é gratuita: não há taxa de adesão nem mensalidade." },
    { p: "Preciso ser contador ou advogado?", r: "Não. O Parceiro Indicador apenas apresenta a Vincis. Quem executa os serviços são os profissionais habilitados da plataforma." },
    { p: "Como me torno parceiro?", r: "Com uma conta confirmada na Vincis, abra a área do Programa de Parceiros e clique em “Ativar meu link”. O link é criado na hora, sem análise." },
    { p: "Quem conta como minha indicação?", r: `Quem acessa a Vincis pelo seu link e cria uma conta nova depois do clique. Quem já tinha conta na Vincis não vira indicação. O link fica guardado no navegador da pessoa por até ${DIAS_COOKIE_INDICACAO} dias; se ela abrir links de dois parceiros antes de se cadastrar, vale o último.` },
    { p: "Quando recebo a comissão de um plano?", r: `A cada mês do plano que for prestado e pago, nasce uma comissão de ${faixa}, conforme o seu nível naquele momento, e ela já fica disponível para saque. Vale para o primeiro plano contábil que o cliente indicado contratar, enquanto esse plano estiver ativo.` },
    { p: "E nos serviços avulsos?", r: `A comissão é de ${PERCENTUAL_AVULSO}% do valor do serviço contratado e pago pela Vincis, em qualquer nível. Ela é gerada na contratação e fica disponível quando o serviço é concluído.` },
    { p: "Orçamentos e consultas geram comissão?", r: "Hoje, a comissão avulsa é gerada na contratação de serviços do catálogo pagos pela plataforma. Pedidos de orçamento ficam registrados como indicação, mas não geram comissão por si só." },
    { p: "O que acontece se o cliente cancelar?", r: "Meses não prestados ou não pagos não geram comissão. Se uma contratação avulsa for cancelada antes da conclusão, a comissão é cancelada. Se o pagamento de um mês do plano for estornado, a comissão daquele mês é retirada." },
    { p: "Como faço o saque?", r: "Cadastre sua chave Pix no painel e solicite o saque do saldo disponível. O pedido leva todo o saldo disponível; a Vincis faz o Pix para a sua chave e registra o pagamento no painel." },
    { p: "Os percentuais podem mudar?", r: `Sim. A Vincis publica os níveis e pode atualizá-los. Comissões já geradas mantêm o percentual com que nasceram.${protecaoDias > 0 ? ` Se você ficar abaixo do mínimo do seu nível, mantém o nível por ${protecaoDias} ${protecaoDias === 1 ? "dia" : "dias"} antes de descer.` : ""}` },
  ];
  const [aberta, setAberta] = useState<number | null>(0);
  return (
    <section id="perguntas" className="container mx-auto px-4 py-20 sm:px-6 sm:py-28" aria-labelledby="titulo-perguntas">
      <Cabecalho id="titulo-perguntas" sobretitulo="Perguntas frequentes" titulo={<>Tire suas <span className="text-gradient-gold">dúvidas</span></>} />
      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {itens.map((it, i) => {
          const aberto = aberta === i;
          return (
            <div key={it.p} className="overflow-hidden rounded-2xl border border-border bg-card">
              <h3>
                <button type="button" onClick={() => setAberta(aberto ? null : i)} aria-expanded={aberto} aria-controls={`resposta-${i}`} id={`pergunta-${i}`}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  {it.p}
                  <ChevronDown className={cn("size-4 shrink-0 transition-transform", aberto ? "rotate-180 text-primary" : "text-muted-foreground")} aria-hidden="true" />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {aberto && (
                  <motion.div id={`resposta-${i}`} role="region" aria-labelledby={`pergunta-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                    <p className="px-5 pb-5 text-sm text-muted-foreground">{it.r}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------ Final ------------------------------------ */

function ChamadaFinal({ situacao, regrasHref }: { situacao: SituacaoNaPaginaPublica; regrasHref: string | null }) {
  return (
    <section className="container mx-auto px-4 pb-24 sm:px-6" aria-labelledby="titulo-final">
      <Revelar>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 text-center sm:p-14">
          <h2 id="titulo-final" className="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Conhece alguém que precisa da Vincis?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">Ative seu link, compartilhe e acompanhe suas indicações e comissões no painel.</p>
          <ChamadaParticipar situacao={situacao} centralizar className="mt-8" />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <a href="#simulador" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Simular comissões</a>
            {regrasHref && (
              <Link href={regrasHref} className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                <FileText className="size-4" aria-hidden="true" /> Regras do programa
              </Link>
            )}
            <Link href="/contato" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Falar com a Vincis</Link>
          </div>
        </div>
      </Revelar>
    </section>
  );
}

/* ------------------------------------ Página ------------------------------------ */

export function PaginaParceiros({
  niveis = null,
  situacao = "visitante",
  regrasHref = null,
}: {
  niveis?: NiveisPublicos | null;
  situacao?: SituacaoNaPaginaPublica;
  /** Página "Regras do Programa de Parceiros" do CMS, quando publicada. */
  regrasHref?: string | null;
}) {
  const faixa = faixaDosPercentuais(niveis);
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
        <Hero situacao={situacao} faixa={faixa} />
        <QuemPode />
        <section id="como-funciona" className="scroll-mt-24 border-y border-border bg-muted/20 py-20 sm:py-28" aria-labelledby="titulo-como">
          <div className="container mx-auto px-4 sm:px-6">
            <Cabecalho id="titulo-como" sobretitulo="Como funciona" titulo={<>A parceria, <span className="text-gradient-amber">passo a passo</span></>}
              descricao="Do seu link até o saque: veja o que acontece em cada etapa." />
            <div className="mt-12"><JornadaDoParceiro faixaRecorrente={faixa} /></div>
          </div>
        </section>
        <ComoGanha faixa={faixa} />
        <Niveis niveis={niveis} />
        <section id="simulador" className="scroll-mt-24 border-y border-border bg-muted/20 py-20 sm:py-28" aria-labelledby="titulo-simulador">
          <div className="container mx-auto px-4 sm:px-6">
            <Cabecalho id="titulo-simulador" sobretitulo="Simulador" titulo={<>Simule suas <span className="text-gradient-amber">comissões</span></>}
              descricao="Escolha a modalidade e ajuste os valores. O resultado muda na hora." />
            <div className="mt-10"><SimuladorDeComissoes niveis={niveis?.niveis ?? null} protecaoDias={niveis?.protecaoDias ?? 0} /></div>
          </div>
        </section>
        <PainelIlustrativo />
        <Perguntas faixa={faixa} protecaoDias={niveis?.protecaoDias ?? 0} />
        <ChamadaFinal situacao={situacao} regrasHref={regrasHref} />
      </div>
    </MotionConfig>
  );
}
