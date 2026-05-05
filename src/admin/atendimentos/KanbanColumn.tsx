import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { ProtocolCard } from "./ProtocolCard";
import type { ColumnDef, Protocol, Status } from "./types";

interface Props {
  column: ColumnDef;
  protocols: Protocol[];
  activeId?: string;
  onSelect: (id: string) => void;
  onDrop: (id: string, status: Status) => void;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
}

export const KanbanColumn = ({ column, protocols, activeId, onSelect, onDrop, draggingId, setDraggingId }: Props) => {
  return (
    <div
      className="flex h-full w-[300px] shrink-0 flex-col rounded-2xl p-3"
      style={{ background: 'hsl(45 93% 47% / 0.12)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (draggingId) onDrop(draggingId, column.id);
        setDraggingId(null);
      }}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", column.accent)} />
          <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
          <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {protocols.length}
          </span>
        </div>
        <button className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-thin flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {protocols.map((p) => (
          <ProtocolCard
            key={p.id}
            protocol={p}
            active={p.id === activeId}
            onClick={() => onSelect(p.id)}
            onDragStart={(e) => {
              setDraggingId(p.id);
              e.dataTransfer.effectAllowed = "move";
            }}
          />
        ))}
        {protocols.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Solte um card aqui
          </div>
        )}
      </div>
    </div>
  );
};