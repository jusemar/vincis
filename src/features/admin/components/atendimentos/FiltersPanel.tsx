import { X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Category, Priority, Status, Access, FiltersState } from "../../types/atendimentos";

export const EMPTY_FILTERS: FiltersState = {
  status: [], priority: [], category: [], access: [], deadline: [],
  assignee: [], dateFrom: "", dateTo: "",
};

export const STATUS: { id: Status; label: string }[] = [
  { id: "novo", label: "Novo" },
  { id: "andamento", label: "Em andamento" },
  { id: "aguardando-cliente", label: "Aguardando cliente" },
  { id: "aguardando-assinatura", label: "Aguardando assinatura" },
  { id: "concluido", label: "Concluído" },
  { id: "recusado", label: "Recusado" },
  { id: "cancelado", label: "Cancelado" },
];
const PRIORITIES: { id: Priority; label: string; dot: string }[] = [
  { id: "alta", label: "Alta", dot: "bg-priority-high" },
  { id: "media", label: "Média", dot: "bg-priority-medium" },
  { id: "baixa", label: "Baixa", dot: "bg-priority-low" },
];
/** Categorias sempre presentes. As demais chegam pelos dados reais. */
export const CATEGORIAS_BASE: Category[] = ["Fiscal", "RH", "Jurídico", "Societário", "Contábil"];
const ACCESSES: { id: Access; label: string }[] = [
  { id: "compartilhado", label: "Compartilhado" },
  { id: "privado", label: "Privado" },
];
const DEADLINES = [
  { id: "vencido" as const, label: "Vencidos" },
  { id: "proximo" as const, label: "Vencendo em breve" },
  { id: "normal" as const, label: "No prazo" },
];
const TEAM = [
  { id: "u1", name: "Ana Lima" },
  { id: "u2", name: "Bruno Silva" },
  { id: "u3", name: "Carla Souza" },
  { id: "u4", name: "Diego Reis" },
  { id: "u5", name: "Elisa Tavares" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  activeCount: number;
  /** Categorias existentes na tela, incluindo as que vêm dos dados reais. */
  categories?: Category[];
}

export const FiltersPanel = ({
  open, onClose, filters, setFilters, activeCount, categories = CATEGORIAS_BASE,
}: Props) => {
  if (!open) return null;

  function toggle<T>(key: keyof FiltersState, value: T) {
    const arr = filters[key] as unknown as T[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    setFilters({ ...filters, [key]: next });
  }

  return (
    <>
      <button
        aria-label="Fechar filtros"
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] animate-in fade-in"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Filtros</h2>
            <p className="text-xs text-muted-foreground">
              {activeCount > 0 ? `${activeCount} filtro${activeCount > 1 ? "s" : ""} ativo${activeCount > 1 ? "s" : ""}` : "Refine a lista de atendimentos"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
          <Section title="Status">
            <div className="flex flex-wrap gap-2">
              {STATUS.map((s) => (
                <Chip key={s.id} active={filters.status.includes(s.id)} onClick={() => toggle("status", s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Prioridade">
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <Chip key={p.id} active={filters.priority.includes(p.id)} onClick={() => toggle("priority", p.id)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
                  {p.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Prazo">
            <div className="flex flex-wrap gap-2">
              {DEADLINES.map((d) => (
                <Chip key={d.id} active={filters.deadline.includes(d.id)} onClick={() => toggle("deadline", d.id)}>
                  {d.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Categoria">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip key={c} active={filters.category.includes(c)} onClick={() => toggle("category", c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Acesso">
            <div className="flex flex-wrap gap-2">
              {ACCESSES.map((a) => (
                <Chip key={a.id} active={filters.access.includes(a.id)} onClick={() => toggle("access", a.id)}>
                  {a.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Responsáveis">
            <div className="space-y-2">
              {TEAM.map((u) => {
                const checked = filters.assignee.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle("assignee", u.id)} />
                    <span className="text-foreground">{u.name}</span>
                  </label>
                );
              })}
            </div>
          </Section>

          <Section title="Período de criação">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">De</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Até</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-card/40 px-5 py-3">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setFilters(EMPTY_FILTERS)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar tudo
          </Button>
          <Button size="sm" onClick={onClose}>
            Aplicar filtros
          </Button>
        </footer>
      </aside>
    </>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
    {children}
  </div>
);

const Chip = ({
  active, onClick, children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:bg-muted",
    )}
  >
    {children}
  </button>
);