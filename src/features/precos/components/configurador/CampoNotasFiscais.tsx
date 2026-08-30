"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceIssuerId, InvoiceRangeId } from "../../lib/pricing";
import { invoiceIssuers, invoiceRanges } from "../../lib/pricing";

export function CampoNotasFiscais({
  range,
  onRangeChange,
  issuer,
  onIssuerChange,
}: {
  range: InvoiceRangeId;
  onRangeChange: (v: InvoiceRangeId) => void;
  issuer: InvoiceIssuerId;
  onIssuerChange: (v: InvoiceIssuerId) => void;
}) {
  return (
    <div className="space-y-3">
      <Select value={range} onValueChange={(v) => onRangeChange(v as InvoiceRangeId)}>
        <SelectTrigger className="w-full" aria-label="Notas fiscais por mês">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {invoiceRanges.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex rounded-lg border border-border p-1" role="radiogroup" aria-label="Quem emitirá as notas">
        {invoiceIssuers.map((opt) => {
          const active = opt.id === issuer;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onIssuerChange(opt.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
