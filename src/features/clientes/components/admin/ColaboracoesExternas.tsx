"use client";

import { startTransition, useEffect, useState } from "react";
import {
  Check,
  Handshake,
  Search,
  ShieldOff,
  UserRoundPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  carregarColaboracoes,
  enviarConviteColaboracao,
  pesquisarProfissionaisColaboracao,
  responderConviteColaboracao,
  revogarColaboracao,
} from "../../actions/colaboracoes";

type Colaboracao = {
  id: string;
  status: string;
  escopo: string;
  servicoId: string | null;
  origem: string;
  expiraEm: Date;
  respondidoEm: Date | null;
  revogadoEm: Date | null;
  createdAt: Date;
  clienteId: string;
  clienteNome: string;
  clienteCodigo: string;
  empresaOrigemNome: string | null;
  remetenteId: string;
  remetenteNome: string;
  remetenteEmail: string;
  remetenteProfissao: string | null;
  destinatarioId: string;
  destinatarioNome: string;
  destinatarioEmail: string;
  destinatarioProfissao: string | null;
};

type ClienteElegivel = {
  id: string;
  codigo: string;
  nome: string;
  empresaId: string | null;
};

type Candidato = {
  usuarioId: string;
  nome: string;
  avatarUrl: string | null;
  tipoProfissional: string;
  cidade: string;
  estado: string;
  formacao: string | null;
  numeroRegistro: string | null;
  especialidades: string[];
  situacao: "interno" | "colaborando" | "convite_pendente" | "disponivel";
};

const STATUS: Record<string, string> = {
  pendente: "Pendente",
  aceito: "Ativa",
  recusado: "Recusada",
  expirado: "Expirada",
  revogado: "Revogada",
};

const SITUACAO_CANDIDATO: Record<Candidato["situacao"], string> = {
  interno: "Já atende este cliente",
  colaborando: "Colaboração ativa",
  convite_pendente: "Convite pendente",
  disponivel: "Convidar",
};

function dataCurta(data: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(data));
}

function nomeProfissao(tipo: string | null) {
  if (tipo === "contabilidade") return "Contador";
  if (tipo === "advocacia") return "Advogado";
  if (tipo === "especialista_fiscal") return "Especialista fiscal";
  return "Profissional";
}

function situacaoColaboracao(colaboracao: Colaboracao) {
  if (colaboracao.revogadoEm) return "revogado";
  if (
    colaboracao.status === "pendente" &&
    new Date(colaboracao.expiraEm) <= new Date()
  ) {
    return "expirado";
  }
  return colaboracao.status;
}

function EtiquetaExterna() {
  return (
    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
      Colaborador externo
    </span>
  );
}

/**
 * Painel de colaborações em cliente/serviço.
 *
 * Fluxo propositalmente distinto do convite de equipe: aqui não existe função
 * de escritório nem vínculo permanente — apenas acesso pontual e revogável ao
 * cliente compartilhado.
 */
export default function ColaboracoesExternas() {
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [recebidas, setRecebidas] = useState<Colaboracao[]>([]);
  const [concedidas, setConcedidas] = useState<Colaboracao[]>([]);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<
    ClienteElegivel[]
  >([]);
  const [processando, setProcessando] = useState<string | null>(null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [busca, setBusca] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [pesquisando, setPesquisando] = useState(false);

  useEffect(() => {
    let ativo = true;
    startTransition(async () => {
      setCarregando(true);
      const resultado = await carregarColaboracoes();
      if (!ativo) return;
      if (!resultado.sucesso || !resultado.dados) {
        toast.error(resultado.mensagem);
        setCarregando(false);
        return;
      }
      setRecebidas(resultado.dados.recebidas);
      setConcedidas(resultado.dados.concedidas);
      setClientesDisponiveis(resultado.dados.clientesDisponiveis);
      setClienteId((atual) =>
        resultado.dados.clientesDisponiveis.some((item) => item.id === atual)
          ? atual
          : (resultado.dados.clientesDisponiveis[0]?.id ?? ""),
      );
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  async function pesquisar() {
    if (!clienteId) return;
    setPesquisando(true);
    const resultado = await pesquisarProfissionaisColaboracao({
      clienteId,
      busca,
    });
    setPesquisando(false);
    if (!resultado.sucesso || !resultado.dados) {
      setCandidatos([]);
      toast.error(resultado.mensagem);
      return;
    }
    setCandidatos(resultado.dados);
  }

  async function convidar(candidato: Candidato) {
    setProcessando(candidato.usuarioId);
    const resultado = await enviarConviteColaboracao({
      clienteId,
      destinatarioId: candidato.usuarioId,
    });
    setProcessando(null);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setCandidatos((atuais) =>
      atuais.map((item) =>
        item.usuarioId === candidato.usuarioId
          ? { ...item, situacao: "convite_pendente" }
          : item,
      ),
    );
    setVersao((atual) => atual + 1);
  }

  async function responder(
    colaboracaoId: string,
    resposta: "aceitar" | "recusar",
  ) {
    setProcessando(colaboracaoId);
    const resultado = await responderConviteColaboracao({
      colaboracaoId,
      resposta,
    });
    setProcessando(null);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  async function revogar(colaboracaoId: string) {
    setProcessando(colaboracaoId);
    const resultado = await revogarColaboracao({ colaboracaoId });
    setProcessando(null);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  if (carregando) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-xl border bg-card">
        <span className="text-sm text-muted-foreground">
          Carregando colaborações...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-sky-500/20 shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-500/15">
              <Handshake className="size-5 text-sky-600 dark:text-sky-300" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold">
                Colaboração em cliente
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Acesso pontual e revogável a um cliente específico. O convidado
                não entra na equipe e não recebe acesso ao escritório.
              </p>
            </div>
          </div>
          <Button
            disabled={clientesDisponiveis.length === 0}
            onClick={() => {
              setDialogoAberto(true);
              setCandidatos([]);
            }}
          >
            <UserRoundPlus />
            Convidar colaborador
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Recebidas
        </h3>
        {recebidas.length === 0 ? (
          <EstadoVazio texto="Nenhum convite de colaboração recebido." />
        ) : (
          recebidas.map((colaboracao) => {
            const situacao = situacaoColaboracao(colaboracao);
            return (
              <Card key={colaboracao.id} className="border-sky-500/15 shadow-card">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-lg font-semibold">
                        {colaboracao.clienteNome}
                      </p>
                      <span className="font-mono text-xs text-primary">
                        {colaboracao.clienteCodigo}
                      </span>
                      <EtiquetaExterna />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Convidado por {colaboracao.remetenteNome} (
                      {nomeProfissao(colaboracao.remetenteProfissao)}) em{" "}
                      {dataCurta(colaboracao.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Origem:{" "}
                      {colaboracao.origem === "escritorio"
                        ? `Escritório ${colaboracao.empresaOrigemNome ?? ""}`
                        : "Profissional individual"}{" "}
                      · Escopo:{" "}
                      {colaboracao.escopo === "servico"
                        ? "Serviço específico"
                        : "Cliente inteiro"}
                    </p>
                  </div>
                  {situacao === "pendente" ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        disabled={processando === colaboracao.id}
                        onClick={() => void responder(colaboracao.id, "recusar")}
                      >
                        <X />
                        Recusar
                      </Button>
                      <Button
                        disabled={processando === colaboracao.id}
                        onClick={() => void responder(colaboracao.id, "aceitar")}
                      >
                        <Check />
                        Aceitar
                      </Button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold">
                      {STATUS[situacao] ?? situacao}
                    </span>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Concedidas
        </h3>
        {concedidas.length === 0 ? (
          <EstadoVazio texto="Nenhuma colaboração concedida nos seus clientes." />
        ) : (
          concedidas.map((colaboracao) => {
            const situacao = situacaoColaboracao(colaboracao);
            return (
              <Card key={colaboracao.id} className="border-sky-500/15 shadow-card">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-lg font-semibold">
                        {colaboracao.destinatarioNome}
                      </p>
                      <EtiquetaExterna />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {colaboracao.destinatarioEmail} ·{" "}
                      {nomeProfissao(colaboracao.destinatarioProfissao)}
                    </p>
                    <p className="mt-1 text-sm">
                      Cliente:{" "}
                      <span className="font-mono text-xs text-primary">
                        {colaboracao.clienteCodigo}
                      </span>{" "}
                      {colaboracao.clienteNome}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Convidado por {colaboracao.remetenteNome} em{" "}
                      {dataCurta(colaboracao.createdAt)}
                      {colaboracao.revogadoEm
                        ? ` · Revogada em ${dataCurta(colaboracao.revogadoEm)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold">
                      {STATUS[situacao] ?? situacao}
                    </span>
                    {(situacao === "pendente" || situacao === "aceito") && (
                      <Button
                        variant="outline"
                        disabled={processando === colaboracao.id}
                        onClick={() => void revogar(colaboracao.id)}
                      >
                        <ShieldOff />
                        Revogar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar colaborador externo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cliente-colaboracao">Cliente compartilhado</Label>
              <select
                id="cliente-colaboracao"
                value={clienteId}
                onChange={(evento) => {
                  setClienteId(evento.target.value);
                  setCandidatos([]);
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {clientesDisponiveis.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.codigo} · {cliente.nome}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                O convidado terá acesso somente a este cliente. Nenhum vínculo de
                equipe é criado.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="busca-colaborador">Profissional</Label>
              <div className="flex gap-2">
                <input
                  id="busca-colaborador"
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                  placeholder="Nome, cidade ou especialidade"
                  className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={pesquisando}
                  onClick={() => void pesquisar()}
                >
                  <Search />
                  Buscar
                </Button>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {pesquisando ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Pesquisando profissionais...
                </p>
              ) : candidatos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Busque um profissional aprovado para compartilhar o cliente.
                </p>
              ) : (
                candidatos.map((candidato) => (
                  <div
                    key={candidato.usuarioId}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {candidato.nome}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {nomeProfissao(candidato.tipoProfissional)} ·{" "}
                        {candidato.cidade}/{candidato.estado}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={
                        candidato.situacao !== "disponivel" ||
                        processando === candidato.usuarioId
                      }
                      onClick={() => void convidar(candidato)}
                    >
                      {SITUACAO_CANDIDATO[candidato.situacao]}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoVazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}
