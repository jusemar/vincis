"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { rotuloDaLinha } from "@/features/precificacao/lib/descricao";
import { formatarCentavos, reaisDeCentavos } from "@/features/precificacao/lib/formato";
import { calcularPreco } from "@/features/precificacao/lib/motor";
import type {
  RespostasPrecificacao,
  ResultadoPrecificacao,
  ServicoPrecificacao,
  TabelaPrecificacao,
} from "@/features/precificacao/types/precificacao";
import type { ServicoTab } from "../types";
import { AnimatedPrice } from "./AnimatedPrice";
import { ContratarPlano } from "./ContratarPlano";

/** O que cada card precisa para contratar — igual em todos, por isso num tipo só. */
type PropsDeContratacao = {
  tab: ServicoTab;
  respostas: RespostasPrecificacao;
  autenticado: boolean;
  retomada: { planoCodigo: string; periodoCodigo: string } | null;
  onRetomada: () => void;
};

/**
 * O prazo com que o card abre.
 *
 * O da retomada, quando a pessoa voltou do login para contratar este plano; do
 * contrário, o primeiro da tabela (o mensal). O card é remontado quando a
 * retomada chega, e é assim que ele passa a abrir no prazo certo sem efeito.
 */
function prazoInicial(resultado: ResultadoPrecificacao, retomado?: string) {
  return (
    resultado.periodos.find((p) => p.periodo === retomado)?.periodo ??
    resultado.periodos[0]?.periodo ??
    ""
  );
}

/**
 * Os cards de preço.
 *
 * Nada é calculado aqui: nome, texto comercial, valores, prazos e economia do
 * combo vêm do motor e da tabela. Antes o card do Pacote refazia a subtração da
 * economia por conta própria — duas contas para o mesmo número, e a chance de
 * uma delas mudar sozinha.
 */

/** Selo do card. É desenho da vitrine, e por isso continua na tela. */
const SELO_DO_SERVICO: Record<string, string> = {
  consultiva: "Acompanhamento mais próximo",
  combo: "Economia no combo",
};

/**
 * Os prazos do plano, agora escolhíveis.
 *
 * Cada linha continua mostrando o mesmo preço de antes; o que muda é que ela
 * pode ser marcada, porque contratar exige dizer por quanto tempo. Só o código
 * do prazo sai daqui — o valor é recalculado no servidor.
 */
function PrecosPorPeriodo({
  resultado,
  selecionado,
  onSelecionar,
}: {
  resultado: ResultadoPrecificacao;
  selecionado: string;
  onSelecionar: (periodo: string) => void;
}) {
  return (
    <div className="mt-4 space-y-2" role="radiogroup" aria-label="Prazo de contratação">
      {resultado.periodos.map((p, indice) => {
        const ultimo = indice === resultado.periodos.length - 1;
        const marcado = p.periodo === selecionado;
        return (
          <button
            key={p.periodo}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => onSelecionar(p.periodo)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-shadow ${
              ultimo ? "bg-primary/10" : "bg-muted/50"
            } ${marcado ? "ring-2 ring-primary" : ""}`}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">{p.rotulo}</p>
              {p.economiaMensalCentavos > 0 ? (
                <p className="text-[11px] font-medium text-primary">
                  Economize {formatarCentavos(p.economiaMensalCentavos)}/mês
                </p>
              ) : null}
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-xs font-medium text-muted-foreground">R$</span>
              <span className="text-xl font-bold tabular-nums text-foreground">
                <AnimatedPrice value={reaisDeCentavos(p.mensalCentavos)} />
              </span>
              <span className="text-xs text-muted-foreground">/mês</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}

function OfferCard({
  servico,
  resultado,
  contratacao,
}: {
  servico: ServicoPrecificacao;
  resultado: ResultadoPrecificacao;
  contratacao: PropsDeContratacao;
}) {
  const [open, setOpen] = useState(false);
  const retomar = contratacao.retomada?.planoCodigo === servico.codigo;
  const [prazo, setPrazo] = useState(() =>
    prazoInicial(resultado, retomar ? contratacao.retomada?.periodoCodigo : undefined),
  );
  const periodo =
    resultado.periodos.find((p) => p.periodo === prazo) ?? resultado.periodos[0];
  const selo = SELO_DO_SERVICO[servico.codigo];

  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 ${
        servico.destaque ? "border-primary bg-card shadow-md" : "border-border bg-card"
      }`}
    >
      {servico.destaque && selo ? (
        <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          {selo}
        </span>
      ) : null}
      <h3 className="text-lg font-bold text-foreground">{servico.nome}</h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{servico.chamada}</p>

      <PrecosPorPeriodo resultado={resultado} selecionado={periodo.periodo} onSelecionar={setPrazo} />

      <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
          >
            {open ? "Ocultar cálculo" : "Como chegamos nesse valor?"}
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-3 space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs">
            {resultado.linhas.map((l) => {
              const rotulo = rotuloDaLinha(l, servico.grupoBase ?? "");
              return (
                <li key={rotulo} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{rotulo}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {l.valorCentavos < 0 ? "− " : ""}
                    {formatarCentavos(Math.abs(l.valorCentavos))}
                  </span>
                </li>
              );
            })}
            <li className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold text-foreground">
              <span>Total mensal</span>
              <span className="tabular-nums">{formatarCentavos(resultado.mensalCentavos)}</span>
            </li>
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <ContratarPlano
        planoCodigo={servico.codigo}
        planoNome={servico.nome}
        periodo={periodo}
        respostas={contratacao.respostas}
        tab={contratacao.tab}
        autenticado={contratacao.autenticado}
        retomar={retomar}
        onRetomada={contratacao.onRetomada}
        rotulo="Contratar"
        variante={servico.destaque ? "default" : "secondary"}
      />
    </article>
  );
}

function ComboCard({
  servico,
  resultado,
  contratacao,
}: {
  servico: ServicoPrecificacao;
  resultado: ResultadoPrecificacao;
  contratacao: PropsDeContratacao;
}) {
  const retomar = contratacao.retomada?.planoCodigo === servico.codigo;
  const [prazo, setPrazo] = useState(() =>
    prazoInicial(resultado, retomar ? contratacao.retomada?.periodoCodigo : undefined),
  );
  const combo = resultado.combo;
  if (!combo) return null;
  const periodo =
    resultado.periodos.find((p) => p.periodo === prazo) ?? resultado.periodos[0];

  return (
    <article className="flex flex-col rounded-2xl border border-primary bg-card p-5 shadow-md">
      <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
        {SELO_DO_SERVICO[servico.codigo]}
      </span>
      <h3 className="text-lg font-bold text-foreground">{servico.nome}</h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{servico.chamada}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-muted-foreground">Separados</p>
          <p className="font-semibold text-foreground line-through decoration-muted-foreground/60">
            {formatarCentavos(combo.separadoCentavos)}/mês
          </p>
        </div>
        <div className="rounded-lg bg-primary/10 px-3 py-2">
          <p className="text-primary">No combo</p>
          <p className="font-semibold text-foreground">
            {formatarCentavos(resultado.mensalCentavos)}/mês
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-primary">
        Economia de {formatarCentavos(combo.economiaMensalCentavos)}/mês ·{" "}
        {formatarCentavos(combo.economiaAnualCentavos)}/ano
      </p>

      <PrecosPorPeriodo resultado={resultado} selecionado={periodo.periodo} onSelecionar={setPrazo} />

      <ContratarPlano
        planoCodigo={servico.codigo}
        planoNome={servico.nome}
        periodo={periodo}
        respostas={contratacao.respostas}
        tab={contratacao.tab}
        autenticado={contratacao.autenticado}
        retomar={retomar}
        onRetomada={contratacao.onRetomada}
        rotulo="Contratar pacote completo"
      />
    </article>
  );
}

/** Serviços exibidos em cada aba. A aba de contabilidade mostra os dois planos. */
const SERVICOS_DA_ABA: Record<ServicoTab, string[]> = {
  consultiva: ["padrao", "consultiva"],
  juridico: ["juridico"],
  combo: ["combo"],
};

export function ResultCards({
  tabela,
  tab,
  respostas,
  autenticado,
  retomada,
  onRetomada,
}: {
  tabela: TabelaPrecificacao;
  tab: ServicoTab;
  respostas: RespostasPrecificacao;
  autenticado: boolean;
  retomada: { planoCodigo: string; periodoCodigo: string } | null;
  onRetomada: () => void;
}) {
  const contratacao: PropsDeContratacao = { tab, respostas, autenticado, retomada, onRetomada };
  // A chave muda quando chega a retomada deste plano: o card remonta já no
  // prazo que a pessoa tinha escolhido antes de entrar na conta.
  const chave = (codigo: string) =>
    retomada?.planoCodigo === codigo ? `${codigo}:${retomada.periodoCodigo}` : codigo;
  const cartoes = SERVICOS_DA_ABA[tab].map((codigo) => ({
    servico: tabela.servicos.find((s) => s.codigo === codigo)!,
    resultado: calcularPreco(tabela, codigo, respostas),
  }));

  if (tab === "combo") {
    return (
      <div className="grid gap-4">
        {cartoes.map(({ servico, resultado }) => (
          <ComboCard
            key={chave(servico.codigo)}
            servico={servico}
            resultado={resultado}
            contratacao={contratacao}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${cartoes.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
      {cartoes.map(({ servico, resultado }) => (
        <OfferCard
          key={chave(servico.codigo)}
          servico={servico}
          resultado={resultado}
          contratacao={contratacao}
        />
      ))}
    </div>
  );
}
