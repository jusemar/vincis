"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { AddonId } from "../../lib/pricing";
import { addons, currency } from "../../lib/pricing";

export function CampoAdicionais({
  value,
  onChange,
}: {
  value: AddonId[];
  onChange: (v: AddonId[]) => void;
}) {
  const toggle = (id: AddonId, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2">
      {addons.map((addon) => {
        const checked = value.includes(addon.id);
        return (
          <label
            key={addon.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              checked ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
            }`}
          >
            <Checkbox
              className="mt-0.5"
              checked={checked}
              onCheckedChange={(v) => toggle(addon.id, v === true)}
              aria-label={addon.label}
            />
            <span className="min-w-0 flex-1">
              <Label className="cursor-pointer text-sm font-medium">{addon.label}</Label>
              <span className="mt-0.5 block text-xs text-muted-foreground">{addon.desc}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              +{currency(addon.monthly)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
