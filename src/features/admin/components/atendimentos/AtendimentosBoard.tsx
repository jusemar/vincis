import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, RefreshCw, SlidersHorizontal, Search, LayoutGrid, List, Star, Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { alterarStatusAtendimento } from "@/features/atendimentos/actions/operacao";
import { carregarConvitesRecebidos } from "@/features/atendimentos/actions/colaboracao";
import { contarPendenciasDeConvite } from "@/features/atendimentos/lib/pendencias-convite";
import type { ConviteAtendimentoDTO } from "@/features/atendimentos/queries/convites-do-atendimento";
import { useEventoRealtime } from "@/features/tempo-real/components/TempoRealProvider";
import { ConvitesRecebidosDialog } from "./ConvitesRecebidosDialog";
import { KanbanColumn } from "./KanbanColumn";
import { ProtocolCard } from "./ProtocolCard";
import { ProtocolList } from "./ProtocolList";
import { ProtocolPanel } from "./ProtocolPanel";
import { NewAtendimentoDialog } from "./NewAtendimentoDialog";
import { CATEGORIAS_BASE, FiltersPanel, EMPTY_FILTERS, STATUS } from "./FiltersPanel";
import type { Category, FiltersState, FocoDoPainel } from "../../types/atendimentos";
import { COLUMNS, STATUS_SEM_COLUNA } from "../../constants/atendimentos";
import { statusDoBanco } from "../../lib/atendimentos-reais";
import {
  contarIndicadores,
  filtrarProtocolos,
  paginar,
  TAMANHO_PAGINA_COLUNA,
  TAMANHO_PAGINA_LISTA,
} from "../../lib/filtro-atendimentos";
import type { Protocol, Status } from "../../types/atendimentos";

interface BoardProps {
  /**
   * Atendimentos reais vindos do banco, já no formato do card.
   *
   * Chegam prontos do servidor — a tela não busca nada e não formata data, o
   * que evita divergência entre o HTML renderizado e o do navegador.
   */
  atendimentosReais?: Protocol[];
  /** Sessão atual, usada pelo filtro "Meus". */
  usuarioId?: string;
}

export const AtendimentosBoard = ({
  atendimentosReais = [],
  usuarioId,
}: BoardProps) => {
  const router = useRouter();
  const parametros = useSearchParams();
  /**
   * Deep-link explícito: `?atendimento=#2026-0003` (ou o id).
   *
   * É a única forma de a tela abrir já com um Atendimento selecionado. Sem o
   * parâmetro, entrar em Atendimentos mostra o quadro inteiro e nada mais.
   */
  const deepLink = parametros.get("atendimento");
  /**
   * Destino vindo de uma notificação: `?aba=conversa&canal=cliente` ou
   * `?convite=<id>`.
   *
   * É como o clique no sino cai exatamente onde o aviso apontava, em vez de só
   * abrir a tela de Atendimentos e deixar a pessoa procurando.
   */
  const abaDoLink = parametros.get("aba");
  const canalDoLink = parametros.get("canal");
  const conviteDoLink = parametros.get("convite");
  /**
   * `?convites=1` — abre a caixa na lista, sem escolher um convite.
   *
   * É o destino do destaque do Dashboard quando há mais de um convite novo:
   * ali não existe "o convite", existe a caixa. Com um único convite novo o
   * destaque continua usando `?convite=<id>`, o mesmo endereço do sino.
   */
  const abrirCaixaDeConvites = parametros.get("convites") === "1";
  const [movendo, iniciarTransicao] = useTransition();

  /**
   * Fonte única da tela.
   *
   * Só Atendimentos reais, vindos do servidor já autorizados. Os nove cards de
   * demonstração que conviviam aqui foram removidos nesta etapa: além de terem
   * cumprido o papel de comparação visual, eles apareciam igualmente para toda
   * conta que abrisse a tela — inclusive para um convidado que só participa de
   * um protocolo, o que dava a impressão de vazamento de carteira alheia.
   */
  const protocols = atendimentosReais;

  // Nada selecionado ao abrir a tela: o painel lateral é consequência de um
  // clique, não o estado inicial. Só um deep-link explícito abre um Atendimento
  // direto, e ele é resolvido depois que os dados chegam.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [vista, setVista] = useState<"kanban" | "lista">("kanban");
  const [pagina, setPagina] = useState(1);
  /** Quantos cards cada coluna do quadro já revelou. */
  const [paginaDaColuna, setPaginaDaColuna] = useState<Record<string, number>>({});
  /**
   * Coluna visível no celular.
   *
   * Fora do desktop o quadro não mostra as cinco colunas lado a lado: elas
   * ficariam com ~60px cada e nenhum card seria legível. Em vez disso a pessoa
   * escolhe um status na faixa do topo e vê aquela coluna inteira, em lista
   * vertical de largura cheia. É o mesmo recorte de dados do quadro — só a
   * forma de apresentar muda.
   */
  const [statusMobile, setStatusMobile] = useState<Status>(COLUMNS[0].id);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [altaPrioridade, setAltaPrioridade] = useState(false);
  const [vencendoHoje, setVencendoHoje] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Convites de colaboração recebidos pela pessoa logada.
   *
   * Enquanto pendente, o convite não tem card no quadro — participação só
   * existe depois do aceite. Por isso a caixa vive no cabeçalho da tela, e não
   * numa coluna.
   */
  const [convites, setConvites] = useState<ConviteAtendimentoDTO[]>([]);
  const [convitesAberto, setConvitesAberto] = useState(false);
  /** Convite a abrir já expandido — usado pela navegação vinda do sino. */
  const [conviteFocado, setConviteFocado] = useState<string | null>(null);
  /**
   * Para onde o painel deve ir ao abrir.
   *
   * Nasce do clique na pílula vermelha e da navegação por notificação: sem
   * isto, abrir o Atendimento deixaria a pessoa procurando a mensagem que a
   * trouxe até ali.
   */
  const [foco, setFoco] = useState<FocoDoPainel | null>(null);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);

  useEffect(() => {
    if (!deepLink) return;
    const alvo = protocols.find(
      (p) => p.id === deepLink || p.number === deepLink,
    );
    if (!alvo) return;
    setActiveId(alvo.id);
    if (!abaDoLink) return;
    // O canal pedido manda; sem ele, cai no canal onde está a primeira não
    // lida, que é o que a notificação de conversa quer dizer.
    const canal =
      canalDoLink === "interno" || canalDoLink === "cliente"
        ? canalDoLink
        : (alvo.real?.unread.canalPrimeira ?? "cliente");
    setFoco({
      aba: abaDoLink as FocoDoPainel["aba"],
      canal,
      mensagemId:
        abaDoLink === "conversa"
          ? (alvo.real?.unread.primeiraNaoLidaId ?? null)
          : null,
    });
    // Só reage à chegada do parâmetro (ou dos dados que o resolvem): fechar o
    // painel depois disso não o reabre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink, abaDoLink, canalDoLink, protocols.length]);

  /** Notificação de negociação: abre a caixa de convites naquele convite. */
  useEffect(() => {
    if (!conviteDoLink) return;
    setConviteFocado(conviteDoLink);
    setConvitesAberto(true);
  }, [conviteDoLink]);

  /** Destaque do Dashboard com vários convites novos: abre só a caixa. */
  useEffect(() => {
    if (!abrirCaixaDeConvites) return;
    setConvitesAberto(true);
  }, [abrirCaixaDeConvites]);

  /**
   * Virada do dia.
   *
   * "Vence amanhã" precisa virar "Vence hoje" sozinho. Os rótulos são
   * calculados no servidor a partir da data real, então basta recarregar os
   * dados: ao voltar para a aba e na virada da meia-noite. Nada fica congelado
   * porque a pessoa deixou o navegador aberto.
   */
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    const agora = new Date();
    const proximaMeiaNoite = new Date(agora);
    proximaMeiaNoite.setHours(24, 0, 30, 0);
    const relogio = setTimeout(
      () => router.refresh(),
      proximaMeiaNoite.getTime() - agora.getTime(),
    );

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      clearTimeout(relogio);
    };
  }, [router]);

  const buscarConvites = useCallback(async () => {
    const resultado = await carregarConvitesRecebidos();
    setConvites(resultado.sucesso && resultado.dados ? resultado.dados : []);
  }, []);

  useEffect(() => {
    void buscarConvites();
  }, [buscarConvites]);

  /**
   * A caixa de Convites se atualiza sozinha.
   *
   * Ela não vem do servidor junto da página — é uma Server Action chamada aqui
   * no navegador —, então o `router.refresh()` do tempo real não a alcança.
   * Ao chegar um evento de convite ou negociação, refazemos só esta consulta:
   * o contador do botão e a negociação aberta acompanham sem F5.
   */
  useEventoRealtime((evento) => {
    if (evento.tipo === "convite" || evento.tipo === "negociacao") {
      void buscarConvites();
    }
  });

  // O badge do botão soma três coisas diferentes: convite recebido esperando
  // resposta, mensagem não lida em qualquer negociação e contraproposta
  // aguardando decisão de quem convidou.
  const convitesPendentes = contarPendenciasDeConvite(convites);

  const activeFiltersCount =
    filters.status.length + filters.priority.length + filters.category.length +
    filters.access.length + filters.deadline.length + filters.assignee.length +
    (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0);

  /**
   * Recorte único da tela.
   *
   * Quadro, lista e indicadores do topo leem daqui. Não existe um contador que
   * conte "todos" enquanto a tela mostra um subconjunto: buscar por um Cliente
   * muda os cards e os números juntos.
   */
  const filtered = useMemo(
    () =>
      filtrarProtocolos(protocols, {
        busca: query,
        somenteMeus: onlyMine,
        usuarioId,
        altaPrioridade,
        vencendoHoje,
        filtros: filters,
      }),
    [protocols, query, onlyMine, usuarioId, altaPrioridade, vencendoHoje, filters],
  );

  // Mudou o recorte, a leitura recomeça do começo: ninguém quer cair na página
  // 4 de um resultado que agora tem uma página só.
  useEffect(() => {
    setPagina(1);
    setPaginaDaColuna({});
  }, [query, onlyMine, altaPrioridade, vencendoHoje, filters]);

  /** Havia algum status sem coluna marcado na renderização anterior? */
  const filtravaSemColuna = useRef(false);

  /**
   * Recusado e Cancelado abrem a Lista sozinhos.
   *
   * Eles existem no fluxo, mas não têm coluna no quadro — filtrar por eles no
   * Kanban devolvia cinco colunas vazias e parecia bug. Como a Lista mostra
   * qualquer status, a vista acompanha o filtro.
   *
   * A troca acontece só na borda: no instante em que um desses status passa a
   * estar marcado. Depois disso a pessoa continua livre para voltar ao Kanban e
   * ficar nele — a tela sugere uma vez, não insiste.
   */
  useEffect(() => {
    const filtraSemColuna = filters.status.some((status) =>
      STATUS_SEM_COLUNA.includes(status),
    );
    if (filtraSemColuna && !filtravaSemColuna.current) setVista("lista");
    filtravaSemColuna.current = filtraSemColuna;
  }, [filters.status]);

  /**
   * Clique na pílula vermelha de um card.
   *
   * Abre o Atendimento, vai para a Conversa, escolhe o canal onde está a
   * primeira não lida e pede ao painel que role até ela. Sem nada por ler, o
   * clique apenas abre a Conversa no canal do Cliente.
   */
  const abrirNaoLidas = (protocol: Protocol) => {
    setActiveId(protocol.id);
    const naoLidas = protocol.real?.unread;
    if (!naoLidas || !naoLidas.canalPrimeira) {
      setFoco({ aba: "conversa", canal: "cliente", mensagemId: null });
      return;
    }
    setFoco({
      aba: "conversa",
      canal: naoLidas.canalPrimeira,
      mensagemId: naoLidas.primeiraNaoLidaId,
    });
  };

  const byColumn = (id: Status) => filtered.filter((p) => p.status === id);

  /** Cards já revelados numa coluna, com o total para o botão "ver mais". */
  const colunaPaginada = (id: Status) => {
    const todos = byColumn(id);
    const visiveis = (paginaDaColuna[id] ?? 1) * TAMANHO_PAGINA_COLUNA;
    return { todos, mostrados: todos.slice(0, visiveis) };
  };

  const listaPaginada = paginar(filtered, pagina, TAMANHO_PAGINA_LISTA);

  /**
   * Categorias oferecidas no filtro.
   *
   * As cinco de sempre mais as que aparecerem nos dados reais — é assim que
   * `Consultoria` entra na lista sem ser convertida em outra categoria.
   */
  const categoriasDisponiveis = useMemo<Category[]>(() => {
    const extras = protocols
      .map((p) => p.category)
      .filter((c) => !CATEGORIAS_BASE.includes(c));
    return [...CATEGORIAS_BASE, ...Array.from(new Set(extras))];
  }, [protocols]);

  /** Liga/desliga um status no mesmo estado que o painel de filtros usa. */
  const toggleStatus = (status: Status) =>
    setFilters((atual) => ({
      ...atual,
      status: atual.status.includes(status)
        ? atual.status.filter((s) => s !== status)
        : [...atual.status, status],
    }));
  const active = protocols.find((p) => p.id === activeId) ?? null;

  /**
   * Arrastar um card para outra coluna.
   *
   * É uma transição de verdade, e por isso passa pela mesma máquina de estados
   * do servidor: soltar num destino que a regra não permite avisa em vez de
   * fingir que moveu.
   */
  const moveCard = (id: string, status: Status) => {
    const alvo = protocols.find((p) => p.id === id);
    if (!alvo?.real) return;

    const destino = statusDoBanco(status);
    if (alvo.status === status || movendo) return;
    if (!alvo.real.actions.some((acao) => acao.destino === destino)) {
      toast.error(
        "Esta mudança de status não é permitida a partir do status atual.",
      );
      return;
    }
    const atendimentoId = alvo.real.atendimentoId;
    iniciarTransicao(async () => {
      const resultado = await alterarStatusAtendimento({
        atendimentoId,
        destino,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      router.refresh();
    });
  };

  // Contadores da lista filtrada — e com "Em andamento" separado de
  // "Aguardando cliente": num a equipe trabalha, no outro o Atendimento parou
  // esperando o Cliente.
  const counts = contarIndicadores(filtered);

  return (
    <div className="flex h-full min-h-dvh w-full bg-background">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-card/40 px-4 py-5 lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Operações</span>
                <span>/</span>
                <span className="text-foreground">Atendimentos</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Atendimentos
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Gerencie protocolos, prazos e comunicação com clientes em um só lugar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
              {/* Só aparece para quem tem convite: sem convite nenhum, o botão
                  seria uma porta para uma sala vazia. */}
              {convites.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConvitesAberto(true)}
                >
                  <Inbox className="h-3.5 w-3.5" />
                  Convites
                  {convitesPendentes > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {convitesPendentes}
                    </span>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
                {activeFiltersCount > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Novo atendimento
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total" value={counts.total} tone="neutral" />
            <StatCard label="Novos" value={counts.novos} tone="info" />
            <StatCard label="Em andamento" value={counts.andamento} tone="progress" />
            <StatCard label="Aguardando cliente" value={counts.aguardandoCliente} tone="warning" />
            <StatCard label="Concluídos" value={counts.concluidos} tone="success" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por cliente, protocolo ou código (CLI-…)…"
                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <FilterChip active={!onlyMine} onClick={() => setOnlyMine(false)}>
              Todos
            </FilterChip>
            <FilterChip active={onlyMine} onClick={() => setOnlyMine(true)}>
              <Star className="h-3 w-3" /> Meus
            </FilterChip>
            <FilterChip
              active={altaPrioridade}
              onClick={() => setAltaPrioridade((ligado) => !ligado)}
            >
              Alta prioridade
            </FilterChip>
            <FilterChip
              active={vencendoHoje}
              onClick={() => setVencendoHoje((ligado) => !ligado)}
            >
              Vencendo hoje
            </FilterChip>

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              <button
                aria-label="Visualização em quadro"
                aria-pressed={vista === "kanban"}
                onClick={() => setVista("kanban")}
                className={cn(
                  "alvo-toque flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  vista === "kanban"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                aria-label="Visualização em lista"
                aria-pressed={vista === "lista"}
                onClick={() => setVista("lista")}
                className={cn(
                  "alvo-toque flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  vista === "lista"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filtro de Status: mesmos chips da linha acima, ligados ao mesmo
              estado do painel de filtros — marcar aqui marca lá. É por onde
              Recusado e Cancelado, que não têm coluna, ficam alcançáveis. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            {STATUS.map((s) => (
              <FilterChip
                key={s.id}
                active={filters.status.includes(s.id)}
                onClick={() => toggleStatus(s.id)}
              >
                {s.label}
              </FilterChip>
            ))}
          </div>
        </div>

        {vista === "kanban" ? (
          <>
            {/* Quadro do desktop: as cinco colunas lado a lado, como sempre. */}
            <div className="scrollbar-thin hidden flex-1 gap-4 overflow-x-auto px-8 py-6 lg:flex">
              {COLUMNS.map((col) => {
                const { todos, mostrados } = colunaPaginada(col.id);
                return (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    protocols={mostrados}
                    total={todos.length}
                    activeId={activeId ?? undefined}
                    onSelect={setActiveId}
                    onAbrirNaoLidas={abrirNaoLidas}
                    onDrop={moveCard}
                    draggingId={draggingId}
                    setDraggingId={setDraggingId}
                    onVerMais={() =>
                      setPaginaDaColuna((atual) => ({
                        ...atual,
                        [col.id]: (atual[col.id] ?? 1) + 1,
                      }))
                    }
                  />
                );
              })}
            </div>

            {/* Quadro do celular e do tablet: um status por vez. */}
            <div className="flex flex-1 flex-col lg:hidden">
              {/*
                Faixa de status rolável. `role="tablist"` porque é exatamente
                isso: seleciona qual painel aparece abaixo. A rolagem horizontal
                é do próprio contêiner — nada é comprimido para caber.
              */}
              <div
                role="tablist"
                aria-label="Status do quadro"
                className="rolagem-contida hide-scrollbar flex gap-2 overflow-x-auto border-b border-border px-4 pb-3"
              >
                {COLUMNS.map((col) => {
                  const total = byColumn(col.id).length;
                  const ativo = col.id === statusMobile;
                  return (
                    <button
                      key={col.id}
                      role="tab"
                      type="button"
                      aria-selected={ativo}
                      onClick={() => setStatusMobile(col.id)}
                      className={cn(
                        "alvo-toque-h inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {/* O ponto repete a cor da coluna: o estado ativo não
                          depende só de cor, mas a identidade do status sim. */}
                      <span className={cn("h-2 w-2 rounded-full", col.accent)} />
                      {col.title}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                          ativo ? "bg-primary-foreground/20" : "bg-muted",
                        )}
                      >
                        {total}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const col = COLUMNS.find((c) => c.id === statusMobile) ?? COLUMNS[0];
                const { todos, mostrados } = colunaPaginada(col.id);
                const restantes = todos.length - mostrados.length;
                return (
                  <div
                    role="tabpanel"
                    aria-label={col.title}
                    /*
                      No celular o card encosta nas bordas: a margem negativa
                      cancela o respiro do painel administrativo (`p-4`) menos
                      1px, que é a margem visual mínima. A partir de `sm` o
                      enquadramento do tablet fica exatamente como estava.
                    */
                    className="-mx-[calc(1rem-1px)] flex flex-1 flex-col gap-2.5 px-0 py-4 sm:mx-0 sm:px-4"
                  >
                    {mostrados.length === 0 ? (
                      <p className="py-12 text-center text-xs text-muted-foreground">
                        Nenhum atendimento em {col.title.toLowerCase()}.
                      </p>
                    ) : (
                      mostrados.map((p) => (
                        <ProtocolCard
                          key={p.id}
                          protocol={p}
                          active={p.id === activeId}
                          onClick={() => setActiveId(p.id)}
                          onAbrirNaoLidas={() => abrirNaoLidas(p)}
                        />
                      ))
                    )}
                    {restantes > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPaginaDaColuna((atual) => ({
                            ...atual,
                            [col.id]: (atual[col.id] ?? 1) + 1,
                          }))
                        }
                        className="alvo-toque-h w-full rounded-xl border border-border bg-card text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Ver mais {restantes}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
        ) : (
          /*
            A listagem encosta nas bordas no celular. As margens negativas
            cancelam o respiro do painel administrativo (`p-4`, `sm:p-6`) menos
            1px, que é a margem visual mínima pedida. A partir de `lg` volta o
            enquadramento com respiro do desktop.
          */
          <div className="flex flex-1 px-0 py-4 lg:px-8 lg:py-6">
            {/* Mesma lista filtrada do quadro: nenhuma consulta a mais — só a
                fatia da página atual. */}
            <div className="-mx-[calc(1rem-1px)] flex min-w-0 flex-1 sm:-mx-[calc(1.5rem-1px)] lg:mx-0">
              <ProtocolList
                protocols={listaPaginada.itens}
                activeId={activeId ?? undefined}
                onSelect={setActiveId}
                paginacao={{
                  pagina: listaPaginada.pagina,
                  totalPaginas: listaPaginada.totalPaginas,
                  total: listaPaginada.total,
                  primeiro: listaPaginada.primeiro,
                  ultimo: listaPaginada.ultimo,
                  irPara: setPagina,
                }}
              />
            </div>
          </div>
        )}
      </main>

      {active && (
        // O painel gruda no topo da área rolável e nunca passa da altura
        // visível. A conta é a moldura do painel administrativo: `100dvh` menos
        // o cabeçalho fixo (4rem) e as duas margens da área de conteúdo (1,5rem
        // em cima e 1,5rem embaixo). Faltava a de baixo — e era justamente ela
        // que empurrava o composer para fora da tela em notebook.
        <div className="hidden shrink-0 xl:sticky xl:top-0 xl:flex xl:h-[calc(100dvh_-_7rem)]">
          <ProtocolPanel
            // `key` por atendimento: cada card abre no próprio estado inicial —
            // o Protocolo quando existe registro formal, a Conversa quando não.
            // Sem isso o painel guardaria a aba e o rascunho do card anterior.
            key={active.id}
            protocol={active}
            foco={foco}
            onFocoAplicado={() => setFoco(null)}
            onClose={() => setActiveId(null)}
            onAtualizar={() => router.refresh()}
          />
        </div>
      )}
      {active && (
        // Fora do desktop o painel é uma sobreposição: precisa ficar acima da
        // navegação inferior (z-40), senão o composer fica escondido atrás
        // dela. Mesmo nível que o painel de filtros já usa.
        <div className="fixed inset-0 z-50 flex h-[100dvh] xl:hidden">
          <button
            aria-label="Fechar"
            className="flex-1 bg-foreground/30"
            onClick={() => setActiveId(null)}
          />
          <ProtocolPanel
            // `key` por atendimento: cada card abre no próprio estado inicial —
            // o Protocolo quando existe registro formal, a Conversa quando não.
            // Sem isso o painel guardaria a aba e o rascunho do card anterior.
            key={active.id}
            protocol={active}
            foco={foco}
            onFocoAplicado={() => setFoco(null)}
            onClose={() => setActiveId(null)}
            onAtualizar={() => router.refresh()}
          />
        </div>
      )}
      <NewAtendimentoDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ConvitesRecebidosDialog
        open={convitesAberto}
        onClose={() => {
          setConvitesAberto(false);
          setConviteFocado(null);
        }}
        convites={convites}
        conviteFocado={conviteFocado}
        onRecarregar={() => {
          void buscarConvites();
          // Aceitar um convite faz o Atendimento entrar no quadro: os dados do
          // servidor precisam vir de novo, e não só a caixa de convites.
          router.refresh();
        }}
      />
      <FiltersPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        activeCount={activeFiltersCount}
        categories={categoriasDisponiveis}
      />
    </div>
  );
};

const StatCard = ({
  label, value, tone, pulse,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "progress" | "warning" | "success";
  pulse?: boolean;
}) => {
  const dot = {
    neutral: "bg-muted-foreground",
    info: "bg-status-new",
    progress: "bg-status-progress",
    warning: "bg-status-waiting",
    success: "bg-status-done",
  }[tone];
  return (
    // `data-indicador` é só um ponto de apoio para os testes de navegador
    // lerem o número que está na tela; não muda nada do visual.
    <div
      data-indicador={label}
      className="rounded-xl border border-border bg-card p-4 shadow-card"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot, pulse && "animate-pulse")} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
};

const FilterChip = ({
  children, active, onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "alvo-toque-h inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:bg-muted",
    )}
  >
    {children}
  </button>
);