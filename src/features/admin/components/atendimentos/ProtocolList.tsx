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
  <div className="min-w-0 flex-1 overflow-hidden border-y border-border bg-card shadow-card lg:rounded-2xl lg:border-x">
    <div className="scrollbar-thin overflow-x-auto">
      {/*
        `min-w-[980px]` só a partir de `lg`. No celular a tabela usa a largura
        real da tela e mostra as quatro colunas que importam — Protocolo,
        Serviço, Status e Prazo. As demais não somem do produto: continuam na
        tabela completa do desktop e no detalhe do Atendimento.
      */}
      <table className="w-full table-fixed border-collapse text-left lg:min-w-[980px] lg:table-auto">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">Protocolo</th>
            <th className="px-2 py-3 lg:px-4">
              <span className="lg:hidden">Protocolo · Serviço</span>
              <span className="hidden lg:inline">Serviço</span>
            </th>
            <th className="hidden px-4 py-3 lg:table-cell">Cliente</th>
            <th className="hidden px-4 py-3 lg:table-cell">Categoria</th>
            <th className="hidden px-4 py-3 lg:table-cell">Responsável</th>
            <th className="w-[92px] px-1 py-3 lg:w-auto lg:px-4">Status</th>
            <th className="hidden px-4 py-3 lg:table-cell">Prioridade</th>
            <th className="w-[96px] px-1 py-3 lg:w-auto lg:px-4">Prazo</th>
            <th className="hidden px-4 py-3 lg:table-cell">Atualizado</th>
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
              <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-[11px] font-medium text-muted-foreground lg:table-cell">
                {p.number}
              </td>
              {/*
                Serviço é a coluna que recebe a sobra: `w-full` faz as demais
                ficarem no tamanho do conteúdo e esta ocupar o resto. O corte é
                por reticências — o registro completo abre no Atendimento.
              */}
              <td className="w-full min-w-0 max-w-0 px-2 py-3 align-top font-medium text-foreground lg:max-w-[260px] lg:px-4 lg:align-middle">
                {/* Protocolo e cliente viram linhas desta célula no celular. */}
                <span className="mb-0.5 block font-mono text-[11px] font-medium text-muted-foreground lg:hidden">
                  {p.number}
                </span>
                <span className="line-clamp-2 lg:line-clamp-1">{p.title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground lg:hidden">
                  <span className="line-clamp-1">{p.client}</span>
                  {p.access === "privado" && <Lock className="h-3 w-3 shrink-0" />}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                <span className="inline-flex items-center gap-1.5">
                  <span className="line-clamp-1">{p.client}</span>
                  {p.access === "privado" && <Lock className="h-3 w-3 shrink-0" />}
                </span>
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <CategoryBadge category={p.category} />
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <AvatarStack users={p.assignees} />
              </td>
              <td className="w-[92px] px-1 py-3 align-top lg:w-auto lg:px-4 lg:align-middle">
                <span className="inline-block max-w-full [&>span]:block [&>span]:whitespace-normal lg:[&>span]:inline lg:[&>span]:whitespace-nowrap">
                  <StatusBadge status={p.status} />
                </span>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">
                <PriorityDot priority={p.priority} />
              </td>
              <td className="w-[96px] px-1 py-3 align-top lg:w-auto lg:whitespace-nowrap lg:px-4 lg:align-middle">
                <span className="inline-block max-w-full [&>span]:max-w-full [&>span]:items-start [&>span]:whitespace-normal lg:[&>span]:items-center lg:[&>span]:whitespace-nowrap">
                  <DeadlineBadge deadline={p.deadline} label={p.deadlineLabel} />
                </span>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted-foreground lg:table-cell">
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
