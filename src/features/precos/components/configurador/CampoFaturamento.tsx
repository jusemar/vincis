"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FaixaPrecificacao } from "@/features/precificacao/types/precificacao";

export function CampoFaturamento({
  faixas,
  value,
  onChange,
}: {
  faixas: FaixaPrecificacao[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label="Faturamento mensal">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {faixas.map((r) => (
          <SelectItem key={r.codigo} value={r.codigo}>
            {r.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
