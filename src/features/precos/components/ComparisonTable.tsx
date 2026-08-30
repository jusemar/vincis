"use client";

import { Check } from "lucide-react";
import type { OfferId } from "../lib/pricing";
import { comparisonGroups, comparisonOffersFor } from "../lib/pricing";

const offerLabel: Record<OfferId, string> = {
  padrao: "Padrão",
  consultiva: "Consultiva",
  juridico: "Jurídico",
  combo: "Completo",
};

function Cell({ value }: { value: string | boolean | undefined }) {
  if (value === undefined) return <span className="text-muted-foreground/40">—</span>;
  if (value === true) return <Check className="mx-auto size-4 text-primary" />;
  if (value === false) return <span className="text-muted-foreground/40">—</span>;
  return <span className="text-muted-foreground">{value}</span>;
}

export function ComparisonTable({ tab }: { tab: "consultiva" | "juridico" | "combo" }) {
  const offers = comparisonOffersFor(tab);
  const gridCols = `minmax(0,1.6fr) repeat(${offers.length}, minmax(0,1fr))`;

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Veja exatamente o que muda</h3>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div
            className="grid items-end gap-2 border-b border-border px-4 py-2.5"
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Funcionalidade
            </span>
            {offers.map((o) => (
              <span key={o} className="text-center text-xs font-bold text-foreground">
                {offerLabel[o]}
              </span>
            ))}
          </div>

          {comparisonGroups.map((group) => {
            const rowsWithData = group.rows.filter((row) =>
              offers.some((o) => row.values[o] !== undefined),
            );
            if (rowsWithData.length === 0) return null;

            return (
              <div key={group.group}>
                <p className="bg-muted/30 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {group.group}
                </p>
                {rowsWithData.map((row) => (
                  <div
                    key={row.label}
                    className="grid items-center gap-2 border-b border-border px-4 py-2.5 last:border-0"
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <span className="min-w-0 text-xs text-foreground">{row.label}</span>
                    {offers.map((o) => (
                      <span key={o} className="text-center text-xs">
                        <Cell value={row.values[o]} />
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
