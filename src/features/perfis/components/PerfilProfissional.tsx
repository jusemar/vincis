import { useState, useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  Calendar,
  ChevronRight,
  Globe,
  HelpCircle,
  Lock,
  Paperclip,
  Quote,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Check,
  Clock,
  BarChart3,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const portfolios = [
  { initial: "N", name: "Nexus Media Group", tag: "Estratégia Fiscal Recorrente • SaaS", arr: "R$ 1.2M", health: "Crescimento Saudável" },
  { initial: "V", name: "Vertex Logistics", tag: "Otimização Tributária • Enterprise", arr: "R$ 850k", health: "Otimizado" },
  { initial: "A", name: "Aurum Capital", tag: "Holding Patrimonial • Family Office", arr: "R$ 2.1M", health: "Top Performer" },
  { initial: "L", name: "Lumina Health", tag: "BPO Financeiro • HealthTech", arr: "R$ 640k", health: "Em Expansão" },
];

const services = [
  {
    name: "Essencial",
    price: "R$ 1.290",
    period: "/mês",
    highlight: false,
    features: [
      "Contabilidade mensal completa",
      "Imposto de renda pessoa jurídica",
      "Certidões negativas",
      "Suporte por e-mail",
    ],
  },
  {
    name: "Growth",
    price: "R$ 2.890",
    period: "/mês",
    highlight: true,
    features: [
      "Tudo do Essencial",
      "BPO financeiro (contas a pagar/receber)",
      "Relatórios gerenciais mensais",
      "Planejamento tributário preventivo",
      "Suporte prioritário WhatsApp",
    ],
  },
  {
    name: "Diamond",
    price: "Sob consulta",
    period: "",
    highlight: false,
    features: [
      "Tudo do Growth",
      "Holding patrimonial",
      "Controller externo dedicado",
      "Comitê fiscal trimestral",
    ],
  },
];

const aLaCarte = [
  {
    name: "Abertura de empresa",
    short: "CNPJ, inscrição estadual e enquadramento tributário ideal.",
    description: "Estruturação completa do CNPJ com escolha do regime tributário mais vantajoso, registro em todos os órgãos competentes e entrega do certificado digital.",
    deliverables: ["CNPJ ativo em até 7 dias", "Certificado digital A1", "Enquadramento tributário otimizado", "Alvará e inscrições municipais"],
    price: "R$ 1.490",
    duration: "Entrega em 7 dias úteis",
  },
  {
    name: "Planejamento tributário pontual",
    short: "Diagnóstico fiscal completo com cenários de economia.",
    description: "Análise profunda dos últimos 12 meses da operação, modelagem comparativa de regimes (Simples, Lucro Presumido e Real) e plano de ação tributário com economia projetada.",
    deliverables: ["Relatório executivo de 30 páginas", "Comparativo de 3 cenários", "Plano de migração tributária", "Reunião de apresentação com sócios"],
    price: "R$ 3.890",
    duration: "Conclusão em 15 dias",
  },
  {
    name: "Parecer fiscal especializado",
    short: "Opinião técnica formal para operações sensíveis.",
    description: "Parecer técnico fundamentado em legislação atualizada para suportar decisões sensíveis: M&A, distribuição de lucros, operações internacionais ou questionamentos do fisco.",
    deliverables: ["Parecer assinado por sócio", "Base legal consolidada", "Análise de jurisprudência recente", "Suporte em eventual defesa"],
    price: "R$ 2.450",
    duration: "Entrega em 10 dias",
  },
  {
    name: "Estruturação de holding",
    short: "Proteção patrimonial e sucessão para fundadores.",
    description: "Modelagem societária completa para holding patrimonial ou familiar, com integralização de bens, planejamento sucessório e redução legal de carga tributária sobre dividendos.",
    deliverables: ["Contrato social personalizado", "Plano sucessório", "Integralização de bens", "Acompanhamento jurídico parceiro"],
    price: "R$ 6.900",
    duration: "Implementação em 30 dias",
  },
  {
    name: "Auditoria interna express",
    short: "Revisão de 12 meses de escrita fiscal e contábil.",
    description: "Auditoria independente sobre escrituração contábil, fiscal e folha dos últimos 12 meses, identificando riscos, créditos não aproveitados e inconsistências antes que o fisco identifique.",
    deliverables: ["Mapa de riscos por severidade", "Recuperação de créditos", "Plano de remediação", "Apresentação executiva final"],
    price: "R$ 4.290",
    duration: "Conclusão em 20 dias",
  },
  {
    name: "Due diligence para investimento",
    short: "Validação contábil-fiscal para rodadas e M&A.",
    description: "Documentação contábil, fiscal e trabalhista preparada no padrão exigido por investidores institucionais — pronta para data room de rodadas Seed a Série B.",
    deliverables: ["Data room organizado", "QoE simplificado", "Mapa de contingências", "Q&A com investidor"],
    price: "Sob consulta",
    duration: "Conforme escopo",
  },
];

const reviews = [
  {
    name: "Camila Tavares",
    role: "CEO • Nexus Media",
    content: "A Ricardo elevou nosso planejamento fiscal a outro nível. Em 6 meses, reduzimos nossa carga tributária em 18% sem qualquer exposição a riscos. A transparência na gestão é algo que eu não encontrava em outros escritórios.",
    rating: 5,
  },
  {
    name: "Henrique Salles",
    role: "Founder • Vertex Log",
    content: "Depois de anos com contadores tradicionais, a abordagem consultiva da Vincis fez toda diferença. Não é só uma contadora — é uma parceira estratégica que entende de negócio.",
    rating: 5,
  },
];

const calendarDays: { d: number; muted: boolean; busy?: boolean; selected?: boolean }[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ d: i + 26, muted: true })),
  ...Array.from({ length: 21 }, (_, i) => ({
    d: i + 1,
    muted: false,
    busy: [3, 7, 10, 15, 18, 20].includes(i + 1),
    selected: i + 1 === 14,
  })),
];

const timeSlots = ["09:30", "11:00", "15:30"];

function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 30, stiffness: 100 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (inView) {
      motionValue.set(value);
    }
  }, [inView, motionValue, value]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (latest) => {
      setDisplay(`${prefix}${latest.toFixed(decimals)}${suffix}`);
    });
    return unsubscribe;
  }, [spring, prefix, suffix, decimals]);

  return <span ref={ref}>{display}</span>;
}

function AlaCarteSection() {
  const [selected, setSelected] = useState(0);
  const item = aLaCarte[selected];

  return (
    <section id="avulsos">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400 font-semibold mb-2">
            Serviços avulsos
          </p>
          <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Soluções pontuais, executadas com precisão
          </h2>
          <p className="text-stone-500 dark:text-stone-400 mt-2 max-w-xl">
            Para demandas específicas que não exigem contrato recorrente. Escopo fechado, preço transparente, prazo garantido.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-stone-500">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Disponibilidade imediata em todos os escopos
        </div>
      </div>

      <div className="glass-card rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* List column */}
        <div className="border-b lg:border-b-0 lg:border-r border-stone-200/70 dark:border-stone-700/70 max-h-[520px] overflow-y-auto">
          {aLaCarte.map((s, i) => {
            const active = i === selected;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "w-full text-left px-5 py-4 border-b border-stone-200/60 dark:border-stone-700/60 last:border-b-0 transition-all relative group",
                  active ? "bg-amber-500/5" : "hover:bg-stone-100/40 dark:hover:bg-stone-800/40"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="alc-indicator"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-amber-500"
                  />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "font-semibold text-[15px] tracking-tight",
                        active ? "text-stone-900 dark:text-stone-100" : "text-stone-800 dark:text-stone-200"
                      )}
                    >
                      {s.name}
                    </p>
                    <p className="text-xs text-stone-500 mt-1 line-clamp-1">{s.short}</p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "size-4 mt-1 shrink-0 transition-all",
                      active
                        ? "text-amber-500 translate-x-0.5"
                        : "text-stone-300 dark:text-stone-600 group-hover:text-stone-500"
                    )}
                  />
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-2 tracking-wide">
                  {s.price}
                  <span className="text-stone-400 dark:text-stone-500 font-normal ml-2">• {s.duration}</span>
                </p>
              </button>
            );
          })}
        </div>

        {/* Detail column */}
        <motion.div
          key={item.name}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="p-8 lg:p-10 relative"
        >
          <div className="absolute top-0 right-0 size-48 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-[100px] pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100/80 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700/80 text-[10px] uppercase tracking-widest text-stone-600 dark:text-stone-400 font-semibold mb-5">
              <Sparkles className="size-3 text-amber-500" /> Escopo fechado
            </div>

            <h3 className="text-2xl lg:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-3">
              {item.name}
            </h3>
            <p className="text-stone-600 dark:text-stone-400 leading-relaxed mb-8 max-w-2xl">{item.description}</p>

            <p className="text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400 font-bold mb-3">
              O que está incluído
            </p>
            <div className="grid sm:grid-cols-2 gap-2.5 mb-8">
              {item.deliverables.map((d) => (
                <div
                  key={d}
                  className="flex items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300"
                >
                  <BadgeCheck className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{d}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 pt-6 border-t border-stone-200/70 dark:border-stone-700/70">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400 font-bold">
                  Investimento
                </p>
                <p className="text-3xl font-bold text-stone-900 dark:text-stone-100 mt-1">
                  {item.price}
                </p>
                <p className="text-xs text-stone-500 mt-1">{item.duration}</p>
              </div>
              <div className="flex gap-2">
                <button className="px-5 py-3 rounded-full border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm font-medium hover:bg-stone-100/60 dark:hover:bg-stone-800/60 transition-colors">
                  Tirar dúvidas
                </button>
                <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-navy-900 text-sm font-bold hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.6)] transition-all">
                  {item.price === "Sob consulta" ? "Solicitar proposta" : "Comprar agora"}
                  <ArrowUpRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PerfilProfissional() {
  const [consultAudience, setConsultAudience] = useState<"private" | "public">("private");
  const [selectedDay, setSelectedDay] = useState<number | null>(14);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  return (
    <div className="relative min-h-screen bg-stone-50 dark:bg-navy-900">
      <div className="ambient-gold" />

      <main className="relative z-10 pt-28 pb-32 px-6 lg:px-8 max-w-[1440px] mx-auto">
        {/* Hero */}
        <section id="overview" className="flex flex-col lg:flex-row gap-14 items-start mb-20">
          {/* ID Badge */}
          <motion.div
            initial={{ opacity: 0, y: 40, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
            className="relative mx-auto lg:mx-0 group"
          >
            {/* Lanyard */}
            <div className="absolute left-1/2 -top-20 -translate-x-1/2 flex flex-col items-center">
              <div className="w-3 h-20 bg-gradient-to-b from-amber-500/80 to-amber-500 rounded-b-sm shadow-lg" />
              <div className="size-7 rounded-md bg-zinc-300 border border-zinc-400/60 -mt-1 shadow-md" />
            </div>
            <div className="absolute -inset-2 bg-gradient-to-b from-amber-500/30 to-transparent rounded-[2rem] blur-2xl opacity-60 group-hover:opacity-90 transition-opacity" />
            <motion.div
              whileHover={{ y: -4, rotate: 0.5 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="relative w-[320px] h-[500px] bg-white dark:bg-navy-800 rounded-[1.75rem] shadow-2xl flex flex-col p-0 overflow-hidden ring-1 ring-black/10 dark:ring-white/10"
            >
              <div className="w-full pt-12 px-7 flex flex-col items-center">
                <div className="flex items-center gap-2 mb-7 self-start">
                  <div className="size-6 border-2 border-amber-500 rounded-full flex items-center justify-center">
                    <div className="size-2 bg-amber-500 rounded-full" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-[0.18em]">
                    Vincis Elite
                  </span>
                </div>

                <div className="size-36 rounded-full border-4 border-amber-500 p-1 mb-5">
                  <div className="w-full h-full rounded-full bg-stone-100 dark:bg-navy-700 flex items-center justify-center overflow-hidden">
                    <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                      RM
                    </span>
                  </div>
                </div>

                <h2 className="text-zinc-900 dark:text-zinc-100 font-bold text-2xl tracking-tight">
                  RICARDO MOURA
                </h2>
                <p className="text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase tracking-[0.22em] mt-1 mb-7">
                  Sócio Sênior • Nível 4
                </p>

                <div className="w-full grid grid-cols-2 gap-4 border-t border-zinc-100 dark:border-zinc-700 pt-5">
                  <div>
                    <p className="text-[9px] text-stone-500 uppercase tracking-wider">CRC</p>
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">SP-294.102/O</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-stone-500 uppercase tracking-wider">Válido até</p>
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">12/2028</p>
                  </div>
                </div>
              </div>

              <div className="mt-auto w-full h-24 bg-amber-500 flex items-center justify-between px-6">
                <div>
                  <p className="text-[9px] font-bold text-navy-900/70 uppercase tracking-widest">
                    Verified Partner
                  </p>
                  <p className="text-sm font-bold text-navy-900">vincis.com/ricardo</p>
                </div>
                <div className="size-14 bg-white p-1.5 rounded-sm">
                  <div
                    className="w-full h-full bg-stone-50"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg,#09090b 0 2px,#fff 2px 4px),repeating-linear-gradient(90deg,#09090b 0 2px,#fff 2px 4px)",
                      backgroundBlendMode: "multiply",
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Profile content */}
          <div className="flex-1 space-y-9 w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="space-y-5"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                Top 1% • Parceiro de Escalabilidade
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold text-stone-900 dark:text-stone-100 tracking-tight leading-[1.05]">
                Domínio fiscal,
                <br />
                <span className="text-gradient-gold">crescimento composto.</span>
              </h1>
              <p className="text-stone-500 dark:text-stone-400 text-lg max-w-2xl leading-relaxed">
                Ricardo é sócio estratégico especializado em gestão fiscal para SaaS de alto
                crescimento. Pela plataforma Vincis, gerencia <strong className="text-stone-900 dark:text-stone-100">R$ 12,4M</strong> em
                receita recorrente distribuída em <strong className="text-stone-900 dark:text-stone-100">14 portfólios</strong>{" "}
                enterprise.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button className="group flex items-center gap-2 px-6 py-3 bg-amber-500 text-navy-900 font-bold rounded-full hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.5)] transition-all">
                  Agendar Consultoria Estratégica
                  <ArrowUpRight className="size-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
                <button className="flex items-center gap-2 px-6 py-3 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-medium rounded-full hover:bg-stone-100/60 dark:hover:bg-stone-800/60 transition-colors">
                  <Globe className="size-4" /> Ver portfólio público
                </button>
              </div>
            </motion.div>

            {/* Metrics */}
            <motion.div
              id="metrics"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
              }}
              className="grid grid-cols-1 md:grid-cols-3 gap-5"
            >
              {[
                {
                  label: "Recorrência mensal",
                  value: <AnimatedNumber prefix="R$ " value={42850} />,
                  trend: "+12,4% vs mês anterior",
                  trendColor: "text-emerald-600 dark:text-emerald-400",
                  glow: true,
                  icon: TrendingUp,
                },
                {
                  label: "Portfólios ativos",
                  value: <AnimatedNumber value={14} suffix=" entidades" />,
                  trend: "Próxima abertura: Fev 2026",
                  trendColor: "text-stone-500",
                  icon: Users,
                },
                {
                  label: "Trust score",
                  value: <AnimatedNumber value={99.8} decimals={1} suffix="%" />,
                  trend: "NPS 92 • 0 disputas em 36 meses",
                  trendColor: "text-stone-500",
                  icon: ShieldCheck,
                  progress: 99.8,
                },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <motion.div
                    key={m.label}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
                    }}
                    className={cn(
                      "glass-card p-6 rounded-2xl",
                      m.glow && "shadow-lg shadow-amber-500/10"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-stone-500 uppercase tracking-widest">{m.label}</p>
                      <Icon className="size-4 text-amber-500/70" />
                    </div>
                    <p className="text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                      {m.value}
                    </p>
                    {m.progress !== undefined ? (
                      <div className="mt-4 w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${m.progress}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.4, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-300"
                        />
                      </div>
                    ) : (
                      <p className={cn("mt-4 text-sm font-medium", m.trendColor)}>{m.trend}</p>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* Portfolios */}
        <section id="portfolios" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Portfolio List */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-4">
                Portfólios ativos
              </h3>
              {portfolios.map((p, i) => (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {p.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {p.name}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      {p.tag}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600 dark:text-amber-400">{p.arr}</p>
                    <p className="text-xs text-stone-500">{p.health}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Chart */}
            <div className="lg:col-span-2">
              <div className="glass-card rounded-xl p-6 h-full">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Escalabilidade projetada
                  </h3>
                  <BarChart3 className="size-4 text-stone-400" />
                </div>
                <div className="flex items-end justify-between h-48 gap-3">
                  {[30, 45, 40, 65, 80, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${h}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                      className="flex-1 rounded-t-lg bg-gradient-to-t from-amber-500 to-amber-300 relative group"
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium text-stone-500 dark:text-stone-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        {["2025", "2026", "2027", "2028", "2029", "2030"][i]}
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="flex justify-between mt-4">
                  {["25", "26", "27", "28", "29", "30"].map((y) => (
                    <span key={y} className="text-xs text-stone-400">
                      {y}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Services / Pricing */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100">
              Planos de assessoria
            </h2>
            <p className="mt-2 text-stone-500 dark:text-stone-400">
              Escolha o plano ideal para o seu negócio
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <motion.div
                key={service.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "relative rounded-2xl p-6 border transition-all",
                  service.highlight
                    ? "bg-gradient-to-b from-amber-500/10 to-transparent border-amber-500/30 shadow-lg shadow-amber-500/10 scale-105"
                    : "glass-card"
                )}
              >
                {service.highlight && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white border-0">
                    Mais escolhido
                  </Badge>
                )}
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  {service.name}
                </h3>
                <div className="mt-3 mb-4">
                  <span className="text-3xl font-bold text-stone-900 dark:text-stone-100">
                    {service.price}
                  </span>
                  <span className="text-stone-500 dark:text-stone-400">{service.period}</span>
                </div>
                <ul className="space-y-2.5">
                  {service.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400">
                      <Check className="size-4 text-amber-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Button
                    className={cn("w-full", service.highlight ? "" : "variant-outline")}
                    variant={service.highlight ? "default" : "outline"}
                  >
                    {service.name === "Diamond" ? "Falar com consultor" : "Assinar plano"}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* A La Carte */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <AlaCarteSection />
        </div>

        {/* Consult Experts */}
        <section id="consultar" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="glass-card rounded-3xl p-6 md:p-8">
            <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-[0.3em] font-bold mb-3">
                  Consultar especialistas
                </p>
                <h2 className="text-3xl md:text-4xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                  Tire uma dúvida ou peça um orçamento
                </h2>
                <p className="text-stone-600 dark:text-stone-400 mt-2 max-w-2xl">
                  Escolha falar direto com Ricardo ou abrir para a categoria e receber múltiplas
                  respostas em horas.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-stone-500">
                <ShieldCheck className="size-4 text-amber-500" />
                Sigilo profissional garantido
              </div>
            </div>

            {/* Static info text replacing intent toggle */}
            <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-stone-700 dark:text-stone-300">
              <HelpCircle className="size-5 text-amber-500 shrink-0" />
              <span><strong>Consultar especialistas</strong> — envie uma dúvida ou solicite um orçamento antes de contratar.</span>
            </div>

            {/* Textarea */}
            <div className={cn(
              "relative rounded-2xl border bg-white/80 dark:bg-navy-800/80 transition-all mb-6",
              message ? "border-amber-500/50 shadow-[0_0_0_4px_rgba(245,158,11,0.08)]" : "border-stone-200 dark:border-stone-700"
            )}>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex.: Como tributar o recebimento de stock options de uma matriz nos EUA?"
                rows={5}
                className="w-full bg-transparent px-5 py-4 text-sm text-stone-800 dark:text-stone-200 placeholder:text-stone-400 resize-none focus:outline-none rounded-2xl"
              />
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200/70 dark:border-stone-700/70">
                <button type="button" className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
                  <Paperclip className="size-3.5" />
                  Anexar contexto (PDF, XML, balanço)
                </button>
              </div>
            </div>

            {/* Audience Selector */}
            <p className="text-[11px] uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400 font-bold mb-3">
              Quem deve responder
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              {[
                { key: "private" as const, icon: Lock, title: "Privado para Ricardo", hint: "Apenas este especialista responde", meta: "Resposta média: 4h" },
                { key: "public" as const, icon: Globe, title: "Público para a categoria", hint: "Vários contadores podem responder", meta: "Compare até 5 propostas" },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = consultAudience === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setConsultAudience(opt.key)}
                    className={cn(
                      "relative text-left p-4 rounded-2xl border transition-all",
                      active
                        ? "border-amber-500/60 bg-gradient-to-br from-amber-500/5 to-transparent shadow-sm"
                        : "border-stone-200 dark:border-stone-700 bg-white/50 dark:bg-navy-800/50 hover:border-stone-300 dark:hover:border-stone-600"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        "size-10 rounded-xl flex items-center justify-center shrink-0",
                        active ? "bg-amber-500 text-white" : "bg-stone-100 dark:bg-stone-800 text-stone-500"
                      )}>
                        <Icon className="size-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{opt.title}</p>
                        <p className="text-xs text-stone-500 mt-0.5">{opt.hint}</p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2">{opt.meta}</p>
                      </div>
                      <span className={cn(
                        "size-4 rounded-full border-2 shrink-0 mt-1 transition-all",
                        active ? "border-amber-500 bg-amber-500" : "border-stone-300 dark:border-stone-600"
                      )}>
                        {active && (
                          <span className="block size-full rounded-full bg-white scale-[0.35]" />
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[11px] text-stone-500 max-w-xs">
                Ao enviar você concorda com os termos de sigilo profissional da Vincis. Sem custo
                para perguntas.
              </p>
              <Button
                onClick={() => setShowModal(true)}
                disabled={!message.trim()}
                className="gap-2"
              >
                <Send className="size-4" />
                Enviar
              </Button>
            </div>
          </div>
        </section>

        {/* Modal Nome + WhatsApp */}
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Seus dados</DialogTitle>
              <DialogDescription>
                Informe seu nome e WhatsApp para que o especialista possa responder.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  Nome completo
                </label>
                <Input
                  placeholder="Seu nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  WhatsApp
                </label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button disabled={!nome.trim() || !whatsapp.trim()}>
                Confirmar e enviar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reviews + Calendar */}
        <section id="reviews" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Reviews */}
            <div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-6">
                O que nossos clientes dizem
              </h3>
              <div className="space-y-4">
                {reviews.map((r, i) => (
                  <motion.div
                    key={r.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-card rounded-xl p-5"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <Quote className="size-5 text-amber-500/50 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: r.rating }).map((_, j) => (
                            <Star key={j} className="size-3.5 fill-amber-500 text-amber-500" />
                          ))}
                        </div>
                        <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 leading-relaxed">
                          {r.content}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs bg-amber-500/10 text-amber-600">
                          {r.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{r.name}</p>
                        <p className="text-xs text-stone-500">{r.role}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Trust Strip */}
              <div className="mt-6 glass-card rounded-xl p-4">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">
                  Certificações e selos
                </p>
                <div className="flex items-center gap-4">
                  {["CRC-SP", "CFC", "SESCON", "IBRACON"].map((cert) => (
                    <Badge key={cert} variant="outline" className="text-xs">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-6">
                Agenda disponível
              </h3>
              <div className="glass-card rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <button className="text-sm text-stone-500 hover:text-stone-700">&lt;</button>
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    Fevereiro 2026
                  </span>
                  <button className="text-sm text-stone-500 hover:text-stone-700">&gt;</button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                    <div key={d} className="text-center text-xs text-stone-400 py-1">
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={day.muted || day.busy}
                      onClick={() => !day.muted && !day.busy && setSelectedDay(day.d)}
                      className={cn(
                        "text-center py-2 text-sm rounded-lg transition-all",
                        day.muted && "text-stone-200 dark:text-stone-700",
                        !day.muted && !day.busy && !day.selected && "text-stone-700 dark:text-stone-300 hover:bg-amber-500/10",
                        day.busy && "text-stone-300 dark:text-stone-600 line-through cursor-not-allowed",
                        day.selected && "bg-amber-500 text-white font-medium"
                      )}
                    >
                      {day.d}
                    </button>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-3">
                    Horários disponíveis
                  </p>
                  <div className="flex gap-2">
                    {timeSlots.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSelectedTime(t)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
                          selectedTime === t
                            ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300"
                        )}
                      >
                        <Clock className="size-3.5" />
                        {t}
                      </button>
                    ))}
                  </div>
                  <Button className="w-full mt-4 gap-2" disabled={!selectedDay || !selectedTime}>
                    <Calendar className="size-4" />
                    Confirmar agendamento
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16"
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-10 lg:p-16 text-center">
            <div className="absolute inset-0 bg-grid opacity-10" />
            <div className="relative z-10">
              <h2 className="text-3xl lg:text-4xl font-bold text-navy-900 mb-4">
                Pronto para entrar no portfólio premium da Vincis?
              </h2>
              <p className="text-navy-900/70 max-w-xl mx-auto mb-8">
                Agende uma diagnose gratuita e descubra como podemos transformar a gestão fiscal do seu negócio.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" className="bg-navy-900 text-white hover:bg-navy-800 gap-2">
                  Agendar diagnóstico gratuito
                  <ArrowUpRight className="size-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-navy-900/20 text-navy-900 hover:bg-navy-900/5 gap-2">
                  Falar com consultor
                </Button>
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Sticky CTA */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-navy-900/90 backdrop-blur-xl border-t border-stone-200 dark:border-stone-800 py-3 px-4"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-stone-600 dark:text-stone-400 hidden sm:block">
            Junte-se a <span className="font-semibold text-amber-600 dark:text-amber-400">120+</span> contadores escalando na Vincis
          </p>
          <Button size="sm" className="gap-2">
            Quero diagnosticar meu negócio
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export { PerfilProfissional };
