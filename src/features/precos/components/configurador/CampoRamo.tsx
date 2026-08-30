"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { SectorId } from "../../lib/pricing";
import { sectors } from "../../lib/pricing";

export function CampoRamo({
  value,
  onChange,
}: {
  value: SectorId[];
  onChange: (v: SectorId[]) => void;
}) {
  const toggle = (id: SectorId, checked: boolean) => {
    if (checked) {
      if (!value.includes(id)) onChange([...value, id]);
      return;
    }
    // Mantém ao menos uma atividade selecionada.
    if (value.length > 1) onChange(value.filter((v) => v !== id));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {sectors.map((s) => {
        const checked = value.includes(s.id);
        return (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
              checked ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
            }`}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => toggle(s.id, v === true)}
              aria-label={s.label}
            />
            <Label className="cursor-pointer text-sm font-medium">{s.label}</Label>
          </label>
        );
      })}
    </div>
  );
}
