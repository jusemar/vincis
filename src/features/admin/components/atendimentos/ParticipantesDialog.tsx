"use client";

import { startTransition, useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  X, Search, UserPlus, Users, Handshake, Trash2, Loader2, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  atribuirMembroAoAtendimento,
  cancelarConviteAtendimento,
  carregarConvitesDoAtendimento,
  convidarPrestadorParaAtendimento,
  listarMembrosParaAtribuir,
  pesquisarPrestadoresParaConvite,
  removerParticipanteDoAtendimento,
} from "@/features/atendimentos/actions/colaboracao";
import { ROTULO_STATUS_CONVITE } from "@/features/atendimentos/constants/atendimento";
import { centavosDoTexto, rotuloValorCentavos } from "@/features/atendimentos/lib/valores";
import type { ConviteAtendimentoDTO } from "@/features/atendimentos/queries/convites-do-atendimento";
import type { MembroAtribuivelDTO } from "@/features/atendimentos/queries/listar-membros-atribuiveis";
import { NegociacaoConvite } from "./NegociacaoConvite";
import type { Assignee } from "../../types/atendimentos";

type Aba = "participantes" | "equipe" | "convidar" | "convites";

/** Um prestador encontrado na busca, já com a situação dele neste Atendimento. */
type CandidatoConvite = {
  usuarioId: string;
  nome: string;
  tipoProfissional: string | null;
  cidade: string | null;
  estado: string | null;
  formacao: string | null;
  situacao: "participando" | "convite_pendente" | "equipe" | "disponivel";
};

interface Props {
  open: boolean;
  onClose: () => void;
  atendimentoId: string;
  protocolo: string;
  /** Quem já está no Atendimento, na mesma forma que o painel já usa. */
  participantes: Assignee[];
  responsavelId?: string;
  onAtualizar?: () => void;
}

/**
 * Gestão de quem participa deste Atendimento.
 *
 * Duas portas, e a diferença entre elas é de natureza, não de interface:
 *
 * - **Equipe**: quem já pertence ao escritório entra por atribuição direta. O
 *   vínculo com a casa já é o acordo; não há o que negociar.
 * - **Convidar**: quem é de fora recebe um convite, analisa um recorte do
 *   Atendimento e negocia escopo e valor antes de decidir. Só o aceite dele o
 *   torna participante.
 *
 * O diálogo é o mesmo do "Novo atendimento" em forma e tom — nada de redesenho:
 * o botão `+` ao lado dos avatares, que até aqui não fazia nada, passou a abrir
 * esta tela.
 */
export const ParticipantesDialog = ({
  open, onClose, atendimentoId, protocolo, participantes, responsavelId, onAtualizar,
}: Props) => {
  const [aba, setAba] = useState<Aba>("participantes");
  const [membros, setMembros] = useState<MembroAtribuivelDTO[]>([]);
  const [convites, setConvites] = useState<ConviteAtendimentoDTO[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatoConvite[]>([]);
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [escolhido, setEscolhido] = useState<CandidatoConvite | null>(null);
  const [escopo, setEscopo] = useState("");
  const [valor, setValor] = useState("");
  const [conviteAberto, setConviteAberto] = useState<string | null>(null);
  const [processando, iniciarTransicao] = useTransition();

  /**
   * Recarrega equipe e convites do servidor.
   *
   * A tela nunca deduz o resultado de uma ação: depois de atribuir, convidar ou
   * cancelar, os dados vêm de novo do banco. É o que impede o diálogo de
   * mostrar um estado que a regra do servidor recusou.
   */
  const recarregar = useCallback(async () => {
    const [equipe, lista] = await Promise.all([
      listarMembrosParaAtribuir({ atendimentoId }),
      carregarConvitesDoAtendimento({ atendimentoId }),
    ]);
    if (equipe.sucesso && equipe.dados) setMembros(equipe.dados);
    if (lista.sucesso && lista.dados) setConvites(lista.dados);
  }, [atendimentoId]);

  useEffect(() => {
    if (!open) return;
    // Mesmo padrão das demais telas de colaboração: a carga acontece dentro de
    // uma transição, para que abrir o diálogo não bloqueie a interação.
    startTransition(async () => {
      await recarregar();
    });
  }, [open, recarregar]);

  if (!open) return null;

  function executar(acao: () => Promise<{ sucesso: boolean; mensagem: string }>) {
    if (processando) return;
    iniciarTransicao(async () => {
      const resultado = await acao();
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      await recarregar();
      onAtualizar?.();
    });
  }

  async function pesquisar() {
    setBuscando(true);
    const resultado = await pesquisarPrestadoresParaConvite({
      atendimentoId,
      busca,
    });
    setBuscando(false);
    if (!resultado.sucesso || !resultado.dados) {
      toast.error(resultado.mensagem);
      return;
    }
    setCandidatos(resultado.dados);
  }

  function enviarConvite() {
    if (!escolhido || !escopo.trim()) return;
    executar(async () => {
      const resultado = await convidarPrestadorParaAtendimento({
        atendimentoId,
        destinatarioId: escolhido.usuarioId,
        escopo,
        valorOferecidoCentavos: centavosDoTexto(valor),
      });
      if (resultado.sucesso) {
        setEscolhido(null);
        setEscopo("");
        setValor("");
        setCandidatos([]);
        setBusca("");
        setAba("convites");
      }
      return resultado;
    });
  }

  const pendentes = convites.filter((c) => c.status === "pendente").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <button
        aria-label="Fechar"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-card-hover animate-in fade-in zoom-in-95">
        <header className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Participantes do atendimento
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{protocolo}</span> · quem trabalha neste
              atendimento e quem foi convidado
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3">
          {([
            { id: "participantes", label: `Participantes (${participantes.length})` },
            { id: "equipe", label: "Minha equipe" },
            { id: "convidar", label: "Convidar externo" },
            { id: "convites", label: pendentes ? `Convites (${pendentes})` : "Convites" },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-2.5 py-3 text-sm font-medium transition-colors",
                aba === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {aba === id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
          {aba === "participantes" && (
            <div className="space-y-2">
              {participantes.map((pessoa) => {
                const ehResponsavel = pessoa.id === responsavelId;
                return (
                  <div
                    key={pessoa.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                        pessoa.color,
                      )}
                    >
                      {pessoa.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{pessoa.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ehResponsavel ? "Responsável" : "Participante"}
                      </div>
                    </div>
                    {ehResponsavel ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        Responsável
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground hover:text-destructive"
                        disabled={processando}
                        onClick={() =>
                          executar(() =>
                            removerParticipanteDoAtendimento({
                              atendimentoId,
                              participanteId: pessoa.id,
                            }),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {aba === "equipe" && (
            <div className="space-y-2">
              {membros.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                  Você não tem equipe cadastrada. Para trazer alguém de fora, use
                  &ldquo;Convidar externo&rdquo;.
                </p>
              ) : (
                membros.map((membro) => (
                  <div
                    key={membro.usuarioId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{membro.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {membro.tipoProfissional ?? membro.email}
                      </div>
                    </div>
                    {membro.jaParticipa ? (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Já participa
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={processando}
                        onClick={() =>
                          executar(() =>
                            atribuirMembroAoAtendimento({
                              atendimentoId,
                              membroId: membro.usuarioId,
                            }),
                          )
                        }
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Atribuir
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {aba === "convidar" && (
            <div className="space-y-4">
              {escolhido ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{escolhido.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {escolhido.tipoProfissional ?? "Prestador"}
                        {escolhido.cidade ? ` · ${escolhido.cidade}` : ""}
                        {escolhido.estado ? `/${escolhido.estado}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEscolhido(null)}>
                      Trocar
                    </Button>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Escopo combinado
                    </label>
                    <textarea
                      value={escopo}
                      onChange={(e) => setEscopo(e.target.value)}
                      rows={4}
                      placeholder="Descreva o que está sendo pedido a este prestador…"
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                    {/* O convidado lê este texto antes de aceitar; ele é a
                        primeira linha da negociação. */}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Este texto abre a negociação e é o que o convidado analisa
                      antes de responder.
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Valor oferecido (opcional)
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">R$</span>
                      <input
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                        inputMode="decimal"
                        placeholder="0,00"
                        className="h-9 w-40 rounded-lg border border-border bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </div>
                  </div>

                  <Button
                    className="w-full gap-1.5"
                    disabled={processando || !escopo.trim()}
                    onClick={enviarConvite}
                  >
                    <Handshake className="h-4 w-4" />
                    Enviar convite
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void pesquisar();
                        }}
                        placeholder="Buscar profissional ou colaborador…"
                        className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void pesquisar()}>
                      {buscando ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Buscar"
                      )}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {candidatos.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                        Busque por nome, cidade, formação ou especialidade.
                      </p>
                    ) : (
                      candidatos.map((candidato) => (
                        <div
                          key={candidato.usuarioId}
                          className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {candidato.nome}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {candidato.tipoProfissional ?? "Prestador"}
                              {candidato.cidade ? ` · ${candidato.cidade}` : ""}
                              {candidato.estado ? `/${candidato.estado}` : ""}
                            </div>
                          </div>
                          {candidato.situacao === "disponivel" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => setEscolhido(candidato)}
                            >
                              <Handshake className="h-3.5 w-3.5" />
                              Convidar
                            </Button>
                          ) : (
                            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {candidato.situacao === "participando"
                                ? "Já participa"
                                : candidato.situacao === "convite_pendente"
                                  ? "Convite enviado"
                                  : "Da sua equipe"}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {aba === "convites" && (
            <div className="space-y-3">
              {convites.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                  Nenhum convite enviado neste atendimento.
                </p>
              ) : (
                convites.map((convite) => {
                  const expandido = conviteAberto === convite.id;
                  // Sem negociação carregada, o convite é de outra pessoa: a
                  // conversa sobre valores não é lida por terceiros.
                  const podeAbrir = convite.negociacao.length > 0;
                  return (
                    <div
                      key={convite.id}
                      className="rounded-xl border border-border bg-background p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {convite.destinatario.nome}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {ROTULO_STATUS_CONVITE[convite.status]}
                            {" · "}
                            {rotuloValorCentavos(
                              convite.valorAcordadoCentavos ??
                                convite.valorOferecidoCentavos,
                              "sem valor",
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {podeAbrir && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setConviteAberto(expandido ? null : convite.id)
                              }
                            >
                              {expandido ? "Fechar" : "Negociação"}
                            </Button>
                          )}
                          {convite.status === "pendente" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={processando}
                              onClick={() =>
                                executar(() =>
                                  cancelarConviteAtendimento({ conviteId: convite.id }),
                                )
                              }
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                      {expandido && (
                        <div className="mt-3 border-t border-border pt-3">
                          <NegociacaoConvite
                            convite={convite}
                            onAtualizar={() => void recarregar()}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-card/40 px-5 py-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Convidado externo só entra depois de aceitar.
          </span>
          <Button size="sm" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </footer>
      </div>
    </div>
  );
};
