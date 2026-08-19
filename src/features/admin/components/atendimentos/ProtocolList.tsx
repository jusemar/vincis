import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";
import { AvatarStack } from "./AvatarStack";
import { CategoryBadge, DeadlineBadge, PriorityDot, StatusBadge } from "./badges";
import type { Protocol } from "../../types/atendimentos";

interface Props {
  /** Linhas da página atual. */
  protocols: Protocol[];
  activeId?: string;
  onSelect: (id: string) => void;
  /** Dados da paginação. Ausentes quando a lista cabe numa página só. */
  paginacao?: {
    pagina: number;
    totalPaginas: number;
    total: number;
    primeiro: number;
    ultimo: number;
    irPara: (pagina: number) => void;
  };
}

/**
 * Visualização em lista.
 *
 * Recebe exatamente a mesma lista já filtrada que alimenta o Kanban — não
 * existe segunda fonte de dados, segunda busca nem segundo filtro. Muda só a
 * forma de apresentar, e por isso os badges, avatares e cores são os mesmos
 * componentes que os cards usam.
 *
 * É aqui que `Recusado` e `Cancelado` ficam visíveis sem precisar de coluna
 * própria no quadro.
 */
export const ProtocolList = ({ protocols, activeId, onSelect, paginacao }: Props) => (
  <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Protocolo</th>
            <th className="px-4 py-3">Serviço</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Categoria</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Prioridade</th>
            <th className="px-4 py-3">Prazo</th>
            <th className="px-4 py-3">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {protocols.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                "cursor-pointer border-b border-border/70 text-sm transition-colors last:border-b-0 hover:bg-muted/50",
                p.id === activeId && "bg-muted/60",
              )}
            >
              <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-medium text-muted-foreground">
                {p.number}
              </td>
              <td className="max-w-[260px] px-4 py-3 font-medium text-foreground">
                <span className="line-clamp-1">{p.title}</span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="line-clamp-1">{p.client}</span>
                  {p.access === "privado" && <Lock className="h-3 w-3 shrink-0" />}
                </span>
              </td>
              <td className="px-4 py-3">
                <CategoryBadge category={p.category} />
              </td>
              <td className="px-4 py-3">
                <AvatarStack users={p.assignees} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <PriorityDot priority={p.priority} />
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                <DeadlineBadge deadline={p.deadline} label={p.deadlineLabel} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {p.updatedAtLabel ?? p.createdAt}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {protocols.length === 0 && (
      <p className="px-4 py-10 text-center text-xs text-muted-foreground">
        Nenhum atendimento encontrado com os filtros atuais.
      </p>
    )}

    {paginacao && paginacao.total > 0 && (
      // Rodapé da tabela: mesma moldura, mesma tipografia. O texto fala do
      // conjunto filtrado inteiro — a página é só o pedaço desenhado agora.
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          Mostrando {paginacao.primeiro}–{paginacao.ultimo} de {paginacao.total}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => paginacao.irPara(paginacao.pagina - 1)}
            disabled={paginacao.pagina <= 1}
            className="rounded-md border border-border px-2.5 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="px-2 font-medium text-foreground">
            {paginacao.pagina}/{paginacao.totalPaginas}
          </span>
          <button
            onClick={() => paginacao.irPara(paginacao.pagina + 1)}
            disabled={paginacao.pagina >= paginacao.totalPaginas}
            className="rounded-md border border-border px-2.5 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    )}
  </div>
);
