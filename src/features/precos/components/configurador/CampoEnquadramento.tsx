"use client";

import type { FrameworkId } from "../../lib/pricing";
import { frameworks } from "../../lib/pricing";

export function CampoEnquadramento({
  value,
  onChange,
}: {
  value: FrameworkId;
  onChange: (v: FrameworkId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Enquadramento fiscal">
      {frameworks.map((f) => {
        const active = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.id)}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-transparent hover:bg-accent"
            }`}
          >
            <span className="block text-sm font-semibold">{f.label}</span>
            <span
              className={`mt-0.5 block text-[11px] leading-tight ${
                active ? "text-primary-foreground/75" : "text-muted-foreground"
              }`}
            >
              {f.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
