"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 200,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Diminuir ${label}`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
      >
        <Minus className="size-4" />
      </Button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
        {suffix ? <span className="ml-1 text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
