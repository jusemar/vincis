"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Answers, OfferId, OfferPrice } from "../lib/pricing";
import { currency, periods, priceForOffer } from "../lib/pricing";
import { AnimatedPrice } from "./AnimatedPrice";

interface OfferCopy {
  name: string;
  pitch: string;
  highlight?: boolean;
}

const offerCopy: Record<Exclude<OfferId, "combo">, OfferCopy> = {
  padrao: {
    name: "Contabilidade Padrão",
    pitch: "Execução das rotinas contábeis, fiscais e trabalhistas da empresa com segurança, organização e pontualidade.",
  },
  consultiva: {
    name: "Contabilidade Consultiva",
    pitch: "Uma relação mais próxima com sua empresa, com acompanhamento, análises e orientação para apoiar decisões e crescimento.",
    highlight: true,
  },
  juridico: {
    name: "Assistência Jurídica",
    pitch: "Consultas, contratos e suporte trabalhista e societário para proteger sua empresa no dia a dia.",
  },
};

const comboCopy: OfferCopy = {
  name: "Pacote Empresarial Completo",
  pitch: "Contabilidade Consultiva somada à Assistência Jurídica para empresas que querem acompanhamento mais completo e segurança no dia a dia.",
};

function OfferCard({ price, copy }: { price: OfferPrice; copy: OfferCopy }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 ${
        copy.highlight ? "border-primary bg-card shadow-md" : "border-border bg-card"
      }`}
    >
      {copy.highlight ? (
        <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          Acompanhamento mais próximo
        </span>
      ) : null}
      <h3 className="text-lg font-bold text-foreground">{copy.name}</h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{copy.pitch}</p>

      <div className="mt-4 space-y-2">
        {periods.map((p) => {
          const pp = price.periods.find((x) => x.period === p.id)!;
          const isTwelve = p.id === "doze_meses";
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                isTwelve ? "bg-primary/10" : "bg-muted/50"
              }`}
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">{p.label}</p>
                {pp.savingsVsMonthly > 0 ? (
                  <p className="text-[11px] font-medium text-primary">
                    Economize {currency(pp.savingsVsMonthly)}/mês
                  </p>
                ) : null}
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-xs font-medium text-muted-foreground">R$</span>
                <span className="text-xl font-bold tabular-nums text-foreground">
                  <AnimatedPrice value={pp.monthlyEquivalent} />
                </span>
                <span className="text-xs text-muted-foreground">/mês</span>
              </p>
            </div>
          );
        })}
      </div>

      <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
          >
            {open ? "Ocultar cálculo" : "Como chegamos nesse valor?"}
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-3 space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs">
            {price.lines.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{l.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {l.value < 0 ? "− " : ""}
                  {currency(Math.abs(l.value))}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold text-foreground">
              <span>Total mensal</span>
              <span className="tabular-nums">{currency(price.baseMonthly)}</span>
            </li>
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <Button className="mt-4 w-full" variant={copy.highlight ? "default" : "secondary"}>
        Contratar <ArrowRight className="size-4" />
      </Button>
    </article>
  );
}

function ComboCard({ answers }: { answers: Answers }) {
  const combo = priceForOffer("combo", answers);
  const consultiva = priceForOffer("consultiva", answers);
  const juridico = priceForOffer("juridico", answers);
  const separateMonthly = consultiva.baseMonthly + juridico.baseMonthly;
  const savingsMonthly = separateMonthly - combo.baseMonthly;

  return (
    <article className="flex flex-col rounded-2xl border border-primary bg-card p-5 shadow-md">
      <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
        Economia no combo
      </span>
      <h3 className="text-lg font-bold text-foreground">{comboCopy.name}</h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{comboCopy.pitch}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-muted-foreground">Separados</p>
          <p className="font-semibold text-foreground line-through decoration-muted-foreground/60">
            {currency(separateMonthly)}/mês
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 px-3 py-2">
          <p className="text-primary">No combo</p>
          <p className="font-semibold text-foreground">{currency(combo.baseMonthly)}/mês</p>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-primary">
        Economia de {currency(savingsMonthly)}/mês · {currency(savingsMonthly * 12)}/ano
      </p>

      <div className="mt-4 space-y-2">
        {periods.map((p) => {
          const pp = combo.periods.find((x) => x.period === p.id)!;
          const isTwelve = p.id === "doze_meses";
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                isTwelve ? "bg-primary/10" : "bg-muted/50"
              }`}
            >
              <div>
                <p className="text-xs font-medium text-muted-foreground">{p.label}</p>
                {pp.savingsVsMonthly > 0 ? (
                  <p className="text-[11px] font-medium text-primary">
                    Economize {currency(pp.savingsVsMonthly)}/mês
                  </p>
                ) : null}
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-xs font-medium text-muted-foreground">R$</span>
                <span className="text-xl font-bold tabular-nums text-foreground">
                  <AnimatedPrice value={pp.monthlyEquivalent} />
                </span>
                <span className="text-xs text-muted-foreground">/mês</span>
              </p>
            </div>
          );
        })}
      </div>

      <Button className="mt-4 w-full">
        Contratar pacote completo <ArrowRight className="size-4" />
      </Button>
    </article>
  );
}

export function ResultCards({
  tab,
  answers,
}: {
  tab: "consultiva" | "juridico" | "combo";
  answers: Answers;
}) {
  if (tab === "juridico") {
    const price = priceForOffer("juridico", answers);
    return (
      <div className="grid gap-4 sm:grid-cols-1">
        <OfferCard price={price} copy={offerCopy.juridico} />
      </div>
    );
  }

  if (tab === "combo") {
    return (
      <div className="grid gap-4">
        <ComboCard answers={answers} />
      </div>
    );
  }

  const padrao = priceForOffer("padrao", answers);
  const consultiva = priceForOffer("consultiva", answers);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <OfferCard price={padrao} copy={offerCopy.padrao} />
      <OfferCard price={consultiva} copy={offerCopy.consultiva} />
    </div>
  );
}
