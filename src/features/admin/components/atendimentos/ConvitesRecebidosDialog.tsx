"use client";

import { startTransition, useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  X, Inbox, Calendar, Tag, CircleDot, Package, ListChecks, Paperclip, Users,
  Check, Ban, Eye, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  marcarNegociacaoLida,
  obterContextoConvite,
  responderConviteAtendimento,
} from "@/features/atendimentos/actions/colaboracao";
import {
  ROTULO_STATUS_ATENDIMENTO,
  ROTULO_STATUS_CONVITE,
  rotuloCategoria,
} from "@/features/atendimentos/constants/atendimento";
import { rotuloValorCentavos } from "@/features/atendimentos/lib/valores";
import type { ContextoConviteDTO } from "@/features/atendimentos/queries/contexto-do-convite";
import type { ConviteAtendimentoDTO } from "@/features/atendimentos/queries/convites-do-atendimento";
import { useTempoReal } from "@/features/tempo-real/components/TempoRealProvider";
import { NegociacaoConvite } from "./NegociacaoConvite";

interface Props {
  open: boolean;
  onClose: () => void;
  convites: ConviteAtendimentoDTO[];
  /** Convite a abrir já expandido — vem do clique numa notificação. */
  conviteFocado?: string | null;
  /** Recarrega a caixa depois de responder ou negociar. */
  onRecarregar: () => void;
}

const ROTULO_PRIORIDADE: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/**
 * Caixa de convites — os recebidos e os enviados.
 *
 * Nasceu para quem foi convidado: enquanto o convite está pendente, o
 * Atendimento **não** aparece no quadro dessa pessoa, porque participação só
 * nasce do aceite, e sem esta tela não haveria por onde analisar e responder.
 *
 * Passou a listar também os enviados porque quem convida espera resposta do
 * mesmo jeito. Antes, o Ricardo respondia e a Ana não tinha onde ver: a
 * negociação ficava atrás do painel de participantes, um convite por vez.
 *
 * O recorte do Atendimento continua sendo o que o servidor monta em
 * `obterContextoDoConvite` — e só para quem foi convidado. Identidade do
 * Cliente, Protocolo, conversas e arquivos ficam de fora até o aceite, e ficam
 * de fora no SQL, não na renderização.
 */
export const ConvitesRecebidosDialog = ({
  open, onClose, convites, conviteFocado, onRecarregar,
}: Props) => {
  const [abertoId, setAbertoId] = useState<string | null>(conviteFocado ?? null);
  const [lado, setLado] = useState<"recebidos" | "enviados">("recebidos");
  const [contexto, setContexto] = useState<ContextoConviteDTO | null>(null);
  const [carregandoContexto, setCarregandoContexto] = useState(false);
  const { registrarContextoAtivo, assinarConvite } = useTempoReal();

  /**
   * Negociação aberta é contexto ativo.
   *
   * Enquanto a pessoa está lendo aquela negociação, a resposta da outra ponta
   * entra na lista sozinha e nenhum toast é mostrado — avisar sobre algo que
   * está na tela seria ruído. Fechada a caixa, o aviso volta a ser útil.
   */
  useEffect(() => {
    if (!open || !abertoId) {
      assinarConvite(null);
      return;
    }
    assinarConvite(abertoId);
    const convite = convites.find((item) => item.id === abertoId);
    registrarContextoAtivo(
      convite
        ? {
            atendimentoId: convite.atendimentoId,
            aba: "info",
            canalConversa: "cliente",
            conviteId: abertoId,
          }
        : null,
    );
    return () => {
      assinarConvite(null);
      registrarContextoAtivo(null);
    };
  }, [open, abertoId, convites, assinarConvite, registrarContextoAtivo]);
  const [respondendo, iniciarTransicao] = useTransition();

  const carregarContexto = useCallback(async (conviteId: string) => {
    setCarregandoContexto(true);
    const resultado = await obterContextoConvite({ conviteId });
    setCarregandoContexto(false);
    setContexto(resultado.sucesso && resultado.dados ? resultado.dados : null);
  }, []);

  /**
   * O contexto é buscado ao abrir um convite, e só então.
   *
   * Carregar os oito recortes de todos os convites de uma vez seria pedir ao
   * banco o que ninguém vai ler: quem tem cinco convites analisa um de cada
   * vez. Fechar o convite limpa o contexto no próprio manipulador do clique, e
   * não aqui — o efeito existe para buscar dados, não para zerar estado.
   */
  useEffect(() => {
    if (!abertoId) return;
    const convite = convites.find((item) => item.id === abertoId);
    startTransition(async () => {
      // O recorte limitado existe para quem está decidindo se aceita. Quem
      // enviou o convite já enxerga o Atendimento inteiro pelo quadro.
      if (convite?.papel === "destinatario") await carregarContexto(abertoId);
      // Abrir a negociação é o gesto de leitura: a marca avança no servidor e
      // as notificações daquele convite deixam de estar pendentes.
      if (convite && convite.naoLidas > 0) {
        const resultado = await marcarNegociacaoLida({ conviteId: abertoId });
        if (resultado.sucesso) onRecarregar();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertoId, carregarContexto]);

  if (!open) return null;

  function responder(conviteId: string, resposta: "aceitar" | "recusar") {
    if (respondendo) return;
    iniciarTransicao(async () => {
      const resultado = await responderConviteAtendimento({ conviteId, resposta });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      setAbertoId(null);
      onRecarregar();
    });
  }

  const doLado = convites.filter((c) =>
    lado === "recebidos"
      ? c.papel === "destinatario"
      : c.papel === "remetente",
  );
  // O que pede ação vem primeiro: convite por responder, resposta não lida,
  // contraproposta esperando decisão.
  const pedemAcao = doLado.filter(
    (c) =>
      (c.status === "pendente" && c.papel === "destinatario") ||
      c.naoLidas > 0 ||
      c.aguardandoDecisao,
  );
  const demais = doLado.filter((c) => !pedemAcao.includes(c));
  const contar = (papel: "destinatario" | "remetente") =>
    convites.filter(
      (c) =>
        c.papel === papel &&
        ((c.status === "pendente" && papel === "destinatario") ||
          c.naoLidas > 0 ||
          c.aguardandoDecisao),
    ).length;

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
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <Inbox className="h-4 w-4" />
              Convites de colaboração
            </h2>
            <p className="text-xs text-muted-foreground">
              Analise o atendimento e negocie antes de aceitar.
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

        {/* Mesmo padrão de abas do painel de Atendimento — nenhum controle
            novo, só o lado da mesa. O número ao lado é o que pede ação. */}
        <div className="scrollbar-thin flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3">
          {([
            { id: "recebidos", label: "Recebidos", total: contar("destinatario") },
            { id: "enviados", label: "Enviados", total: contar("remetente") },
          ] as const).map(({ id, label, total }) => (
            <button
              key={id}
              onClick={() => setLado(id)}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-2.5 py-3 text-sm font-medium transition-colors",
                lado === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {total > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {total}
                </span>
              )}
              {lado === id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {doLado.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
              {lado === "recebidos"
                ? "Você não recebeu convites de colaboração."
                : "Você ainda não enviou convites de colaboração."}
            </p>
          )}

          {[...pedemAcao, ...demais].map((convite) => {
            const aberto = abertoId === convite.id;
            return (
              <div
                key={convite.id}
                className={cn(
                  "rounded-xl border border-border bg-background p-3",
                  convite.status === "pendente" && "border-primary/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {convite.papel === "destinatario"
                          ? `Convite de ${convite.remetente.nome}`
                          : `Convite para ${convite.destinatario.nome}`}
                      </span>
                      {/* Mesma pílula vermelha dos cards: não lida é não lida,
                          em qualquer lugar da plataforma. */}
                      {convite.naoLidas > 0 && (
                        <span className="rounded-full bg-priority-high px-1.5 py-0 text-[10px] font-semibold text-white">
                          {convite.naoLidas}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {convite.protocoloRotulo ? `${convite.protocoloRotulo} · ` : ""}
                      {ROTULO_STATUS_CONVITE[convite.status]}
                      {" · "}
                      {rotuloValorCentavos(
                        convite.valorAcordadoCentavos ?? convite.valorOferecidoCentavos,
                        "sem valor definido",
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setContexto(null);
                      setAbertoId(aberto ? null : convite.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {aberto ? "Fechar" : "Analisar"}
                  </Button>
                </div>

                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {convite.escopo}
                </p>

                {aberto && (
                  <div className="mt-3 space-y-4 border-t border-border pt-3">
                    {convite.papel === "remetente" ? null : carregandoContexto ? (
                      <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : contexto ? (
                      <div className="space-y-2">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          O atendimento
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <Celula icon={Package} rotulo="Serviço" valor={contexto.servico ?? contexto.titulo} />
                          <Celula icon={Tag} rotulo="Categoria" valor={rotuloCategoria(contexto.categoria)} />
                          <Celula icon={CircleDot} rotulo="Status" valor={ROTULO_STATUS_ATENDIMENTO[contexto.status]} />
                          <Celula
                            icon={Calendar}
                            rotulo="Prazo"
                            valor={
                              contexto.prazoEm
                                ? new Date(contexto.prazoEm).toLocaleDateString("pt-BR")
                                : "Sem prazo definido"
                            }
                          />
                          <Celula
                            icon={ListChecks}
                            rotulo="Checklist"
                            valor={`${contexto.totalEtapasConcluidas}/${contexto.totalEtapasChecklist} etapas`}
                          />
                          <Celula
                            icon={Paperclip}
                            rotulo="Arquivos"
                            valor={`${contexto.totalArquivos}`}
                          />
                          <Celula
                            icon={Users}
                            rotulo="Participantes"
                            valor={`${contexto.totalParticipantes}`}
                          />
                          <Celula
                            icon={CircleDot}
                            rotulo="Prioridade"
                            valor={ROTULO_PRIORIDADE[contexto.prioridade] ?? contexto.prioridade}
                          />
                        </div>
                        {/* Dito na tela, e não só implementado: o convidado
                            precisa saber que está decidindo com dados parciais. */}
                        <p className="text-[11px] text-muted-foreground">
                          Protocolo <span className="font-mono">{contexto.protocolo}</span>
                          {" · cliente "}
                          {contexto.clienteIniciais}. A identidade do cliente, o
                          protocolo e as conversas só ficam visíveis depois do
                          aceite.
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Não foi possível carregar o contexto deste convite.
                      </p>
                    )}

                    <div>
                      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Negociação privada
                      </h4>
                      <NegociacaoConvite convite={convite} onAtualizar={onRecarregar} />
                    </div>

                    {convite.status === "pendente" &&
                      convite.papel === "destinatario" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          className="gap-1.5"
                          disabled={respondendo}
                          onClick={() => responder(convite.id, "aceitar")}
                        >
                          <Check className="h-4 w-4" />
                          Aceitar por{" "}
                          {rotuloValorCentavos(
                            convite.valorOferecidoCentavos,
                            "sem valor",
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                          disabled={respondendo}
                          onClick={() => responder(convite.id, "recusar")}
                        >
                          <Ban className="h-4 w-4" />
                          Recusar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-card/40 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            Aceitar vale o valor oferecido que está valendo agora.
          </span>
          <Button size="sm" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </footer>
      </div>
    </div>
  );
};

const Celula = ({
  icon: Icon, rotulo, valor,
}: {
  icon: React.ElementType;
  rotulo: string;
  valor: string;
}) => (
  <div className="rounded-lg border border-border bg-card p-2.5">
    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3" />
      {rotulo}
    </div>
    <div className="truncate text-sm font-medium text-foreground">{valor}</div>
  </div>
);
