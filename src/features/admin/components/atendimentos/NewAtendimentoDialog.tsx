import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  X, ChevronRight, ChevronLeft, Search, Check, Upload, FileText,
  Lock, Users, Sparkles, Calendar, Tag, AlertTriangle, UserCircle2,
  Plus, Trash2, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "./AvatarStack";
import type { Assignee, Category, Priority, Access, NewProtocolData } from "../../types/atendimentos";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate?: (data: NewProtocolData) => void;
}

const CLIENTS = [
  { id: "c1", name: "Padaria Real Ltda", doc: "12.345.678/0001-99", tag: "Fiscal · MEI" },
  { id: "c2", name: "Studio Verde Arq.", doc: "23.456.789/0001-10", tag: "RH · Simples" },
  { id: "c3", name: "Tech Bravo S.A.", doc: "34.567.890/0001-21", tag: "Lucro Real" },
  { id: "c4", name: "Café da Esquina", doc: "45.678.901/0001-32", tag: "Simples Nacional" },
  { id: "c5", name: "Construtora Norte", doc: "56.789.012/0001-43", tag: "Lucro Presumido" },
];

const CATEGORIES: { id: Category; desc: string; tone: string }[] = [
  { id: "Fiscal", desc: "Apuração, impostos e obrigações", tone: "bg-blue-50 text-blue-700" },
  { id: "RH", desc: "Folha, admissões e demissões", tone: "bg-violet-50 text-violet-700" },
  { id: "Jurídico", desc: "Contratos, defesas e pareceres", tone: "bg-amber-50 text-amber-700" },
  { id: "Societário", desc: "Alterações, abertura e baixa", tone: "bg-emerald-50 text-emerald-700" },
  { id: "Contábil", desc: "Lançamentos e balanços", tone: "bg-slate-100 text-slate-700" },
];

const TEAM: Assignee[] = [
  { id: "u1", name: "Ana Lima", initials: "AL", color: "bg-rose-500" },
  { id: "u2", name: "Bruno Silva", initials: "BS", color: "bg-blue-500" },
  { id: "u3", name: "Carla Souza", initials: "CS", color: "bg-emerald-500" },
  { id: "u4", name: "Diego Reis", initials: "DR", color: "bg-violet-500" },
  { id: "u5", name: "Elisa Tavares", initials: "ET", color: "bg-amber-500" },
];

const TEMPLATES: { id: string; title: string; category: Category; checklist: string[] }[] = [
  {
    id: "t1", title: "Apuração mensal de impostos", category: "Fiscal",
    checklist: ["Notas fiscais de entrada", "Notas fiscais de saída", "Extrato bancário", "Apuração revisada"],
  },
  {
    id: "t2", title: "Admissão de colaborador", category: "RH",
    checklist: ["RG e CPF", "Comprovante de endereço", "Carteira de trabalho", "Exame admissional"],
  },
  {
    id: "t3", title: "Alteração contratual", category: "Societário",
    checklist: ["Contrato social atual", "Documento dos sócios", "Ata de alteração", "Protocolo na junta"],
  },
];

type Step = 1 | 2 | 3 | 4;

export const NewAtendimentoDialog = ({ open, onClose, onCreate }: Props) => {
  const [step, setStep] = useState<Step>(1);
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState<typeof CLIENTS[number] | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [template, setTemplate] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [deadline, setDeadline] = useState("");
  const [access, setAccess] = useState<Access>("compartilhado");
  const [assignees, setAssignees] = useState<Assignee[]>([TEAM[0]]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newCheck, setNewCheck] = useState("");
  const [files, setFiles] = useState<{ name: string; size: string }[]>([]);

  if (!open) return null;

  const filteredClients = CLIENTS.filter((c) =>
    `${c.name} ${c.doc}`.toLowerCase().includes(clientQuery.toLowerCase()),
  );

  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplate(id);
    setTitle(t.title);
    setCategory(t.category);
    setChecklist(t.checklist);
  };

  const toggleAssignee = (u: Assignee) => {
    setAssignees((prev) =>
      prev.some((a) => a.id === u.id) ? prev.filter((a) => a.id !== u.id) : [...prev, u],
    );
  };

  const addCheck = () => {
    if (!newCheck.trim()) return;
    setChecklist([...checklist, newCheck.trim()]);
    setNewCheck("");
  };

  const canNext = () => {
    if (step === 1) return !!client && !!category;
    if (step === 2) return !!title.trim();
    if (step === 3) return assignees.length > 0;
    return true;
  };

  const handleCreate = () => {
    if (!client || !category) return;
    onCreate?.({
      client: client.name, category, title, description, priority,
      deadline, access, assignees, checklist, files,
    });
    onClose();
    setStep(1); setClient(null); setCategory(null); setTitle(""); setDescription("");
    setChecklist([]); setFiles([]); setTemplate(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-card-hover animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Novo atendimento</h2>
            <p className="text-sm text-muted-foreground">
              Crie um protocolo em poucos passos.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-muted/40 px-6 py-3">
          <div className="flex items-center gap-2">
            {[
              { n: 1, label: "Cliente & categoria" },
              { n: 2, label: "Detalhes" },
              { n: 3, label: "Equipe & prazo" },
              { n: 4, label: "Revisão" },
            ].map((s, i) => (
              <div key={s.n} className="flex flex-1 items-center gap-2">
                <button
                  onClick={() => s.n < step && setStep(s.n as Step)}
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium transition-colors",
                    step >= s.n ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                      step > s.n
                        ? "bg-status-done text-white"
                        : step === s.n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {step > s.n ? <Check className="h-3 w-3" /> : s.n}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < 3 && (
                  <div
                    className={cn(
                      "h-px flex-1 transition-colors",
                      step > s.n ? "bg-status-done" : "bg-border",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label icon={Sparkles}>Comece com um modelo (opcional)</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTemplate(t.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all hover:border-primary/50 hover:shadow-card",
                        template === t.id ? "border-primary bg-primary/5" : "border-border bg-background",
                      )}
                    >
                      <div className="text-xs font-medium text-muted-foreground">{t.category}</div>
                      <div className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
                        {t.title}
                      </div>
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        {t.checklist.length} itens no checklist
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label icon={Building2}>Cliente</Label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Buscar cliente por nome ou CNPJ…"
                    className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto scrollbar-thin">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClient(c)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                        client?.id === c.id ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted",
                      )}
                    >
                      <div>
                        <div className="font-medium text-foreground">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.doc} · {c.tag}</div>
                      </div>
                      {client?.id === c.id && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                      Nenhum cliente encontrado · <button className="font-medium text-primary hover:underline">Cadastrar novo</button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label icon={Tag}>Categoria</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all hover:border-primary/50",
                        category === c.id ? "border-primary bg-primary/5" : "border-border bg-background",
                      )}
                    >
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-[11px] font-medium", c.tone)}>
                        {c.id}
                      </span>
                      <div className="mt-1.5 text-xs text-muted-foreground">{c.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label>Título do atendimento</Label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Apuração de impostos — abril/2026"
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div>
                <Label>Descrição</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o contexto, o que o cliente solicitou e qualquer detalhe relevante…"
                  rows={4}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>

              <div>
                <Label icon={FileText}>Checklist de documentos</Label>
                <div className="mt-2 space-y-1.5">
                  {checklist.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                      <span className="flex h-4 w-4 items-center justify-center rounded border border-border" />
                      <span className="flex-1 text-foreground">{c}</span>
                      <button
                        onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-priority-high"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={newCheck}
                      onChange={(e) => setNewCheck(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCheck())}
                      placeholder="Adicionar item ao checklist…"
                      className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                    />
                    <Button size="sm" variant="outline" onClick={addCheck} className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label icon={Upload}>Anexos iniciais</Label>
                <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <div className="text-sm font-medium text-foreground">Arraste arquivos ou clique para enviar</div>
                  <div className="text-xs text-muted-foreground">PDF, JPG, XLSX até 25 MB</div>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const list = Array.from(e.target.files || []).map((f) => ({
                        name: f.name,
                        size: `${(f.size / 1024).toFixed(0)} KB`,
                      }));
                      setFiles([...files, ...list]);
                    }}
                  />
                </label>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-sm">
                        <FileText className="h-4 w-4 text-status-progress" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{f.size}</span>
                        <button
                          onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-priority-high"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <Label icon={AlertTriangle}>Prioridade</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["alta", "media", "baixa"] as Priority[]).map((p) => {
                    const cfg = {
                      alta: { label: "Alta", dot: "bg-priority-high", desc: "Resposta em até 2h" },
                      media: { label: "Média", dot: "bg-priority-medium", desc: "Resposta em até 4h" },
                      baixa: { label: "Baixa", dot: "bg-priority-low", desc: "Resposta em até 1 dia" },
                    }[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-all",
                          priority === p ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                          <span className="text-sm font-semibold">{cfg.label}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{cfg.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label icon={Calendar}>Prazo</Label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    { label: "Hoje", days: 0 },
                    { label: "+ 2 dias", days: 2 },
                    { label: "+ 5 dias", days: 5 },
                    { label: "+ 1 semana", days: 7 },
                    { label: "+ 15 dias", days: 15 },
                  ].map((q) => (
                    <button
                      key={q.label}
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + q.days);
                        setDeadline(d.toISOString().slice(0, 10));
                      }}
                      className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label icon={UserCircle2}>Equipe responsável</Label>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {TEAM.map((u) => {
                    const selected = assignees.some((a) => a.id === u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleAssignee(u)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border p-2 transition-all",
                          selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30",
                        )}
                      >
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white", u.color)}>
                          {u.initials}
                        </div>
                        <span className="flex-1 text-left text-sm font-medium">{u.name}</span>
                        {selected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Acesso</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAccess("compartilhado")}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all",
                      access === "compartilhado" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    <Users className="mt-0.5 h-4 w-4 text-status-progress" />
                    <div>
                      <div className="text-sm font-semibold">Compartilhado</div>
                      <div className="text-[11px] text-muted-foreground">Toda equipe atribuída pode ver</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setAccess("privado")}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all",
                      access === "privado" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-semibold">Privado</div>
                      <div className="text-[11px] text-muted-foreground">Visível apenas para responsáveis</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-xs font-medium text-muted-foreground">Resumo</div>
                <div className="mt-1 text-base font-semibold text-foreground">{title || "Sem título"}</div>
                <div className="text-sm text-muted-foreground">{client?.name} · {category}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewCell label="Prioridade" value={priority === "alta" ? "Alta" : priority === "media" ? "Média" : "Baixa"} />
                <ReviewCell label="Prazo" value={deadline || "Não definido"} />
                <ReviewCell label="Acesso" value={access === "privado" ? "Privado" : "Compartilhado"} />
                <ReviewCell label="Itens no checklist" value={`${checklist.length}`} />
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Equipe</div>
                <div className="flex items-center gap-3">
                  <AvatarStack users={assignees} max={5} size="md" />
                  <span className="text-sm text-foreground">
                    {assignees.map((a) => a.name).join(", ")}
                  </span>
                </div>
              </div>

              {description && (
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Descrição</div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
                </div>
              )}

              {files.length > 0 && (
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Anexos ({files.length})</div>
                  <div className="space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <FileText className="h-3.5 w-3.5 text-status-progress" />
                        <span>{f.name}</span>
                        <span className="text-xs text-muted-foreground">· {f.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
          <div className="text-xs text-muted-foreground">
            Etapa <span className="font-semibold text-foreground">{step}</span> de 4
          </div>
          <div className="flex gap-2">
            {step > 1 ? (
              <Button variant="outline" size="sm" onClick={() => setStep((step - 1) as Step)} className="gap-1">
                <ChevronLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancelar
              </Button>
            )}
            {step < 4 ? (
              <Button
                size="sm"
                disabled={!canNext()}
                onClick={() => setStep((step + 1) as Step)}
                className="gap-1"
              >
                Continuar
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleCreate} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />
                Criar atendimento
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Label = ({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ElementType }) => (
  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
    {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
    {children}
  </div>
);

const ReviewCell = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
  </div>
);