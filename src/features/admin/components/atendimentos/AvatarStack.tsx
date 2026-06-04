import { cn } from "@/lib/utils";
import type { Assignee } from "../../types/atendimentos";

export const AvatarStack = ({ users, max = 3, size = "sm" }: { users: Assignee[]; max?: number; size?: "sm" | "md" }) => {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  const sz = size === "md" ? "h-7 w-7 text-[11px]" : "h-6 w-6 text-[10px]";
  return (
    <div className="flex -space-x-2">
      {visible.map((u) => (
        <div
          key={u.id}
          title={u.name}
          className={cn(
            "inline-flex items-center justify-center rounded-full ring-2 ring-card font-semibold text-white",
            sz,
            u.color,
          )}
        >
          {u.initials}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-full ring-2 ring-card bg-muted text-muted-foreground font-semibold",
            sz,
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};