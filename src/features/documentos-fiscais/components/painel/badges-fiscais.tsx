"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  ShieldQuestion,
  type LucideIcon,
} from "lucide-react";

/**
 * Selos da Central Fiscal, no mesmo vocabulário visual do resto do painel
 * (`badge-success`, `badge-warning`, `badge-info`).
 *
 * Cada família é um conceito diferente e não se mistura: sentido da operação,
 * andamento do processamento, revisão humana e situação na autoridade fiscal.
 * Nenhum selo afirma mais do que o documento registra — "autorizada" só
 * apareceria se a situação tivesse sido verificada, o que ainda não existe.
 */

type Config = { texto: string; classe: string; Icone: LucideIcon };

const SENTIDO: Record<string, Config> = {
  emitido: { texto: "Emitida", classe: "badge-info", Icone: ArrowUpRight },
  recebido: { texto: "Recebida", classe: "badge-success", Icone: ArrowDownLeft },
  nao_determinado: {
    texto: "Não determinado",
    classe: "bg-muted text-muted-foreground",
    Icone: HelpCircle,
  },
};

const PROCESSAMENTO: Record<string, Config> = {
  pendente: { texto: "Aguardando", classe: "badge-warning", Icone: Clock },
  processando: { texto: "Processando", classe: "badge-info", Icone: Loader2 },
  processado: { texto: "Processado", classe: "badge-success", Icone: CheckCircle2 },
  falhou: {
    texto: "Não interpretado",
    classe: "bg-destructive/10 text-destructive",
    Icone: AlertTriangle,
  },
};

const REVISAO: Record<string, Config> = {
  pendente: { texto: "Revisão pendente", classe: "badge-warning", Icone: Clock },
  revisado: { texto: "Revisado", classe: "badge-success", Icone: CheckCircle2 },
  com_divergencia: {
    texto: "Com divergência",
    classe: "bg-destructive/10 text-destructive",
    Icone: AlertTriangle,
  },
};

const SITUACAO: Record<string, Config> = {
  nao_verificada: {
    texto: "Não verificada",
    classe: "bg-muted text-muted-foreground",
    Icone: ShieldQuestion,
  },
  autorizada: { texto: "Autorizada", classe: "badge-success", Icone: CheckCircle2 },
  cancelada: { texto: "Cancelada", classe: "bg-destructive/10 text-destructive", Icone: AlertTriangle },
  denegada: { texto: "Denegada", classe: "bg-destructive/10 text-destructive", Icone: AlertTriangle },
};

function Selo({ config }: { config: Config }) {
  const Icone = config.Icone;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${config.classe}`}
    >
      <Icone className="size-3" />
      {config.texto}
    </span>
  );
}

/** Sentido nulo é documento ainda não interpretado: também é "não determinado". */
export function BadgeSentido({ sentido }: { sentido: string | null }) {
  return <Selo config={SENTIDO[sentido ?? "nao_determinado"] ?? SENTIDO.nao_determinado} />;
}

export function BadgeProcessamento({ status }: { status: string }) {
  return <Selo config={PROCESSAMENTO[status] ?? PROCESSAMENTO.pendente} />;
}

export function BadgeRevisao({ status }: { status: string }) {
  return <Selo config={REVISAO[status] ?? REVISAO.pendente} />;
}

export function BadgeSituacao({ situacao }: { situacao: string }) {
  return <Selo config={SITUACAO[situacao] ?? SITUACAO.nao_verificada} />;
}

export const ROTULOS_SENTIDO = SENTIDO;
export const ROTULOS_PROCESSAMENTO = PROCESSAMENTO;
export const ROTULOS_REVISAO = REVISAO;
