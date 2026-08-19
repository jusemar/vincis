import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip, MoreHorizontal, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AvatarStack } from "./AvatarStack";
import { CategoryBadge, DeadlineBadge, PriorityBar } from "./badges";
import type { Protocol } from "../../types/atendimentos";

interface Props {
  protocol: Protocol;
  active?: boolean;
  onClick?: () => void;
  /**
   * Clique na pílula vermelha.
   *
   * Separado do clique do card porque o destino é outro: abre o Atendimento já
   * na Conversa, no canal certo, rolado até a primeira mensagem não lida.
   */
  onAbrirNaoLidas?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export const ProtocolCard = ({
  protocol, active, onClick, onAbrirNaoLidas, onDragStart,
}: Props) => {
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
            {/* O número ao lado do balão é o total de mensagens da conversa; a
                pílula vermelha é quanto disso ainda não foi lido. Os dois
                sempre foram números diferentes e nada na tela dizia qual era
                qual — o tooltip existe para responder isso no lugar em que a
                dúvida aparece. */}
            <span className="inline-flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-default items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {p.messages}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {p.messages} {p.messages === 1 ? "mensagem" : "mensagens"} na conversa
                </TooltipContent>
              </Tooltip>
              {/* A pílula vermelha diz só o que ela é: quantas ainda não foram
                  lidas. Repetir o total aqui seria dizer duas vezes o número
                  que já está ao lado do ícone. Clicar leva direto à primeira
                  não lida — mesmo tamanho, mesma cor, mesma posição. */}
              {p.unread ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.unread} ${p.unread === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                      onClick={(e) => {
                        // O card inteiro é um botão: sem isto, o clique abriria
                        // o Atendimento pela rota comum e perderia o destino.
                        e.stopPropagation();
                        onAbrirNaoLidas?.();
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        onAbrirNaoLidas?.();
                      }}
                      className="ml-1 cursor-pointer rounded-full bg-priority-high px-1.5 py-0 text-[10px] font-semibold text-white"
                    >
                      {p.unread}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {p.unread}{" "}
                    {p.unread === 1 ? "mensagem não lida" : "mensagens não lidas"}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" />
                  {p.files}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {p.files} {p.files === 1 ? "arquivo anexado" : "arquivos anexados"}
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-[10px]">{p.createdAt}</span>
        </div>
      </div>
    </button>
  );
};