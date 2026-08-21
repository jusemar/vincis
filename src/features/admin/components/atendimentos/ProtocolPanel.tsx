"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { anexarArquivoAoAtendimento } from "@/features/atendimentos/actions/anexar-arquivo";
import {
  adicionarEtapaChecklist,
  alternarEtapaChecklist,
  removerEtapaChecklist,
  reordenarEtapasChecklist,
  solicitarAoClienteAtendimento,
} from "@/features/atendimentos/actions/checklist";
import { marcarAbaVista, marcarConversaLida } from "@/features/atendimentos/actions/leitura";
import {
  alterarStatusAtendimento,
  definirPrazoAtendimento,
  definirPrioridadeAtendimento,
  enviarMensagemAtendimento,
  publicarManifestacao,
} from "@/features/atendimentos/actions/operacao";
import {
  X, Paperclip, Lock, Users, Send, ChevronUp, Trash2,
  Download, FileText, Image as ImageIcon, FileSpreadsheet, CheckSquare, Square,
  Calendar, UserCircle2, Tag, AlertTriangle, ChevronDown, Plus, Smile,
  Hash, CircleDot, Package, Wallet, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "./AvatarStack";
import { ConcluirAtendimentoDialog } from "./ConcluirAtendimentoDialog";
import { AccessBadge, CategoryBadge, PriorityDot, StatusBadge } from "./badges";
import { ParticipantesDialog } from "./ParticipantesDialog";
import { SolicitacaoDeAjusteCard } from "./SolicitacaoDeAjusteCard";
import { useRolagemDaConversa } from "@/features/atendimentos/hooks/useRolagemDaConversa";
import { useTempoReal } from "@/features/tempo-real/components/TempoRealProvider";
import type { FocoDoPainel, Protocol, RealChecklistItem } from "../../types/atendimentos";

type Tab = "protocolo" | "conversa" | "arquivos" | "historico" | "info";

interface Msg {
  id: string;
  author: string;
  initials: string;
  color: string;
  time: string;
  text: string;
  internal: boolean;
  me?: boolean;
  attachment?: { name: string; size?: string };
}

/** Mesmas três prioridades do domínio, com os rótulos da tela. */
const PRIORIDADES = [
  { id: "alta", label: "Alta" },
  { id: "media", label: "Média" },
  { id: "baixa", label: "Baixa" },
] as const;

interface Props {
  protocol: Protocol;
  onClose: () => void;
  /**
   * Destino pedido por quem abriu o painel.
   *
   * Vem do clique na pílula vermelha ou de uma notificação. Aplicado uma vez,
   * na abertura: depois disso a pessoa navega livremente pelas abas.
   */
  foco?: FocoDoPainel | null;
  onFocoAplicado?: () => void;
  /** Recarrega os dados do servidor depois de uma ação real. */
  onAtualizar?: () => void;
}

export const ProtocolPanel = ({
  protocol, onClose, foco, onFocoAplicado, onAtualizar,
}: Props) => {
  // O Protocolo é o registro formal do atendimento: quando existe manifestação,
  // é ele que abre; sem manifestação nenhuma, a Conversa.
  const [tab, setTab] = useState<Tab>(
    // Um destino pedido ganha da regra padrão: quem clicou na pílula vermelha
    // quer a Conversa, mesmo que exista Protocolo registrado.
    foco?.aba ??
      ((protocol.real?.manifestations.length ?? 0) > 0
        ? "protocolo"
        : "conversa"),
  );
  const [internal, setInternal] = useState(foco?.canal === "interno");
  /** Mensagem a destacar e para a qual rolar, quando veio um foco. */
  const [mensagemAlvo, setMensagemAlvo] = useState<string | null>(
    foco?.mensagemId ?? null,
  );
  /**
   * Pedido formal em curso.
   *
   * "Solicitar ao cliente" não é só mudar o status: é registrar no Protocolo o
   * que está sendo pedido. Por isso a escolha no menu abre o Protocolo em modo
   * de solicitação em vez de mover o Atendimento na hora — quem move é o envio
   * do pedido, junto com ele.
   */
  const [solicitando, setSolicitando] = useState(false);
  /**
   * Conclusão em curso.
   *
   * Mesma ideia da solicitação: "Concluir" não é uma troca de status como as
   * outras — é uma entrega. O item do menu abre o diálogo em vez de encerrar o
   * Atendimento na hora, e quem encerra é a confirmação lá dentro.
   */
  const [concluindo, setConcluindo] = useState(false);
  const [draft, setDraft] = useState("");
  /** Gestão de participantes — o `+` ao lado dos avatares. */
  const [participantesAberto, setParticipantesAberto] = useState(false);
  const [processando, iniciarTransicao] = useTransition();

  const real = protocol.real;
  const { registrarContextoAtivo, assinarAtendimento } = useTempoReal();

  /**
   * Diz ao tempo real o que está aberto na tela.
   *
   * É o que separa "a mensagem apareceu sozinha" de "um toast avisou": estando
   * na Conversa do canal certo, a novidade entra na lista e nenhum aviso é
   * mostrado. Assinar o canal do Atendimento garante que isso vale mesmo
   * quando o aviso pessoal não é dirigido a esta pessoa.
   */
  useEffect(() => {
    if (!real) return;
    assinarAtendimento(real.atendimentoId);
    registrarContextoAtivo({
      atendimentoId: real.atendimentoId,
      aba: tab,
      canalConversa: internal ? "interno" : "cliente",
    });
    return () => {
      assinarAtendimento(null);
      registrarContextoAtivo(null);
    };
  }, [
    real,
    tab,
    internal,
    assinarAtendimento,
    registrarContextoAtivo,
  ]);

  // O foco é consumido assim que o painel monta com ele. Avisar o pai evita
  // que reabrir o mesmo card depois volte a pular para a mensagem antiga.
  useEffect(() => {
    if (foco) onFocoAplicado?.();
    // Só na montagem: o `key` por atendimento já recria o painel a cada card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Abrir a aba resolve o aviso correspondente.
   *
   * Conversa registra leitura de verdade (marca-d'água por canal); Protocolo,
   * Arquivos e Histórico apenas silenciam a notificação daquele assunto — ver a
   * aba é ter visto o que chegou.
   */
  useEffect(() => {
    if (!real) return;
    if (tab === "conversa") {
      void marcarConversaLida({
        atendimentoId: real.atendimentoId,
        canal: internal ? "interno" : "cliente",
      }).then((resultado) => {
        // Recarrega só quando havia algo por ler: um refresh a cada troca de
        // aba faria a tela piscar sem motivo.
        const pendentes = internal ? real.unread.interno : real.unread.cliente;
        if (resultado.sucesso && pendentes > 0) onAtualizar?.();
      });
      return;
    }
    if (tab === "info") return;
    void marcarAbaVista({ atendimentoId: real.atendimentoId, aba: tab });
    // `real` muda de identidade a cada refresh do servidor; observar o id evita
    // um laço de marcação → refresh → marcação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, internal, real?.atendimentoId]);

  function mudarStatus(destino: string) {
    if (!real) return;
    if (destino === "aguardando_cliente") {
      // O pedido é registrado antes de o Atendimento parar: a ação
      // `solicitarAoClienteAtendimento` faz as duas coisas de uma vez.
      setTab("protocolo");
      setSolicitando(true);
      return;
    }
    if (destino === "concluido") {
      setConcluindo(true);
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await alterarStatusAtendimento({
        atendimentoId: real.atendimentoId,
        destino,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      onAtualizar?.();
    });
  }

  /**
   * Prioridade é decisão da equipe.
   *
   * O menu só existe nos atendimentos reais, e o servidor confere de novo quem
   * está pedindo: o Cliente é recusado lá, não aqui.
   */
  function mudarPrioridade(prioridade: string) {
    if (!real || prioridade === protocol.priority) return;
    iniciarTransicao(async () => {
      const resultado = await definirPrioridadeAtendimento({
        atendimentoId: real.atendimentoId,
        prioridade,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      onAtualizar?.();
    });
  }

  return (
    // `max-h` de viewport com o corpo em `overflow-hidden`: o cabeçalho e as
    // abas ficam fixos e só o conteúdo rola. Sem isso o painel crescia com o
    // conteúdo e o composer saía por baixo da tela.
    <aside className="flex h-full max-h-[100dvh] w-full max-w-[480px] flex-col border-l border-border bg-card shadow-panel">
      <div className="shrink-0 border-b border-border p-5">
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
            aria-label="Fechar painel"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mesmo badge de sempre; nos atendimentos reais o chevron passou a
              abrir as transições que a máquina de estados permite. */}
          {real && real.actions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={processando}>
                <button className="inline-flex items-center gap-1" aria-label="Alterar status">
                  <StatusBadge status={protocol.status} />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {real.actions.map((acao) => (
                  <DropdownMenuItem
                    key={acao.destino}
                    onSelect={() => mudarStatus(acao.destino)}
                    className={cn(acao.encerra && "text-destructive focus:text-destructive")}
                  >
                    {acao.rotulo}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button className="inline-flex items-center gap-1">
              <StatusBadge status={protocol.status} />
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {real ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={processando}>
                <button className="inline-flex items-center gap-1" aria-label="Alterar prioridade">
                  <PriorityDot priority={protocol.priority} />
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {PRIORIDADES.map((opcao) => (
                  <DropdownMenuItem
                    key={opcao.id}
                    onSelect={() => mudarPrioridade(opcao.id)}
                  >
                    Prioridade {opcao.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <PriorityDot priority={protocol.priority} />
          )}
          <span className="text-muted-foreground">·</span>
          <AccessBadge access={protocol.access} />
          <div className="ml-auto flex items-center gap-2">
            <AvatarStack users={protocol.assignees} max={4} size="md" />
            {/* O `+` sempre esteve aqui e não fazia nada. Agora abre a gestão
                de participantes — atribuição direta de quem é da equipe e
                convite para quem é de fora. Nos cards de demonstração ele
                continua inerte: não há atendimento real para compor. */}
            <button
              onClick={() => real && setParticipantesAberto(true)}
              disabled={!real}
              aria-label="Gerenciar participantes"
              title={
                real
                  ? "Gerenciar participantes"
                  : "Card de demonstração: sem participantes reais"
              }
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/*
        As cinco abas precisam caber nos 480px do painel. Com ícone e rótulo
        juntos elas somavam mais que a largura disponível e a última — sempre
        Informações — ficava fora da tela. O ícone saiu daqui (continua em cada
        conteúdo) e as cinco passam a caber inteiras em notebook. Em painéis
        ainda mais estreitos, como no celular, a faixa rola na horizontal:
        nenhuma aba fica escondida em nenhuma largura.
      */}
      <div className="scrollbar-thin flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 sm:gap-1">
        {[
          { id: "protocolo", label: "Protocolo" },
          { id: "conversa", label: "Conversa" },
          { id: "arquivos", label: "Arquivos" },
          { id: "historico", label: "Histórico" },
          { id: "info", label: "Informações" },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={cn(
              "relative inline-flex shrink-0 items-center whitespace-nowrap px-2 py-3 text-sm font-medium transition-colors sm:px-2.5",
              tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* `min-h-0` é o que permite o conteúdo encolher dentro do painel: sem
          isso o flex adota a altura do conteúdo e empurra o composer para fora
          da tela. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "protocolo" && (
          <ProtocolTab
            protocol={protocol}
            onAtualizar={onAtualizar}
            solicitando={solicitando}
            onEncerrarSolicitacao={() => setSolicitando(false)}
          />
        )}
        {tab === "conversa" && (
          <ConversationTab
            internal={internal}
            setInternal={setInternal}
            draft={draft}
            setDraft={setDraft}
            protocol={protocol}
            mensagemAlvo={mensagemAlvo}
            onAlvoAlcancado={() => setMensagemAlvo(null)}
            onAtualizar={onAtualizar}
          />
        )}
        {tab === "arquivos" && (
          <FilesTab protocol={protocol} onAtualizar={onAtualizar} />
        )}
        {tab === "historico" && <TimelineTab protocol={protocol} />}
        {tab === "info" && (
          <InfoTab
            protocol={protocol}
            onAtualizar={onAtualizar}
          />
        )}
      </div>

      {real && (
        <ConcluirAtendimentoDialog
          open={concluindo}
          onClose={() => setConcluindo(false)}
          atendimentoId={real.atendimentoId}
          protocolo={real.info.protocol}
          arquivos={real.files}
          checklist={real.checklist}
          onAtualizar={onAtualizar}
        />
      )}

      {real && (
        <ParticipantesDialog
          open={participantesAberto}
          onClose={() => setParticipantesAberto(false)}
          atendimentoId={real.atendimentoId}
          protocolo={real.info.protocol}
          participantes={protocol.assignees}
          responsavelId={real.info.responsibleId}
          onAtualizar={onAtualizar}
        />
      )}
    </aside>
  );
};

/**
 * Protocolo — o registro formal do Atendimento.
 *
 * Não compartilha nenhum dado com a Conversa: o que está aqui nunca aparece lá,
 * e o que é dito lá nunca entra aqui. A lista já chega recortada do servidor —
 * cada participante recebe as manifestações do Cliente e apenas as respostas
 * que ele mesmo escreveu.
 */
const ProtocolTab = ({
  protocol, onAtualizar, solicitando, onEncerrarSolicitacao,
}: {
  protocol: Protocol;
  onAtualizar?: () => void;
  /** O composer está escrevendo um pedido formal ao Cliente. */
  solicitando?: boolean;
  onEncerrarSolicitacao?: () => void;
}) => {
  const real = protocol.real;
  const [texto, setTexto] = useState("");
  const [virarEtapa, setVirarEtapa] = useState(true);
  const [enviando, iniciarTransicao] = useTransition();
  const manifestacoes = real?.manifestations ?? [];

  /**
   * Envia o pedido formal.
   *
   * Registra a solicitação no Protocolo, cria a etapa correspondente no
   * checklist (quando marcado) e move o Atendimento para "Aguardando cliente" —
   * tudo numa ação só, no servidor.
   */
  function solicitar() {
    if (!real || !texto.trim() || enviando) return;
    const conteudo = texto;
    iniciarTransicao(async () => {
      const resultado = await solicitarAoClienteAtendimento({
        atendimentoId: real.atendimentoId,
        conteudo,
        // A etapa nasce com o texto do pedido: é o que a equipe vai conferir
        // depois, e o que o Cliente acompanha como pendência.
        etapaChecklist: virarEtapa ? conteudo.slice(0, 160) : null,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      setTexto("");
      toast.success(resultado.mensagem);
      onEncerrarSolicitacao?.();
      onAtualizar?.();
    });
  }

  function publicar() {
    if (!real || !texto.trim() || enviando) return;
    const conteudo = texto;
    iniciarTransicao(async () => {
      const resultado = await publicarManifestacao({
        atendimentoId: real.atendimentoId,
        conteudo,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      setTexto("");
      toast.success(resultado.mensagem);
      onAtualizar?.();
    });
  }

  return (
    <>
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
        {/*
          Solicitação de ajuste do Cliente, no topo do Protocolo.
          Fica antes das manifestações porque é o que precisa de decisão: o
          resto do registro formal continua abaixo, na ordem cronológica de
          sempre. Sem solicitação, nada é desenhado aqui.
        */}
        {real?.adjustment && (
          <SolicitacaoDeAjusteCard
            adjustment={real.adjustment}
            onAtualizar={onAtualizar}
          />
        )}
        {!real ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Card de demonstração: sem protocolo registrado.
          </p>
        ) : manifestacoes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            Nenhuma manifestação registrada neste protocolo.
          </p>
        ) : (
          manifestacoes.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {m.fromClient ? "Manifestação do cliente" : "Resposta"}
                <span className="h-px flex-1 bg-border" />
              </div>
              <MessageBubble
                msg={{
                  id: m.id,
                  author: m.author,
                  initials: m.initials,
                  color: m.color,
                  time: m.time,
                  text: m.text,
                  internal: false,
                  me: m.me,
                  attachment: m.attachment ?? undefined,
                }}
                internal={false}
              />
            </div>
          ))
        )}
      </div>

      <div className="pb-safe-3 border-t border-border bg-card px-3 pt-3">
        <div className="rounded-xl border border-border bg-background transition-colors">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              solicitando
                ? "Descreva o que o cliente precisa enviar…"
                : "Escreva a resposta ao cliente…"
            }
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
            rows={2}
          />
          {solicitando && (
            <label className="flex cursor-pointer items-center gap-2 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={virarEtapa}
                onChange={(e) => setVirarEtapa(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Criar etapa no checklist para acompanhar esta pendência
            </label>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5">
            <span className="px-1.5 text-[11px] text-muted-foreground">
              {solicitando
                ? "O atendimento passa para Aguardando cliente."
                : "O cliente vê todas as respostas do protocolo."}
            </span>
            <div className="flex items-center gap-1">
              {solicitando && (
                <Button size="sm" variant="ghost" onClick={onEncerrarSolicitacao}>
                  Cancelar
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5"
                onClick={solicitando ? solicitar : publicar}
                disabled={enviando || !real || !texto.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                {enviando
                  ? "Enviando…"
                  : solicitando
                    ? "Solicitar"
                    : "Responder"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const ConversationTab = ({
  internal, setInternal, draft, setDraft, protocol, mensagemAlvo,
  onAlvoAlcancado, onAtualizar,
}: {
  internal: boolean;
  setInternal: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
  protocol: Protocol;
  /** Mensagem para a qual rolar ao abrir, vinda da pílula ou de um aviso. */
  mensagemAlvo?: string | null;
  onAlvoAlcancado?: () => void;
  onAtualizar?: () => void;
}) => {
  const real = Boolean(protocol.real);
  const alvoRef = useRef<HTMLDivElement | null>(null);

  /**
   * Rola até a primeira mensagem não lida.
   *
   * `block: "center"` em vez de "start": a mensagem alvo costuma vir precedida
   * de contexto, e encostá-la no topo esconderia o que veio antes. O destaque
   * some depois de a rolagem acontecer — ele serve para achar a mensagem, não
   * para marcá-la permanentemente.
   */
  useEffect(() => {
    if (!mensagemAlvo || !alvoRef.current) return;
    alvoRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    const relogio = setTimeout(() => onAlvoAlcancado?.(), 2000);
    return () => clearTimeout(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagemAlvo]);
  const [enviando, iniciarTransicao] = useTransition();
  // Conversa real do canal escolhido. Nada é preenchido: se ninguém escreveu,
  // a lista fica vazia.
  const mensagensReais = (protocol.real?.messages ?? []).filter(
    (m) => m.internal === internal,
  );
  const ultima = mensagensReais.at(-1) ?? null;

  /**
   * Rolagem da Conversa.
   *
   * Mesmo hook do portal do Cliente: os dois chats acompanham a mensagem nova
   * quando a pessoa está no fim, respeitam quem subiu para ler o histórico e
   * sempre mostram o que a própria pessoa acabou de enviar.
   *
   * `focoEmNaoLida` é a ponte com o comportamento que já existia: enquanto o
   * clique no badge vermelho estiver levando alguém até a primeira não lida,
   * a rolagem automática fica calada — do contrário ela empurraria a pessoa
   * para o fim no instante seguinte, desfazendo o que ela pediu.
   */
  const { refLista, temNovaMensagem, irParaOFim } = useRolagemDaConversa({
    chave: `${protocol.real?.atendimentoId ?? protocol.id}:${internal ? "interno" : "cliente"}`,
    quantidade: mensagensReais.length,
    idDaUltima: ultima?.id ?? null,
    ultimaEhMinha: Boolean(ultima?.me),
    focoEmNaoLida: Boolean(mensagemAlvo),
  });

  function enviar() {
    if (!real || !protocol.real || !draft.trim() || enviando) return;
    const conteudo = draft;
    iniciarTransicao(async () => {
      const resultado = await enviarMensagemAtendimento({
        atendimentoId: protocol.real!.atendimentoId,
        escopo: internal ? "interno" : "cliente",
        conteudo,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      setDraft("");
      onAtualizar?.();
    });
  }

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

      {/* Wrapper só para posicionar o aviso de mensagem nova; ele não muda o
          empilhamento nem o espaçamento da conversa. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={refLista}
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
        {mensagensReais.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {internal
              ? "Nenhuma nota interna neste atendimento."
              : "Nenhuma mensagem trocada com o cliente ainda."}
          </div>
        ) : (
          mensagensReais.map((m) => (
              <div
                key={m.id}
                ref={m.id === mensagemAlvo ? alvoRef : undefined}
                className={cn(
                  "rounded-xl transition-colors",
                  m.id === mensagemAlvo && "bg-primary/5 ring-1 ring-primary/30",
                )}
              >
                <MessageBubble
                  msg={{
                    id: m.id,
                    author: m.author,
                    initials: m.initials,
                    color: m.color,
                    time: m.time,
                    text: m.text,
                    internal: m.internal,
                    me: m.me,
                  }}
                  internal={internal}
                />
              </div>
          ))
        )}
      </div>

      {temNovaMensagem && (
        <button
          type="button"
          onClick={() => irParaOFim("smooth")}
          className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Nova mensagem
        </button>
      )}
      </div>

      <div className="pb-safe-3 border-t border-border bg-card px-3 pt-3">
        <div
          className={cn(
            "rounded-xl border bg-background transition-colors",
            internal ? "border-amber-200 bg-amber-50/40" : "border-border",
          )}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter envia, Shift+Enter quebra linha — comportamento que já se
              // espera de um campo de conversa.
              if (e.key === "Enter" && !e.shiftKey && real) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder={internal ? "Escreva uma nota interna…" : "Escreva para o cliente…"}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
            rows={2}
          />
          <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1 text-muted-foreground">
              <button aria-label="Anexar arquivo" className="alvo-toque flex items-center justify-center rounded-md p-1.5 hover:bg-muted hover:text-foreground"><Paperclip className="h-4 w-4" /></button>
              <button aria-label="Inserir emoji" className="alvo-toque flex items-center justify-center rounded-md p-1.5 hover:bg-muted hover:text-foreground"><Smile className="h-4 w-4" /></button>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={enviar}
              disabled={enviando || (real && !draft.trim())}
            >
              <Send className="h-3.5 w-3.5" />
              {enviando ? "Enviando…" : "Enviar"}
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
                {msg.attachment.size && (
                  <div className="text-[10px] text-muted-foreground">{msg.attachment.size}</div>
                )}
              </div>
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Ícone do arquivo real, a partir do tipo já traduzido pelo servidor. */
const iconeDoTipo = (tipo: string) => {
  if (tipo === "Imagem") return ImageIcon;
  if (tipo === "Planilha") return FileSpreadsheet;
  return FileText;
};

const FilesTab = ({
  protocol, onAtualizar,
}: {
  protocol: Protocol;
  onAtualizar?: () => void;
}) => {
  // Para o atendimento real valem os arquivos dele — inclusive quando não há
  // nenhum. Os mockados continuam com a lista mockada.
  const real = Boolean(protocol.real);
  const arquivos = protocol.real?.files ?? [];
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, iniciarTransicao] = useTransition();

  function anexar(arquivo: File | undefined) {
    if (!arquivo || !protocol.real) return;
    const dados = new FormData();
    dados.set("atendimentoId", protocol.real.atendimentoId);
    dados.set("arquivo", arquivo);
    iniciarTransicao(async () => {
      const resultado = await anexarArquivoAoAtendimento(dados);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      onAtualizar?.();
    });
  }

  return (
    <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-5">
      {/* Conclusão registrada: a mesma informação que o Cliente lê, no lugar
          onde a entrega está. Reusa o par de cores de "Concluído" que os badges
          de status já usam — nenhuma cor nova. */}
      {protocol.real?.conclusion && (
        <div className="mb-3 rounded-lg border border-status-done/30 bg-status-done-bg p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckSquare className="h-4 w-4 shrink-0" />
            Atendimento concluído
          </div>
          <p className="mt-1 text-xs text-emerald-900/80">
            {protocol.real.conclusion.atLabel}
            {protocol.real.conclusion.byName
              ? ` · por ${protocol.real.conclusion.byName}`
              : ""}
            {protocol.real.conclusion.filesCount > 0
              ? ` · ${protocol.real.conclusion.filesCount} arquivo${
                  protocol.real.conclusion.filesCount > 1 ? "s" : ""
                } de entrega`
              : " · sem entrega documental"}
          </p>
          {protocol.real.conclusion.note && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">
              {protocol.real.conclusion.note}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Arquivos do protocolo</h4>
        {/* Mesmo botão de sempre; nos reais ele abre o seletor de arquivo e
            envia pelo mesmo caminho autorizado que o Cliente usa. */}
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={enviando}
          onClick={() => real && entrada.current?.click()}
        >
          <Plus className="h-3.5 w-3.5" /> {enviando ? "Enviando…" : "Anexar"}
        </Button>
        <input
          ref={entrada}
          type="file"
          className="hidden"
          accept=".txt,.pdf,.jpg,.jpeg,.png"
          onChange={(e) => {
            anexar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {arquivos.map((f) => {
        const Icon = iconeDoTipo(f.typeLabel);
        return (
              <a
                key={f.id}
                href={f.url}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-status-progress-bg text-status-progress">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{f.name}</span>
                    {f.isDelivery && (
                      <span className="shrink-0 rounded-md bg-status-done-bg px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                        Entrega final
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {f.typeLabel} · {f.sizeLabel} · {f.dateLabel} · {f.senderLabel}
                  </div>
                </div>
                <span className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Download className="h-4 w-4" />
                </span>
              </a>
        );
      })}

      {arquivos.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Nenhum arquivo anexado a este atendimento.
        </p>
      )}
    </div>
  );
};

const TimelineTab = ({ protocol }: { protocol: Protocol }) => {
  // Histórico do Atendimento: só eventos que aconteceram de fato, com data
  // real. Comunicado institucional não entra aqui — esta é a trilha de **um**
  // protocolo, e misturar mural com auditoria estragaria as duas leituras.
  const eventos = (protocol.real?.events ?? []).map((e) => ({
    text: e.text,
    time: e.time,
  }));

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
      <div className="relative space-y-5 border-l border-border pl-5">
        {eventos.map((t, i) => (
          <div key={i} className="relative">
            <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
            <p className="text-sm text-foreground">{t.text}</p>
            <p className="text-xs text-muted-foreground">{t.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const InfoTab = ({
  protocol, onAtualizar,
}: {
  protocol: Protocol;
  onAtualizar?: () => void;
}) => {
  const real = protocol.real;

  return (
  <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto p-5">
    <div className="grid grid-cols-2 gap-3">
      <InfoCell icon={UserCircle2} label="Cliente" value={protocol.client} />
      <InfoCell icon={Tag} label="Categoria" value={protocol.category} />
      <InfoCell icon={Calendar} label="Prazo" value={protocol.deadlineLabel} />
      <InfoCell icon={AlertTriangle} label="Prioridade" value={
        protocol.priority === "alta" ? "Alta" : protocol.priority === "media" ? "Média" : "Baixa"
      } />
    </div>

    {/* Dados que só existem quando há contratação real por trás do card. */}
    {real && (
      <div className="grid grid-cols-2 gap-3">
        <InfoCell icon={Hash} label="Protocolo" value={real.info.protocol} />
        <InfoCell icon={CircleDot} label="Status" value={real.info.statusLabel} />
        <InfoCell icon={Package} label="Serviço contratado" value={real.info.service} />
        <InfoCell icon={Wallet} label="Valor" value={real.info.priceLabel ?? "—"} />
        <InfoCell icon={Tag} label="Modelo de preço" value={real.info.priceModelLabel ?? "—"} />
        <InfoCell icon={Calendar} label="Contratado em" value={real.info.hiredAtLabel ?? "—"} />
        <InfoCell icon={UserCircle2} label="Responsável" value={real.info.responsibleName} />
        {/* Só existem depois da conclusão: sem ela as células não aparecem, em
            vez de mostrarem um travessão que pareceria dado faltando. */}
        {real.conclusion && (
          <>
            <InfoCell icon={Calendar} label="Concluído em" value={real.conclusion.atLabel} />
            <InfoCell
              icon={UserCircle2}
              label="Concluído por"
              value={real.conclusion.byName ?? "—"}
            />
          </>
        )}
        <PrazoEditavel
          atendimentoId={real.atendimentoId}
          prazoAtual={real.info.deadlineDate}
          rotuloAtual={real.info.deadlineLabel}
          onAtualizar={onAtualizar}
        />
      </div>
    )}

    {real?.conclusion?.note && (
      <div>
        <h4 className="mb-2 text-sm font-semibold">Observação final</h4>
        <p className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm text-foreground">
          {real.conclusion.note}
        </p>
      </div>
    )}

    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">SLA</h4>
        {!real && <span className="text-xs text-muted-foreground">62% utilizado</span>}
      </div>
      {real ? (
        // SLA ainda não existe no backend: melhor dizer isso do que desenhar
        // uma barra com um número que ninguém calculou.
        <p className="text-xs text-muted-foreground">SLA ainda não definido para este atendimento.</p>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-priority-medium" style={{ width: "62%" }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Resposta esperada em até 4h úteis</p>
        </>
      )}
    </div>

    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Checklist de documentos</h4>
        <span className="text-xs text-muted-foreground">
          {real
            ? `${real.checklist.filter((c) => c.done).length}/${real.checklist.length}`
            : "0/0"}
        </span>
      </div>
      {real && (
        <ChecklistReal
          atendimentoId={real.atendimentoId}
          itens={real.checklist}
          onAtualizar={onAtualizar}
        />
      )}
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
              {/* Só uma pessoa responde pelo Atendimento; as demais são
                  participantes. Antes a lista chamava todo mundo de
                  Responsável, o que deixou de ser aceitável agora que
                  participante é dado real. */}
              <div className="text-xs text-muted-foreground">
                {!real || a.id === real.info.responsibleId
                  ? "Responsável"
                  : "Participante"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};

/**
 * Checklist real do Atendimento.
 *
 * Usa a mesma linha do checklist mockado — quadradinho, texto riscado quando
 * concluído — e acrescenta o que só o dado real permite: marcar de verdade,
 * acrescentar etapa, subir a etapa na ordem e remover. Quem faz tudo isso é a
 * equipe; o servidor recusa a mesma ação vinda do Cliente.
 *
 * Etapa interna aparece marcada como tal: ela organiza o trabalho da equipe e
 * não é enviada ao portal do Cliente.
 */
const ChecklistReal = ({
  atendimentoId, itens, onAtualizar,
}: {
  atendimentoId: string;
  itens: RealChecklistItem[];
  onAtualizar?: () => void;
}) => {
  const [novaEtapa, setNovaEtapa] = useState("");
  const [interna, setInterna] = useState(false);
  const [processando, iniciarTransicao] = useTransition();

  function executar(acao: () => Promise<{ sucesso: boolean; mensagem: string }>) {
    if (processando) return;
    iniciarTransicao(async () => {
      const resultado = await acao();
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      onAtualizar?.();
    });
  }

  function subir(indice: number) {
    if (indice === 0) return;
    const ordem = itens.map((item) => item.id);
    [ordem[indice - 1], ordem[indice]] = [ordem[indice], ordem[indice - 1]];
    executar(() => reordenarEtapasChecklist({ atendimentoId, ordemDosItens: ordem }));
  }

  return (
    <div className="space-y-1">
      {itens.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma etapa neste checklist. Acrescente abaixo.
        </p>
      )}

      {itens.map((item, indice) => (
        <div
          key={item.id}
          className="group/etapa flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
        >
          <button
            onClick={() =>
              executar(() =>
                alternarEtapaChecklist({ itemId: item.id, concluido: !item.done }),
              )
            }
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {item.done ? (
              <CheckSquare className="h-4 w-4 shrink-0 text-status-done" />
            ) : (
              <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn("min-w-0 flex-1", item.done && "text-muted-foreground line-through")}>
              {item.label}
            </span>
          </button>
          {item.internal && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Interna
            </span>
          )}
          <button
            onClick={() => subir(indice)}
            disabled={indice === 0}
            aria-label="Subir etapa"
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground disabled:opacity-0 group-hover/etapa:opacity-100"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => executar(() => removerEtapaChecklist({ itemId: item.id }))}
            aria-label="Remover etapa"
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/etapa:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="mt-2 flex items-center gap-2">
        <input
          value={novaEtapa}
          onChange={(e) => setNovaEtapa(e.target.value)}
          placeholder="Nova etapa…"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={processando || !novaEtapa.trim()}
          onClick={() =>
            executar(async () => {
              const resultado = await adicionarEtapaChecklist({
                atendimentoId,
                titulo: novaEtapa,
                visibilidade: interna ? "interno" : "cliente",
              });
              if (resultado.sucesso) setNovaEtapa("");
              return resultado;
            })
          }
        >
          Adicionar
        </Button>
      </div>
      <label className="flex cursor-pointer items-center gap-2 px-1 pt-1 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={interna}
          onChange={(e) => setInterna(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary"
        />
        Etapa interna — o cliente não vê
      </label>
    </div>
  );
};

/**
 * Prazo operacional, editável pela equipe.
 *
 * Quem contrata não escolhe prazo: o catálogo dá o ponto de partida (dias
 * estimados do serviço) e daí em diante quem ajusta é quem executa. Sem prazo
 * gravado a célula diz "Sem prazo definido" em vez de inventar uma data.
 */
const PrazoEditavel = ({
  atendimentoId, prazoAtual, rotuloAtual, onAtualizar,
}: {
  atendimentoId: string;
  prazoAtual: string | null;
  rotuloAtual: string | null;
  onAtualizar?: () => void;
}) => {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(prazoAtual ?? "");
  const [salvando, iniciarTransicao] = useTransition();

  function salvar(novoPrazo: string | null) {
    iniciarTransicao(async () => {
      const resultado = await definirPrazoAtendimento({
        atendimentoId,
        prazoEm: novoPrazo,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      setEditando(false);
      onAtualizar?.();
    });
  }

  return (
    <div className="col-span-2 rounded-lg border border-border bg-background p-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Prazo acordado
        </span>
        <button
          onClick={() => setEditando((aberto) => !aberto)}
          className="font-medium text-primary transition-colors hover:underline"
        >
          {editando ? "Cancelar" : "Alterar"}
        </button>
      </div>
      {editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label="Novo prazo"
            className="h-8 rounded-md border border-border bg-background px-2 text-sm focus:border-ring focus:outline-none"
          />
          <Button size="sm" disabled={salvando || !valor} onClick={() => salvar(valor)}>
            Salvar
          </Button>
          {prazoAtual && (
            <Button
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={() => { setValor(""); salvar(null); }}
            >
              Limpar
            </Button>
          )}
        </div>
      ) : (
        <div className="text-sm font-medium text-foreground">
          {rotuloAtual ?? "Sem prazo definido"}
        </div>
      )}
    </div>
  );
};

const InfoCell = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
    <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-sm font-medium text-foreground">{value}</div>
  </div>
);