"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  FaixaPrecificacao,
  OpcaoPrecificacao,
} from "@/features/precificacao/types/precificacao";

export function CampoNotasFiscais({
  faixas,
  emissores,
  rotuloEmissor,
  faixa,
  onFaixaChange,
  emissor,
  onEmissorChange,
}: {
  faixas: FaixaPrecificacao[];
  emissores: OpcaoPrecificacao[];
  rotuloEmissor: string;
  faixa: string;
  onFaixaChange: (v: string) => void;
  emissor: string;
  onEmissorChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Select value={faixa} onValueChange={onFaixaChange}>
        <SelectTrigger className="w-full" aria-label="Notas fiscais por mês">
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

      <div className="flex rounded-lg border border-border p-1" role="radiogroup" aria-label={rotuloEmissor}>
        {emissores.map((opt) => {
          const active = opt.codigo === emissor;
          return (
            <button
              key={opt.codigo}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onEmissorChange(opt.codigo)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
