"use client";

export function OpcaoCard({
  active,
  onClick,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-primary bg-accent"
          : "border-border bg-transparent hover:bg-accent/50"
      }`}
    >
      <span
        className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border ${
          active ? "border-primary bg-primary" : "border-input"
        }`}
      >
        {active ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}
