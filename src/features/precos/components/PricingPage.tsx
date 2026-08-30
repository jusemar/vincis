"use client";

import { useState } from "react";
import type { Answers, OfferId } from "../lib/pricing";
import { defaultAnswers } from "../lib/pricing";
import { ComparisonTable } from "./ComparisonTable";
import { Configurador } from "./Configurador";
import { ResultCards } from "./ResultCards";
import { ServiceTypeSelector } from "./ServiceTypeSelector";

type ServiceTabId = Extract<OfferId, "consultiva" | "juridico" | "combo">;

export default function PricingPage() {
  const [tab, setTab] = useState<ServiceTabId>("consultiva");
  const [answers, setAnswers] = useState<Answers>(defaultAnswers);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:pt-24">
          <h1 className="max-w-3xl text-3xl leading-[1.1] font-bold text-foreground sm:text-5xl">
            Sua empresa não é igual às outras
          </h1>
          <p className="mt-3 max-w-3xl text-2xl leading-[1.15] font-semibold text-muted-foreground sm:text-4xl">
            Seu preço também não precisa ser.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Escolha o tipo de serviço
        </h2>
        <div className="mt-3">
          <ServiceTypeSelector value={tab} onChange={setTab} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0">
            <Configurador answers={answers} onChange={setAnswers} />
          </div>

          <div className="min-w-0" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <ResultCards tab={tab} answers={answers} />
            <ComparisonTable tab={tab} />
            <p className="mt-4 text-xs text-muted-foreground">
              Valores calculados a partir do perfil informado, com regras ainda demonstrativas — a
              proposta final é confirmada após a análise dos documentos da empresa.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
