import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip, MoreHorizontal, Lock } from "lucide-react";
import { AvatarStack } from "./AvatarStack";
import { CategoryBadge, DeadlineBadge, PriorityBar } from "./badges";
import type { Protocol } from "./types";

interface Props {
  protocol: Protocol;
  active?: boolean;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export const ProtocolCard = ({ protocol, active, onClick, onDragStart }: Props) => {
  const p = protocol;
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-xl bg-card text-left shadow-card transition-all",
        "hover:-translate-y-0.5 hover:shadow-card-hover",
        active && "ring-2 ring-primary",
      )}
    >
      <PriorityBar priority={p.priority} />
      <div className="space-y-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-medium text-muted-foreground">{p.number}</span>
            <CategoryBadge category={p.category} />
          </div>
          <span
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </span>
        </div>

        <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{p.title}</h4>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{p.client}</span>
          {p.access === "privado" && <Lock className="h-3 w-3 shrink-0" />}
        </div>

        {p.progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
              <span>Checklist</span>
              <span>
                {p.progress.done}/{p.progress.total}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(p.progress.done / p.progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <DeadlineBadge deadline={p.deadline} label={p.deadlineLabel} />
          <AvatarStack users={p.assignees} />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {p.messages}
              {p.unread ? (
                <span className="ml-1 rounded-full bg-priority-high px-1.5 py-0 text-[10px] font-semibold text-white">
                  {p.unread}
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" />
              {p.files}
            </span>
          </div>
          <span className="text-[10px]">{p.createdAt}</span>
        </div>
      </div>
    </button>
  );
};