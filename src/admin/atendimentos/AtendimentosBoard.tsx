import { useMemo, useState } from "react";
import {
  Plus, RefreshCw, SlidersHorizontal, Search, LayoutGrid, List, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { KanbanColumn } from "./KanbanColumn";
import { ProtocolPanel } from "./ProtocolPanel";
import { NewAtendimentoDialog } from "./NewAtendimentoDialog";
import { FiltersPanel, EMPTY_FILTERS, type FiltersState } from "./FiltersPanel";
import { COLUMNS, MOCK_PROTOCOLS, type Protocol, type Status } from "./types";

export const AtendimentosBoard = () => {
  const [protocols, setProtocols] = useState<Protocol[]>(MOCK_PROTOCOLS);
  const [activeId, setActiveId] = useState<string | null>("p1");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);

  const activeFiltersCount =
    filters.status.length + filters.priority.length + filters.category.length +
    filters.access.length + filters.deadline.length + filters.assignee.length +
    (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return protocols.filter((p) => {
      if (q && !`${p.number} ${p.title} ${p.client}`.toLowerCase().includes(q)) return false;
      if (onlyMine && !p.assignees.some((a) => a.id === "u1")) return false;
      if (filters.status.length && !filters.status.includes(p.status)) return false;
      if (filters.priority.length && !filters.priority.includes(p.priority)) return false;
      if (filters.category.length && !filters.category.includes(p.category)) return false;
      if (filters.access.length && !filters.access.includes(p.access)) return false;
      if (filters.deadline.length && !filters.deadline.includes(p.deadline)) return false;
      if (filters.assignee.length && !p.assignees.some((a) => filters.assignee.includes(a.id))) return false;
      return true;
    });
  }, [protocols, query, onlyMine, filters]);

  const byColumn = (id: Status) => filtered.filter((p) => p.status === id);
  const active = protocols.find((p) => p.id === activeId) ?? null;

  const moveCard = (id: string, status: Status) => {
    setProtocols((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const counts = {
    total: protocols.length,
    overdue: protocols.filter((p) => p.deadline === "vencido").length,
    waiting: protocols.filter((p) => p.status.startsWith("aguardando")).length,
    done: protocols.filter((p) => p.status === "concluido").length,
  };

  return (
    <div className="flex h-full min-h-screen w-full bg-background">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-card/40 px-8 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Operações</span>
                <span>/</span>
                <span className="text-foreground">Atendimentos</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Atendimentos
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Gerencie protocolos, prazos e comunicação com clientes em um só lugar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
                {activeFiltersCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Novo atendimento
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total" value={counts.total} tone="neutral" />
            <StatCard label="Vencidos" value={counts.overdue} tone="danger" pulse />
            <StatCard label="Aguardando" value={counts.waiting} tone="warning" />
            <StatCard label="Concluídos" value={counts.done} tone="success" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por protocolo, cliente ou título…"
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <FilterChip active={!onlyMine} onClick={() => setOnlyMine(false)}>
              Todos
            </FilterChip>
            <FilterChip active={onlyMine} onClick={() => setOnlyMine(true)}>
              <Star className="h-3 w-3" /> Meus
            </FilterChip>
            <FilterChip>Alta prioridade</FilterChip>
            <FilterChip>Vencendo hoje</FilterChip>

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              <button className="rounded-md bg-muted p-1.5 text-foreground">
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="scrollbar-thin flex flex-1 gap-4 overflow-x-auto px-8 py-6">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              protocols={byColumn(col.id)}
              activeId={activeId ?? undefined}
              onSelect={setActiveId}
              onDrop={moveCard}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
            />
          ))}
        </div>
      </main>

      {active && (
        <div className="hidden xl:flex">
          <ProtocolPanel protocol={active} onClose={() => setActiveId(null)} />
        </div>
      )}
      {active && (
        <div className="fixed inset-0 z-40 flex xl:hidden">
          <button
            aria-label="Fechar"
            className="flex-1 bg-foreground/30"
            onClick={() => setActiveId(null)}
          />
          <ProtocolPanel protocol={active} onClose={() => setActiveId(null)} />
        </div>
      )}
      <NewAtendimentoDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <FiltersPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        activeCount={activeFiltersCount}
      />
    </div>
  );
};

const StatCard = ({
  label, value, tone, pulse,
}: {
  label: string;
  value: number;
  tone: "neutral" | "danger" | "warning" | "success";
  pulse?: boolean;
}) => {
  const dot = {
    neutral: "bg-muted-foreground",
    danger: "bg-priority-high",
    warning: "bg-status-waiting",
    success: "bg-status-done",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot, pulse && "animate-pulse")} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
};

const FilterChip = ({
  children, active, onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:bg-muted",
    )}
  >
    {children}
  </button>
);