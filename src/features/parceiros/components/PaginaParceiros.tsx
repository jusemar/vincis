import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring, AnimatePresence, useMotionValue } from "framer-motion";
import {
  AreaChart, Area, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, Tooltip,
} from "recharts";
import {
  ArrowRight, Sparkles, Crown, Gem, Award, Users, Wallet, Repeat, TrendingUp,
  Trophy, ShieldCheck, CheckCircle2, Play, Star, Infinity as InfinityIcon,
  Rocket, Target, BadgeDollarSign, ChevronRight, Quote, Globe2, MousePointerClick,
  Flame,
} from "lucide-react";
import Footer from "../../../components/shared/Footer";

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0, duration = 1200 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number;
}) {
  const [n, setN] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);

  const formatted = n.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  return <span>{prefix}{formatted}{suffix}</span>;
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: React.ReactNode }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Sparkles className="size-3 text-primary" /> {eyebrow}
      </div>
      <h2 className="mt-4 font-display text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
        {title}
      </h2>
    </div>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);

  const mx = useMotionValue(0); const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-200, 200], [10, -10]), { stiffness: 80, damping: 15 });
  const ry = useSpring(useTransform(mx, [-200, 200], [-10, 10]), { stiffness: 80, damping: 15 });

  return (
    <section ref={ref} className="relative overflow-hidden pt-32 pb-32 md:pb-44">
      <motion.div style={{ y: yBg }} className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 60%)" }} />
        <div className="absolute -bottom-40 -right-32 h-[600px] w-[600px] rounded-full blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--amber-400) / 0.3), transparent 60%)" }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[300px] w-[1200px] blur-3xl opacity-40"
             style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.2), transparent 70%)" }} />
      </motion.div>

      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-2xl opacity-50"
          style={{
            width: 60 + i * 14, height: 60 + i * 14,
            left: `${10 + i * 14}%`, top: `${15 + (i * 9) % 60}%`,
            background: i % 2 ? "hsl(var(--primary) / 0.4)" : "hsl(var(--amber-400) / 0.4)",
          }}
          animate={{ y: [0, -30, 0], x: [0, 12, 0] }}
          transition={{ duration: 8 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
        />
      ))}

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center"
        >
          <div className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-muted-foreground">Programa de Parceiros 2026 · Vagas limitadas</span>
          </div>
        </motion.div>

        <div className="mt-8 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <motion.h1
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="font-display text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]"
            >
              Construa <span className="text-gradient-amber">renda recorrente</span><br />
              indicando clientes <span className="text-gradient-gold">de alto valor</span>.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground"
            >
              Seja um parceiro Vincis e ganhe <strong className="text-foreground">comissões vitalícias</strong> a cada cliente que indicar.
              Painel completo, materiais prontos e mentoria dedicada para você escalar de forma profissional.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <a href="#simulador" className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-on-primary glow-amber transition-all hover:scale-[1.02] bg-gradient-gold">
                Quero ser parceiro
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#painel" className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium hover:bg-white/5 transition">
                <Play className="size-4" /> Ver o painel
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="mt-10 grid grid-cols-3 gap-4 max-w-lg"
            >
              {[
                { v: 12480, p: "R$ ", s: "", l: "Pago em comissões/mês" },
                { v: 1240, l: "Parceiros ativos" },
                { v: 98, s: "%", l: "Pagamento em dia" },
              ].map((k) => (
                <div key={k.l} className="glass rounded-2xl p-3">
                  <div className="text-xl font-display font-semibold">
                    <AnimatedNumber value={k.v} prefix={k.p ?? ""} suffix={k.s ?? ""} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{k.l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            style={{ opacity }}
            onMouseMove={(e) => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              mx.set(e.clientX - r.left - r.width / 2);
              my.set(e.clientY - r.top - r.height / 2);
            }}
            onMouseLeave={() => { mx.set(0); my.set(0); }}
            className="lg:col-span-5 relative"
          >
            <motion.div
              style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
              className="relative"
            >
              <div className="glass-strong rounded-3xl p-6 shadow-elevated relative overflow-hidden">
                <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full blur-3xl"
                     style={{ background: "hsl(var(--primary) / 0.4)" }} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl grid place-items-center bg-gradient-gold">
                      <Sparkles className="size-4 text-on-primary" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Saldo disponível</div>
                      <div className="font-display text-2xl font-semibold">
                        R$ <AnimatedNumber value={18920.5} decimals={2} />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-amber-400">
                    <TrendingUp className="size-3" /> +31%
                  </div>
                </div>

                <div className="mt-6 h-32">
                  <ResponsiveContainer>
                    <AreaChart data={Array.from({ length: 14 }).map((_, i) => ({ x: i, y: 200 + i * 90 + Math.sin(i) * 80 }))}>
                      <defs>
                        <linearGradient id="grHero" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="y" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#grHero)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[
                    { l: "Indicações", v: 184 },
                    { l: "Recorrentes", v: 97 },
                    { l: "Conversão", v: 34, s: "%" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-xl bg-white/[0.04] p-2.5">
                      <div className="text-base font-semibold"><AnimatedNumber value={s.v} suffix={s.s ?? ""} /></div>
                      <div className="text-[10px] text-muted-foreground">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -12, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-6 -bottom-4 glass rounded-2xl p-3 flex items-center gap-2 shadow-xl"
              >
                <div className="h-8 w-8 rounded-lg grid place-items-center bg-gradient-gold">
                  <Trophy className="size-4 text-on-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Top 3 nacional</div>
                  <div className="text-sm font-semibold">Belo Horizonte</div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-4 -top-4 glass rounded-2xl px-3 py-2 flex items-center gap-2 shadow-xl"
              >
                <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <div className="text-xs">+R$ 480 agora</div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="mt-20 border-y border-white/5 py-5 overflow-hidden">
        <motion.div className="flex gap-12 whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
          {[...Array(2)].flatMap((_, k) =>
            ["Renda recorrente vitalícia", "Pagamento semanal", "Materiais prontos", "Mentoria dedicada", "Painel completo", "Sem mensalidade"].map((t, i) => (
              <div key={`${k}-${i}`} className="flex items-center gap-3 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-primary" />
                {t}
              </div>
            ))
          )}
        </motion.div>
      </div>
    </section>
  );
}

function ComoFunciona() {
  const steps = [
    { n: "01", icon: MousePointerClick, t: "Cadastre-se", d: "Aplicação rápida. Aprovação em até 24h." },
    { n: "02", icon: Rocket, t: "Acesse seu painel", d: "Link único, materiais prontos e treinamentos exclusivos." },
    { n: "03", icon: Target, t: "Indique clientes", d: "Compartilhe nas redes, no WhatsApp ou em eventos." },
    { n: "04", icon: Wallet, t: "Receba vitalício", d: "Comissão recorrente todo mês enquanto o cliente permanecer." },
  ];
  return (
    <section id="como" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Como funciona" title={<>Quatro passos para a sua <span className="text-gradient-amber">primeira comissão</span></>} />
      <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {steps.map((s, i) => (
          <motion.div key={s.n}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            whileHover={{ y: -6 }}
            className="glass rounded-3xl p-6 relative overflow-hidden group"
          >
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition"
                 style={{ background: i % 2 ? "hsl(var(--amber-400) / 0.4)" : "hsl(var(--primary) / 0.4)" }} />
            <div className="text-xs text-muted-foreground font-mono">{s.n}</div>
            <div className="mt-4 h-12 w-12 rounded-2xl grid place-items-center bg-gradient-gold">
              <s.icon className="size-5 text-on-primary" />
            </div>
            <div className="mt-5 font-display text-xl font-semibold">{s.t}</div>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Niveis() {
  const tiers = [
    {
      name: "Bronze", icon: Award, pct: "10%", desc: "Comece a indicar e construa sua base.",
      perks: ["Link de indicação", "Materiais prontos", "Pagamento mensal"], popular: false,
    },
    {
      name: "Prata", icon: Gem, pct: "20%", desc: "Para parceiros consistentes que escalam.",
      perks: ["Tudo do Bronze", "Mentoria mensal", "Pagamento quinzenal", "Eventos exclusivos"], popular: true,
    },
    {
      name: "Diamante", icon: Crown, pct: "30%", desc: "Status de elite, renda de verdadeiros líderes.",
      perks: ["Tudo do Prata", "Gestor dedicado", "Pagamento semanal", "Bônus por meta", "Acesso aos lançamentos"], popular: false,
    },
  ];
  return (
    <section id="niveis" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Níveis de carreira" title={<>Suba de nível e <span className="text-gradient-gold">multiplique</span> sua renda</>} />
      <div className="mt-14 grid md:grid-cols-3 gap-6">
        {tiers.map((t, i) => (
          <motion.div key={t.name}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className={`relative glass-strong rounded-3xl p-7 ${t.popular ? "ring-1 ring-primary/50 glow-amber" : ""}`}
          >
            {t.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-on-primary bg-gradient-gold">
                Mais escolhido
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl grid place-items-center bg-gradient-gold">
                <t.icon className="size-5 text-on-primary" />
              </div>
              <div>
                <div className="font-display text-xl font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold">{t.pct}</span>
              <span className="text-sm text-muted-foreground">comissão recorrente</span>
            </div>
            <ul className="mt-6 space-y-3">
              {t.perks.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-primary" /> {p}
                </li>
              ))}
            </ul>
            <a href="#simulador" className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              t.popular ? "text-on-primary bg-gradient-gold" : "glass hover:bg-white/5"
            }`}>
              Quero esse nível <ArrowRight className="size-4" />
            </a>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Simulador() {
  const [clientes, setClientes] = useState(15);
  const [ticket, setTicket] = useState(450);
  const [tier, setTier] = useState<"bronze" | "prata" | "diamante">("prata");
  const pct = tier === "bronze" ? 0.1 : tier === "prata" ? 0.2 : 0.3;
  const mensal = clientes * ticket * pct;
  const anual = mensal * 12;
  const cinco = mensal * 60;

  const data = useMemo(
    () => Array.from({ length: 12 }).map((_, i) => ({ m: i + 1, v: mensal * (i + 1) })),
    [mensal]
  );

  return (
    <section id="simulador" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Simulador interativo" title={<>Veja <span className="text-gradient-amber">quanto você pode ganhar</span> por mês</>} />

      <div className="mt-14 grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass-strong rounded-3xl p-7 space-y-7">
          <Slider label="Clientes indicados/mês" value={clientes} min={1} max={80} suffix=" clientes" onChange={setClientes} />
          <Slider label="Ticket médio mensal" value={ticket} min={100} max={2000} step={50} prefix="R$ " onChange={setTicket} />
          <div>
            <div className="text-xs text-muted-foreground mb-2">Seu nível</div>
            <div className="grid grid-cols-3 gap-2">
              {(["bronze","prata","diamante"] as const).map((t) => (
                <button key={t} onClick={() => setTier(t)}
                  className={`rounded-xl py-2.5 text-xs font-semibold capitalize transition ${
                    tier === t ? "text-on-primary bg-gradient-gold" : "glass hover:bg-white/5"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 glass-strong rounded-3xl p-7 relative overflow-hidden">
          <div className="absolute -top-32 -right-32 h-72 w-72 rounded-full blur-3xl"
               style={{ background: "hsl(var(--primary) / 0.3)" }} />
          <div className="grid grid-cols-3 gap-3 relative">
            <Stat label="Renda mensal" value={mensal} highlight />
            <Stat label="Em 12 meses" value={anual} />
            <Stat label="Em 5 anos" value={cinco} />
          </div>
          <div className="mt-7 h-56 relative">
            <ResponsiveContainer>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="grSim" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`, "Acumulado"]}
                  labelFormatter={(l) => `Mês ${l}`}
                />
                <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#grSim)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            * Estimativa baseada em comissão recorrente. Resultados reais variam de acordo com retenção e perfil dos clientes indicados.
          </p>
        </div>
      </div>
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, prefix = "", suffix = "", onChange }:
  { label: string; value: number; min: number; max: number; step?: number; prefix?: string; suffix?: string; onChange: (n: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-base font-semibold">{prefix}{value.toLocaleString("pt-BR")}{suffix}</div>
      </div>
      <div className="relative h-2 rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-gold" style={{ width: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={(e) => onChange(Number(e.target.value))}
               className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg
                          [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-primary" />
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${highlight ? "ring-1 ring-primary/50" : ""}`}
         style={highlight ? { background: "linear-gradient(135deg, hsl(var(--primary) / 0.15), transparent)" } : { background: "oklch(1 0 0 / 0.03)" }}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">
        R$ <AnimatedNumber value={value} decimals={0} />
      </div>
    </div>
  );
}

function PainelPreview() {
  return (
    <section id="painel" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Painel do Parceiro" title={<>Tudo o que você precisa em <span className="text-gradient-gold">um só lugar</span></>} />

      <motion.div
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="mt-12 relative"
      >
        <div className="absolute -inset-4 rounded-[2rem] blur-3xl opacity-50"
             style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(var(--amber-400) / 0.4))" }} />
        <div className="relative glass-strong rounded-3xl overflow-hidden shadow-elevated">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <span className="h-3 w-3 rounded-full bg-red-400/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
            <span className="h-3 w-3 rounded-full bg-amber-400/70" />
            <div className="ml-4 text-xs text-muted-foreground">app.vincis.com/painel</div>
          </div>

          <div className="grid lg:grid-cols-12 gap-0">
            <div className="lg:col-span-2 border-r border-white/5 p-5 hidden lg:block">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-8 w-8 rounded-lg grid place-items-center bg-gradient-gold">
                  <Sparkles className="size-4 text-on-primary" />
                </div>
                <div className="font-display text-sm font-semibold">Vincis</div>
              </div>
              {["Visão geral","Indicações","Materiais","Comissões","Ranking","Mentoria"].map((m, i) => (
                <div key={m} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-1 ${
                  i === 0 ? "bg-white/5 text-foreground" : "text-muted-foreground"
                }`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-primary" : "bg-white/20"}`} />
                  {m}
                </div>
              ))}
            </div>

            <div className="lg:col-span-10 p-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Bem-vindo de volta</div>
                  <div className="font-display text-2xl font-semibold">Olá, Lucas 👋</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="glass rounded-full px-3 py-1.5 text-xs flex items-center gap-2">
                    <Crown className="size-3 text-amber-500" /> Diamante 87%
                  </div>
                </div>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { l: "Ganhos no mês", v: 8420, p: "R$ ", i: Wallet },
                  { l: "Recorrente", v: 4280, p: "R$ ", i: Repeat },
                  { l: "Indicações", v: 184, i: Users },
                  { l: "Conversão", v: 34, s: "%", i: Target },
                ].map((k) => (
                  <div key={k.l} className="rounded-2xl p-4 bg-white/[0.03] border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground">{k.l}</div>
                      <div className="h-7 w-7 rounded-lg grid place-items-center bg-gradient-gold">
                        <k.i className="size-3.5 text-on-primary" />
                      </div>
                    </div>
                    <div className="mt-2 font-display text-xl font-semibold">
                      <AnimatedNumber value={k.v} prefix={k.p ?? ""} suffix={k.s ?? ""} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-2xl p-4 bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Ganhos · 12 meses</div>
                    <div className="text-[11px] text-muted-foreground">+31% vs ano anterior</div>
                  </div>
                  <div className="mt-3 h-44">
                    <ResponsiveContainer>
                      <AreaChart data={Array.from({ length: 12 }).map((_, i) => ({ x: i, y: 800 + i * 380 + Math.sin(i) * 200 }))}>
                        <defs>
                          <linearGradient id="grPanel" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--amber-400))" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="hsl(var(--amber-400))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="y" stroke="hsl(var(--amber-400))" strokeWidth={2} fill="url(#grPanel)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-2xl p-4 bg-white/[0.03] border border-white/5 grid place-items-center">
                  <div className="h-44 w-full">
                    <ResponsiveContainer>
                      <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ name: "x", value: 87, fill: "hsl(var(--primary))" }]} startAngle={90} endAngle={-270}>
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar background={{ fill: "oklch(1 0 0 / 0.05)" } as unknown as Record<string, unknown>} dataKey="value" cornerRadius={20} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="-mt-32 text-center pointer-events-none">
                    <div className="font-display text-2xl font-semibold">87%</div>
                    <div className="text-[10px] text-muted-foreground">para Diamante</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <a href="/admin" className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
          Explorar painel completo <ArrowRight className="size-4" />
        </a>
      </motion.div>
    </section>
  );
}

function Ranking() {
  const list = [
    { p: 1, n: "Marina Costa", c: "São Paulo · SP", v: 28430, g: 24, t: "Diamante" },
    { p: 2, n: "Rafael Andrade", c: "Curitiba · PR", v: 24100, g: 18, t: "Diamante" },
    { p: 3, n: "Camila Reis", c: "Recife · PE", v: 21800, g: 21, t: "Prata" },
    { p: 4, n: "Diego Martins", c: "Porto Alegre · RS", v: 19250, g: 9, t: "Prata" },
    { p: 5, n: "Aline Souza", c: "Salvador · BA", v: 17400, g: 14, t: "Prata" },
  ];
  return (
    <section id="ranking" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Ranking nacional" title={<>Os parceiros que estão <span className="text-gradient-amber">faturando alto</span></>} />

      <div className="mt-12 grid lg:grid-cols-3 gap-4">
        {[list[1], list[0], list[2]].map((u, idx) => {
          const pos = u.p;
          const heights = [180, 220, 160];
          return (
            <motion.div
              key={u.n}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className={`glass-strong rounded-3xl p-6 text-center relative ${pos === 1 ? "lg:order-2 ring-1 ring-amber-500/50" : pos === 2 ? "lg:order-1" : "lg:order-3"}`}
            >
              <div className="flex items-center justify-center">
                <div className="relative h-20 w-20 rounded-full grid place-items-center font-display text-2xl font-semibold bg-gradient-gold">
                  {u.n.split(" ").map(s => s[0]).slice(0,2).join("")}
                  <div className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full grid place-items-center bg-background border border-white/10 font-mono text-xs">
                    {pos}
                  </div>
                </div>
              </div>
              <div className="mt-4 font-display text-lg font-semibold">{u.n}</div>
              <div className="text-xs text-muted-foreground">{u.c}</div>
              <div className="mt-4 font-display text-2xl font-semibold">
                R$ <AnimatedNumber value={u.v} />
              </div>
              <div className="mt-1 text-xs text-amber-400 inline-flex items-center gap-1">
                <TrendingUp className="size-3" /> +{u.g}% no mês
              </div>
              <div className="mt-4 mx-auto rounded-t-xl"
                   style={{ height: heights[idx], width: 50, background: "linear-gradient(180deg, oklch(1 0 0 / 0.08), transparent)" }} />
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 glass rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Flame className="size-4 text-amber-500" />
          <span className="text-sm font-semibold">Comissões pagas agora</span>
          <span className="ml-auto text-[10px] text-muted-foreground">ao vivo</span>
        </div>
        <div className="overflow-hidden py-3">
          <motion.div className="flex gap-8 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}>
            {[...Array(2)].flatMap((_, k) =>
              ["Marina · R$ 480", "Rafael · R$ 280", "Camila · R$ 360", "Diego · R$ 540", "Aline · R$ 220", "Bruno · R$ 410", "Júlia · R$ 180"]
                .map((s, i) => (
                  <span key={`${k}-${i}`} className="text-sm text-muted-foreground inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> {s}
                  </span>
                ))
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Depoimentos() {
  const items = [
    { n: "Marina C.", r: "Top 1 nacional", q: "Em 8 meses construí uma renda recorrente que substituiu meu salário. O painel é absurdamente intuitivo." },
    { n: "Rafael A.", r: "Diamante", q: "O suporte e os materiais fazem total diferença. Eu só compartilho — a Vincis cuida do resto." },
    { n: "Camila R.", r: "Prata", q: "Comecei sem entender de nada e em 60 dias bati minha primeira meta. O simulador é literalmente real." },
  ];
  return (
    <section className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Quem já é parceiro" title={<>Histórias reais de quem <span className="text-gradient-amber">vive da Vincis</span></>} />
      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {items.map((t, i) => (
          <motion.div key={t.n}
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="glass rounded-3xl p-6"
          >
            <Quote className="size-6 text-primary opacity-70" />
            <p className="mt-3 text-sm text-foreground/90 leading-relaxed">&ldquo;{t.q}&rdquo;</p>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full grid place-items-center font-semibold bg-gradient-gold text-on-primary">
                {t.n[0]}
              </div>
              <div>
                <div className="text-sm font-semibold">{t.n}</div>
                <div className="text-[11px] text-muted-foreground">{t.r}</div>
              </div>
              <div className="ml-auto flex gap-0.5">
                {[...Array(5)].map((_, k) => <Star key={k} className="size-3.5 fill-amber-500 text-amber-500" />)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "Preciso pagar para ser parceiro?", a: "Não. O programa Vincis é 100% gratuito. Você só investe seu tempo." },
    { q: "Como funciona o pagamento?", a: "Pagamentos via Pix. Mensal no Bronze, quinzenal no Prata e semanal no Diamante." },
    { q: "Posso indicar de qualquer cidade?", a: "Sim. Atendemos todo o Brasil e parceiros podem atuar 100% online." },
    { q: "O que acontece se o cliente cancelar?", a: "Você recebe enquanto o cliente estiver ativo. Sem letra miúda." },
    { q: "Existe meta mínima?", a: "Não há meta obrigatória, mas há bônus por performance ao subir de nível." },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="container mx-auto px-6 py-28 relative">
      <SectionHeader eyebrow="Perguntas frequentes" title={<>Tire suas <span className="text-gradient-gold">dúvidas</span></>} />
      <div className="mt-12 max-w-3xl mx-auto space-y-3">
        {items.map((it, i) => (
          <div key={it.q} className="glass rounded-2xl overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left">
              <span className="font-medium">{it.q}</span>
              <ChevronRight className={`size-4 transition ${open === i ? "rotate-90 text-primary" : "text-muted-foreground"}`} />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="px-5 pb-5 text-sm text-muted-foreground"
                >
                  {it.a}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTAFinal() {
  return (
    <section className="container mx-auto px-6 py-28">
      <div className="relative overflow-hidden rounded-3xl p-10 md:p-16 text-center bg-gradient-hero">
        <div className="absolute inset-0 bg-grid opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.6 }} className="relative">
          <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs">
            <InfinityIcon className="size-3 text-primary" /> Renda vitalícia
          </div>
          <h2 className="mt-5 font-display text-4xl md:text-6xl font-semibold leading-[1.05]">
            Sua próxima década <br /> começa <span className="text-gradient-amber">aqui</span>.
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-muted-foreground">
            Junte-se a centenas de parceiros que já constroem renda recorrente com a Vincis. Sem mensalidade, sem letra miúda.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#simulador" className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-on-primary glow-amber hover:scale-[1.02] transition bg-gradient-gold">
              Quero me cadastrar agora <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#faq" className="glass rounded-full px-5 py-3 text-sm font-medium hover:bg-white/5">
              Tenho dúvidas
            </a>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Aprovação em 24h</div>
            <div className="inline-flex items-center gap-1.5"><BadgeDollarSign className="size-3.5" /> Sem mensalidade</div>
            <div className="inline-flex items-center gap-1.5"><Globe2 className="size-3.5" /> Atuação nacional</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function PaginaParceiros() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <main>
        <Hero />
        <ComoFunciona />
        <Niveis />
        <Simulador />
        <PainelPreview />
        <Ranking />
        <Depoimentos />
        <FAQ />
        <CTAFinal />
      </main>
      <Footer />
    </div>
  );
}
