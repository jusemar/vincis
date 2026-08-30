"use client";

import { Calculator, Scale, Sparkles } from "lucide-react";
import type { OfferId } from "../lib/pricing";

type ServiceTabId = Extract<OfferId, "consultiva" | "juridico" | "combo">;

const tabs: { id: ServiceTabId; label: string; desc: string; icon: typeof Calculator }[] = [
  { id: "consultiva", label: "Contabilidade", desc: "Padrão ou consultiva", icon: Calculator },
  { id: "juridico", label: "Assistência Jurídica", desc: "Consultas e contratos", icon: Scale },
  { id: "combo", label: "Pacote Empresarial Completo", desc: "Contabilidade + Jurídico", icon: Sparkles },
];

export function ServiceTypeSelector({
  value,
  onChange,
}: {
  value: ServiceTabId;
  onChange: (v: ServiceTabId) => void;
}) {
  return (
    <div role="tablist" aria-label="Tipo de serviço" className="grid gap-3 sm:grid-cols-3">
      {tabs.map((tab) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
              active
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : "border-border bg-card hover:-translate-y-0.5 hover:shadow-sm"
            }`}
          >
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                active ? "bg-primary-foreground/15" : "bg-accent"
              }`}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">{tab.label}</span>
              <span
                className={`block text-xs ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}
              >
                {tab.desc}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
