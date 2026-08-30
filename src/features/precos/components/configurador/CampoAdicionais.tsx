"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatarCentavos } from "@/features/precificacao/lib/formato";
import type { AdicionalPrecificacao } from "@/features/precificacao/types/precificacao";

export function CampoAdicionais({
  adicionais,
  value,
  onChange,
}: {
  adicionais: AdicionalPrecificacao[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2">
      {adicionais.map((addon) => {
        const checked = value.includes(addon.codigo);
        return (
          <label
            key={addon.codigo}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              checked ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
            }`}
          >
            <Checkbox
              className="mt-0.5"
              checked={checked}
              onCheckedChange={(v) => toggle(addon.codigo, v === true)}
              aria-label={addon.rotulo}
            />
            <span className="min-w-0 flex-1">
              <Label className="cursor-pointer text-sm font-medium">{addon.rotulo}</Label>
              <span className="mt-0.5 block text-xs text-muted-foreground">{addon.descricao}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              +{formatarCentavos(addon.valorMensalCentavos)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
