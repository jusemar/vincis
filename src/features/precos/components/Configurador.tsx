"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Answers } from "../lib/pricing";
import { defaultAnswers, routines, supports } from "../lib/pricing";
import { CampoAdicionais } from "./configurador/CampoAdicionais";
import { CampoEnquadramento } from "./configurador/CampoEnquadramento";
import { CampoFaturamento } from "./configurador/CampoFaturamento";
import { CampoNotasFiscais } from "./configurador/CampoNotasFiscais";
import { CampoRamo } from "./configurador/CampoRamo";
import { OpcaoCard } from "./configurador/OpcaoCard";
import { Stepper } from "./configurador/Stepper";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
      {children}
    </div>
  );
}

export function Configurador({
  answers,
  onChange,
}: {
  answers: Answers;
  onChange: (a: Answers) => void;
}) {
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    onChange({ ...answers, [key]: value });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Conte sobre a empresa
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultAnswers)}
          className="text-muted-foreground"
        >
          <RotateCcw className="size-3.5" />
          Recomeçar
        </Button>
      </div>

      <div className="mt-5 space-y-6">
        <Campo label="Enquadramento fiscal">
          <CampoEnquadramento value={answers.framework} onChange={(v) => set("framework", v)} />
        </Campo>

        <Campo label="Ramo da empresa">
          <CampoRamo value={answers.sectors} onChange={(v) => set("sectors", v)} />
        </Campo>

        <Campo label="Funcionários registrados">
          <Stepper
            label="funcionários"
            value={answers.employees}
            onChange={(v) => set("employees", v)}
            max={200}
            suffix="pessoas"
          />
        </Campo>

        <Campo label="Notas fiscais por mês">
          <CampoNotasFiscais
            range={answers.invoiceRange}
            onRangeChange={(v) => set("invoiceRange", v)}
            issuer={answers.invoiceIssuer}
            onIssuerChange={(v) => set("invoiceIssuer", v)}
          />
        </Campo>

        <Campo label="Faturamento mensal">
          <CampoFaturamento value={answers.revenueRange} onChange={(v) => set("revenueRange", v)} />
        </Campo>

        <Campo label="Como quer ser atendido">
          <div className="space-y-2">
            {supports.map((s) => (
              <OpcaoCard
                key={s.id}
                active={answers.support === s.id}
                onClick={() => set("support", s.id)}
                label={s.label}
                desc={s.desc}
              />
            ))}
          </div>
        </Campo>

        <Campo label="Quem cuida da rotina">
          <div className="space-y-2">
            {routines.map((r) => (
              <OpcaoCard
                key={r.id}
                active={answers.routine === r.id}
                onClick={() => set("routine", r.id)}
                label={r.label}
                desc={r.desc}
              />
            ))}
          </div>
        </Campo>

        <Campo label="Personalize com adicionais">
          <CampoAdicionais value={answers.addons} onChange={(v) => set("addons", v)} />
        </Campo>
      </div>
    </div>
  );
}
