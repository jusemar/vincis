import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const services = [
  {
    id: "contabilidade",
    tag: "Mais popular",
    tagStyle: "bg-primary/20 text-primary",
    title: "Contabilidade\n100% digital",
    description:
      "Gestão financeira, folha de pagamento, impostos e obrigações fiscais — tudo online, sem burocracia.",
    cta: "Conhecer planos",
    stats: [
      { value: "+2.4k", label: "empresas ativas" },
      { value: "98%", label: "satisfação" },
      { value: "24h", label: "atendimento" },
    ],
    glow: "from-primary/20 via-primary/10 to-transparent",
  },
  {
    id: "juridico",
    tag: "Consultoria jurídica",
    tagStyle: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    title: "Assessoria legal\npara o seu negócio",
    description:
      "Contratos, compliance, trabalhista e societário com especialistas disponíveis online.",
    cta: "Ver serviços",
    glow: "from-emerald-500/20 via-emerald-500/10 to-transparent",
  },
  {
    id: "abertura",
    tag: "Abertura de empresa",
    tagStyle: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    title: "Abra sua empresa\nem dias",
    description:
      "Registro, CNPJ, alvará e enquadramento tributário sem sair de casa.",
    cta: "Começar agora",
    glow: "from-amber-500/20 via-amber-500/10 to-transparent",
  },
];

export default function Banners() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [large, ...smalls] = services;

  return (
    <div className="w-full bg-background py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card grande */}
          <motion.div
            className="bg-card rounded-2xl border border-border relative overflow-hidden flex flex-col justify-end min-h-[400px] cursor-pointer shadow-card"
            style={{ gridRow: "span 2" }}
            onMouseEnter={() => setHovered(large.id)}
            onMouseLeave={() => setHovered(null)}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
          >
            {/* Glow effect */}
            <div className={`absolute -top-10 -right-10 w-64 h-64 rounded-full bg-gradient-to-br ${large.glow} pointer-events-none transition-opacity duration-500 ${hovered === large.id ? "opacity-100" : "opacity-50"}`} />

            {/* Content */}
            <div className="relative z-10 p-7 flex flex-col gap-4">
              {/* Tag */}
              <span className={`${large.tagStyle} text-[11px] font-medium uppercase tracking-wider px-3 py-1 rounded-md w-fit`}>
                {large.tag}
              </span>

              {/* Title */}
              <h3 className="text-2xl font-semibold text-foreground leading-tight whitespace-pre-line">
                {large.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {large.description}
              </p>

              {/* Stats */}
              <div className="flex items-center gap-5 mt-1">
                {(large.stats || []).map((stat, i, arr) => (
                  <div key={i} className="flex items-center gap-5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-lg font-bold text-foreground">{stat.value}</span>
                      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-px h-8 bg-border" />
                    )}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground px-4 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-all w-fit">
                {large.cta}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

          {/* Cards pequenos */}
          {smalls.map((service) => (
            <motion.div
              key={service.id}
              className="bg-card rounded-2xl border border-border relative overflow-hidden flex flex-col justify-end min-h-[190px] cursor-pointer shadow-card"
              onMouseEnter={() => setHovered(service.id)}
              onMouseLeave={() => setHovered(null)}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {/* Glow effect */}
              <div className={`absolute ${service.id === 'juridico' ? '-bottom-14 -right-8' : '-top-10 -left-10'} w-48 h-48 rounded-full bg-gradient-to-br ${service.glow} pointer-events-none transition-opacity duration-500 ${hovered === service.id ? "opacity-100" : "opacity-50"}`} />

              {/* Content */}
              <div className="relative z-10 p-6 flex flex-col gap-3">
                {/* Tag */}
                <span className={`${service.tagStyle} text-[11px] font-medium uppercase tracking-wider px-3 py-1 rounded-md w-fit`}>
                  {service.tag}
                </span>

                {/* Title */}
                <h3 className="text-base font-semibold text-foreground leading-tight whitespace-pre-line">
                  {service.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {service.description}
                </p>

                {/* CTA */}
                <button className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-all w-fit">
                  {service.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}