import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, CheckCircle2, Lock, Users } from "lucide-react";
import type { Priority, Deadline, Access, Status, Category } from "./types";

export const PriorityDot = ({ priority }: { priority: Priority }) => {
  const map = {
    alta: "bg-priority-high",
    media: "bg-priority-medium",
    baixa: "bg-priority-low",
  } as const;
  const label = { alta: "Alta", media: "Média", baixa: "Baixa" }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", map[priority])} />
      {label}
    </span>
  );
};

export const PriorityBar = ({ priority }: { priority: Priority }) => {
  const map = {
    alta: "bg-priority-high",
    media: "bg-priority-medium",
    baixa: "bg-priority-low",
  } as const;
  return <span className={cn("absolute left-0 top-0 h-full w-1 rounded-l-xl", map[priority])} />;
};

export const DeadlineBadge = ({ deadline, label }: { deadline: Deadline; label: string }) => {
  const styles = {
    normal: "bg-muted text-muted-foreground",
    proximo: "bg-status-waiting-bg text-status-waiting",
    vencido: "bg-rose-50 text-priority-high",
  } as const;
  const Icon = deadline === "vencido" ? AlertTriangle : deadline === "proximo" ? Clock : CheckCircle2;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", styles[deadline])}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

export const CategoryBadge = ({ category }: { category: Category }) => {
  const map: Record<Category, string> = {
    Fiscal: "bg-blue-50 text-blue-700",
    RH: "bg-violet-50 text-violet-700",
    Jurídico: "bg-amber-50 text-amber-700",
    Societário: "bg-emerald-50 text-emerald-700",
    Contábil: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", map[category])}>
      {category}
    </span>
  );
};

export const StatusBadge = ({ status }: { status: Status }) => {
  const map: Record<Status, { label: string; cls: string }> = {
    novo: { label: "Novo", cls: "bg-status-new-bg text-status-new" },
    andamento: { label: "Em andamento", cls: "bg-status-progress-bg text-status-progress" },
    "aguardando-cliente": { label: "Aguardando cliente", cls: "bg-status-waiting-bg text-status-waiting" },
    "aguardando-assinatura": { label: "Aguardando assinatura", cls: "bg-status-sign-bg text-status-sign" },
    concluido: { label: "Concluído", cls: "bg-status-done-bg text-status-done" },
  };
  const { label, cls } = map[status];
  return <span className={cn("rounded-md px-2 py-1 text-xs font-medium", cls)}>{label}</span>;
};

export const AccessBadge = ({ access }: { access: Access }) => {
  const isPrivate = access === "privado";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
        isPrivate ? "bg-muted text-muted-foreground" : "bg-status-progress-bg text-status-progress",
      )}
    >
      {isPrivate ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
      {isPrivate ? "Privado" : "Compartilhado"}
    </span>
  );
};