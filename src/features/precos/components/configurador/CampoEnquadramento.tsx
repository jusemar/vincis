"use client";

import type { OpcaoPrecificacao } from "@/features/precificacao/types/precificacao";

export function CampoEnquadramento({
  opcoes,
  value,
  onChange,
}: {
  opcoes: OpcaoPrecificacao[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Enquadramento fiscal">
      {opcoes.map((f) => {
        const active = f.codigo === value;
        return (
          <button
            key={f.codigo}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.codigo)}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-transparent hover:bg-accent"
            }`}
          >
            <span className="block text-sm font-semibold">{f.rotulo}</span>
            <span
              className={`mt-0.5 block text-[11px] leading-tight ${
                active ? "text-primary-foreground/75" : "text-muted-foreground"
              }`}
            >
              {f.ajuda}
            </span>
          </button>
        );
      })}
    </div>
  );
}
