import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  X, MessageSquare, Paperclip, History, Info, Lock, Users, Send,
  Download, FileText, Image as ImageIcon, FileSpreadsheet, CheckSquare, Square,
  Calendar, UserCircle2, Tag, AlertTriangle, ChevronDown, Plus, Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "./AvatarStack";
import { AccessBadge, CategoryBadge, PriorityDot, StatusBadge } from "./badges";
import type { Protocol } from "./types";

type Tab = "conversa" | "arquivos" | "historico" | "info";

interface Msg {
  id: string;
  author: string;
  initials: string;
  color: string;
  time: string;
  text: string;
  internal: boolean;
  me?: boolean;
  attachment?: { name: string; size: string };
}

const MOCK_MESSAGES: Msg[] = [
  {
    id: "m1", author: "Padaria Real", initials: "PR", color: "bg-blue-500",
    time: "Hoje, 09:12", internal: false,
    text: "Bom dia! Recebemos uma divergência no DAS deste mês. Podem revisar?",
  },
  {
    id: "m2", author: "Você", initials: "VC", color: "bg-primary", me: true,
    time: "Hoje, 09:34", internal: false,
    text: "Bom dia, Pedro! Já estamos analisando aqui. Em até 2 horas retornamos com o detalhamento.",
  },
  {
    id: "m3", author: "Ana Lima", initials: "AL", color: "bg-rose-500",
    time: "Hoje, 09:40", internal: true,
    text: "@bruno conferir a apuração de março, parece que faltou lançar a NF #4521.",
  },
  {
    id: "m4", author: "Bruno Silva", initials: "BS", color: "bg-blue-500",
    time: "Hoje, 10:02", internal: true,
    text: "Confirmado, lancei agora e refiz a apuração. Diferença de R$ 218,40.",
    attachment: { name: "apuracao-marco-revisada.pdf", size: "248 KB" },
  },
];

const FILES = [
  { name: "apuracao-marco-revisada.pdf", type: "PDF", size: "248 KB", date: "Hoje, 10:02", icon: FileText },
  { name: "comprovante-das.jpg", type: "Imagem", size: "1.2 MB", date: "Ontem", icon: ImageIcon },
  { name: "balanco-q1.xlsx", type: "Planilha", size: "84 KB", date: "2 dias", icon: FileSpreadsheet },
];

const TIMELINE = [
  { time: "Hoje, 10:02", text: "Bruno Silva enviou apuracao-marco-revisada.pdf" },
  { time: "Hoje, 09:40", text: "Ana Lima adicionou nota interna" },
  { time: "Hoje, 09:34", text: "Você respondeu ao cliente" },
  { time: "Hoje, 09:12", text: "Cliente abriu o protocolo" },
  { time: "Hoje, 09:10", text: "Protocolo criado · prioridade Alta" },
];

const CHECKLIST = [
  { id: "c1", label: "RG do responsável", done: true },
  { id: "c2", label: "CPF do responsável", done: true },
  { id: "c3", label: "Contrato social atualizado", done: false },
  { id: "c4", label: "Comprovante de endereço", done: false },
];

interface Props {
  protocol: Protocol;
  onClose: () => void;
}

export const ProtocolPanel = ({ protocol, onClose }: Props) => {
  const [tab, setTab] = useState<Tab>("conversa");
  const [internal, setInternal] = useState(false);
  const [draft, setDraft] = useState("");
  const [checks, setChecks] = useState(CHECKLIST);

  return (
    <aside className="flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card shadow-panel">
      <div className="border-b border-border p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-medium text-muted-foreground">{protocol.number}</span>
              <CategoryBadge category={protocol.category} />
            </div>
            <h2 className="text-lg font-semibold leading-tight text-foreground">{protocol.title}</h2>
            <p className="text-sm text-muted-foreground">{protocol.client}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-1">
            <StatusBadge status={protocol.status} />
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <PriorityDot priority={protocol.priority} />
          <span className="text-muted-foreground">·</span>
          <AccessBadge access={protocol.access} />
          <div className="ml-auto flex items-center gap-2">
            <AvatarStack users={protocol.assignees} max={4} size="md" />
            <button className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-3">
        {[
          { id: "conversa", label: "Conversa", Icon: MessageSquare },
          { id: "arquivos", label: "Arquivos", Icon: Paperclip },
          { id: "historico", label: "Histórico", Icon: History },
          { id: "info", label: "Informações", Icon: Info },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={cn(
              "relative inline-flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors",
              tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === "conversa" && (
          <ConversationTab
            internal={internal}
            setInternal={setInternal}
            draft={draft}
            setDraft={setDraft}
          />
        )}
        {tab === "arquivos" && <FilesTab />}
        {tab === "historico" && <TimelineTab />}
        {tab === "info" && <InfoTab protocol={protocol} checks={checks} setChecks={setChecks} />}
      </div>
    </aside>
  );
};

const ConversationTab = ({
  internal, setInternal, draft, setDraft,
}: {
  internal: boolean;
  setInternal: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
}) => {
  return (
    <>
      <div className="border-b border-border p-3">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium">
          <button
            onClick={() => setInternal(false)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 transition-all",
              !internal ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Users className="h-4 w-4" />
            Cliente
          </button>
          <button
            onClick={() => setInternal(true)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 transition-all",
              internal ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Lock className="h-4 w-4" />
            Interno
          </button>
        </div>
      </div>

      <div
        className={cn(
          "scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5 transition-colors",
          internal && "bg-amber-50/40",
        )}
      >
        {internal && (
          <div className="mx-auto inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-100/70 px-3 py-1.5 text-xs text-amber-800">
            <Lock className="h-3 w-3" />
            Área interna — visível apenas para profissionais
          </div>
        )}
        {MOCK_MESSAGES.filter((m) => m.internal === internal).map((m) => (
          <MessageBubble key={m.id} msg={m} internal={internal} />
        ))}
      </div>

      <div className="border-t border-border bg-card p-3">
        <div
          className={cn(
            "rounded-xl border bg-background transition-colors",
            internal ? "border-amber-200 bg-amber-50/40" : "border-border",
          )}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={internal ? "Escreva uma nota interna…" : "Escreva para o cliente…"}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
            rows={2}
          />
          <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <button className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"><Paperclip className="h-4 w-4" /></button>
              <button className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"><Smile className="h-4 w-4" /></button>
            </div>
            <Button size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Enviar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

const MessageBubble = ({ msg, internal }: { msg: Msg; internal: boolean }) => {
  const me = msg.me;
  return (
    <div className={cn("flex gap-2.5", me && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
          msg.color,
        )}
      >
        {msg.initials}
      </div>
      <div className={cn("max-w-[75%] space-y-1", me && "items-end text-right")}>
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", me && "justify-end")}>
          <span className="font-medium text-foreground">{msg.author}</span>
          <span>{msg.time}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm",
            me
              ? "rounded-br-md bg-primary text-primary-foreground"
              : internal
              ? "rounded-bl-md border border-amber-200 bg-card text-foreground"
              : "rounded-bl-md bg-muted text-foreground",
          )}
        >
          {msg.text}
          {msg.attachment && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-card/60 px-2 py-1.5 text-xs text-foreground">
              <FileText className="h-4 w-4 text-status-progress" />
              <div className="text-left">
                <div className="font-medium">{msg.attachment.name}</div>
                <div className="text-[10px] text-muted-foreground">{msg.attachment.size}</div>
              </div>
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FilesTab = () => (
  <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-5">
    <div className="mb-3 flex items-center justify-between">
      <h4 className="text-sm font-semibold">Arquivos do protocolo</h4>
      <Button size="sm" variant="outline" className="h-8 gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Anexar
      </Button>
    </div>
    {FILES.map((f) => (
      <div
        key={f.name}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-progress-bg text-status-progress">
          <f.icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{f.name}</div>
          <div className="text-xs text-muted-foreground">
            {f.type} · {f.size} · {f.date}
          </div>
        </div>
        <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <Download className="h-4 w-4" />
        </button>
      </div>
    ))}
  </div>
);

const TimelineTab = () => (
  <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
    <div className="relative space-y-5 border-l border-border pl-5">
      {TIMELINE.map((t, i) => (
        <div key={i} className="relative">
          <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
          <p className="text-sm text-foreground">{t.text}</p>
          <p className="text-xs text-muted-foreground">{t.time}</p>
        </div>
      ))}
    </div>
  </div>
);

const InfoTab = ({
  protocol, checks, setChecks,
}: {
  protocol: Protocol;
  checks: typeof CHECKLIST;
  setChecks: (c: typeof CHECKLIST) => void;
}) => (
  <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-5">
    <div className="grid grid-cols-2 gap-3">
      <InfoCell icon={UserCircle2} label="Cliente" value={protocol.client} />
      <InfoCell icon={Tag} label="Categoria" value={protocol.category} />
      <InfoCell icon={Calendar} label="Prazo" value={protocol.deadlineLabel} />
      <InfoCell icon={AlertTriangle} label="Prioridade" value={
        protocol.priority === "alta" ? "Alta" : protocol.priority === "media" ? "Média" : "Baixa"
      } />
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">SLA</h4>
        <span className="text-xs text-muted-foreground">62% utilizado</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-priority-medium" style={{ width: "62%" }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Resposta esperada em até 4h úteis</p>
    </div>

    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Checklist de documentos</h4>
        <span className="text-xs text-muted-foreground">
          {checks.filter((c) => c.done).length}/{checks.length}
        </span>
      </div>
      <div className="space-y-1">
        {checks.map((c) => (
          <button
            key={c.id}
            onClick={() => setChecks(checks.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
          >
            {c.done ? (
              <CheckSquare className="h-4 w-4 text-status-done" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={cn(c.done && "text-muted-foreground line-through")}>{c.label}</span>
          </button>
        ))}
      </div>
    </div>

    <div>
      <h4 className="mb-2 text-sm font-semibold">Equipe com acesso</h4>
      <div className="space-y-2">
        {protocol.assignees.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-md p-1.5">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white", a.color)}>
              {a.initials}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">Responsável</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const InfoCell = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground">{value}</div>
  </div>
);