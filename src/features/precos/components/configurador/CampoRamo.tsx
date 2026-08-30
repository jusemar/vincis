"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { OpcaoPrecificacao } from "@/features/precificacao/types/precificacao";

export function CampoRamo({
  opcoes,
  value,
  onChange,
}: {
  opcoes: OpcaoPrecificacao[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(id)) onChange([...value, id]);
      return;
    }
    // Mantém ao menos uma atividade selecionada.
    if (value.length > 1) onChange(value.filter((v) => v !== id));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {opcoes.map((s) => {
        const checked = value.includes(s.codigo);
        return (
          <label
            key={s.codigo}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
              checked ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
            }`}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => toggle(s.codigo, v === true)}
              aria-label={s.rotulo}
            />
            <Label className="cursor-pointer text-sm font-medium">{s.rotulo}</Label>
          </label>
        );
      })}
    </div>
  );
}
