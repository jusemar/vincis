"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RevenueRangeId } from "../../lib/pricing";
import { revenueRanges } from "../../lib/pricing";

export function CampoFaturamento({
  value,
  onChange,
}: {
  value: RevenueRangeId;
  onChange: (v: RevenueRangeId) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RevenueRangeId)}>
      <SelectTrigger className="w-full" aria-label="Faturamento mensal">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {revenueRanges.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
