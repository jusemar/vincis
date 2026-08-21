import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, CheckCircle2, Lock, Users } from "lucide-react";
import type { Priority, Deadline, Access, Status, Category } from "../../types/atendimentos";
import { IDENTIDADE_STATUS } from "../../constants/status-atendimento";

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
  const tom = deadline === "vencido" ? "high" : deadline === "proximo" ? "waiting" : "neutral";
  return (
    <span
      data-badge={tom}
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", styles[deadline])}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

export const CategoryBadge = ({ category }: { category: Category }) => {
  const map: Record<string, string> = {
    Fiscal: "bg-blue-50 text-blue-700",
    RH: "bg-violet-50 text-violet-700",
    Jurídico: "bg-amber-50 text-amber-700",
    Societário: "bg-emerald-50 text-emerald-700",
    Contábil: "bg-slate-100 text-slate-700",
  };
  // Categoria sem cor própria (Consultoria e as futuras) usa o neutro do
  // design system: o badge continua idêntico e exibe o nome verdadeiro, em vez
  // de ser convertido em outra categoria só para caber na paleta.
  const neutro = "bg-muted text-muted-foreground";
  const tons: Record<string, string> = {
    Fiscal: "new",
    RH: "progress",
    "Jurídico": "waiting",
    "Societário": "done",
    "Contábil": "neutral",
  };
  return (
    <span
      data-badge={tons[category] ?? "neutral"}
      className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", map[category] ?? neutro)}
    >
      {category}
    </span>
  );
};

// Mesmas classes de sempre; agora vindas do mapa único de identidade dos
// status, o mesmo que pinta a bolinha da coluna do Kanban.
export const StatusBadge = ({ status }: { status: Status }) => {
  const { rotulo, badge, tom } = IDENTIDADE_STATUS[status];
  return (
    <span data-badge={tom} className={cn("rounded-md px-2 py-1 text-xs font-medium", badge)}>
      {rotulo}
    </span>
  );
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