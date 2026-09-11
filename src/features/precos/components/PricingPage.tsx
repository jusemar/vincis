"use client";

import { useEffect, useState } from "react";
import { respostasIniciais } from "@/features/precificacao/lib/respostas";
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from "@/features/precificacao/types/precificacao";
import type { ServicoTab } from "../types";
import { ComparisonTable } from "./ComparisonTable";
import { lerIntencaoGuardada, type IntencaoDeContratacao } from "./ContratarPlano";
import { Configurador } from "./Configurador";
import { ResultCards } from "./ResultCards";
import { ServiceTypeSelector } from "./ServiceTypeSelector";

/**
 * A vitrine de preços.
 *
 * A configuração comercial chega pronta do servidor (`app/precos/page.tsx`) e
 * vive aqui como propriedade. É o que mantém as duas coisas que a página
 * precisa ter ao mesmo tempo: preço que vem do banco e recálculo instantâneo a
 * cada clique — o motor é puro e roda no navegador sobre a tabela já carregada,
 * sem uma ida ao servidor por resposta do configurador.
 */
/**
 * Lê a intenção guardada antes do login, uma vez, depois da hidratação.
 *
 * Componente à parte de propósito: o efeito só **lê** o armazenamento do
 * navegador — o sistema externo — e entrega o que achou à vitrine por callback.
 * Quem muda o estado é a vitrine, fora do corpo do efeito, que é o padrão que o
 * React recomenda para sincronizar com algo que vive fora dele.
 */
function RetomadaDaContratacao({
  onRetomar,
}: {
  onRetomar: (intencao: IntencaoDeContratacao) => void;
}) {
  useEffect(() => {
    const intencao = lerIntencaoGuardada();
    if (intencao) onRetomar(intencao);
    // Só na montagem: depois disso quem manda é o que está na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function PricingPage({
  tabela,
  autenticado,
}: {
  tabela: TabelaPrecificacao;
  /** Sessão lida no servidor. Decide entre abrir o login e a confirmação. */
  autenticado: boolean;
}) {
  const [tab, setTab] = useState<ServicoTab>("consultiva");
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(() =>
    respostasIniciais(tabela),
  );
  /*
    O plano que a pessoa ia contratar antes de entrar na conta.

    Restaurado depois da montagem, e não no estado inicial: o servidor não lê
    `sessionStorage`, e começar diferente do HTML que ele entregou quebraria a
    hidratação. A vitrine volta à aba, às respostas e ao prazo que ela tinha
    escolhido, e o card daquele plano reabre a confirmação.
  */
  const [retomada, setRetomada] = useState<{
    planoCodigo: string;
    periodoCodigo: string;
  } | null>(null);

  function retomar(intencao: IntencaoDeContratacao) {
    setTab(intencao.tab);
    setRespostas(intencao.respostas);
    setRetomada({
      planoCodigo: intencao.planoCodigo,
      periodoCodigo: intencao.periodoCodigo,
    });
  }

  return (
    <main className="min-h-screen bg-background">
      <RetomadaDaContratacao onRetomar={retomar} />
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-16 sm:pt-24">
          <h1 className="max-w-3xl text-3xl leading-[1.1] font-bold text-foreground sm:text-5xl">
            Sua empresa não é igual às outras
          </h1>
          <p className="mt-3 max-w-3xl text-2xl leading-[1.15] font-semibold text-muted-foreground sm:text-4xl">
            Seu preço também não precisa ser.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Escolha o tipo de serviço
        </h2>
        <div className="mt-3">
          <ServiceTypeSelector value={tab} onChange={setTab} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0">
            <Configurador
              tabela={tabela}
              respostas={respostas}
              onChange={setRespostas}
            />
          </div>

          <div className="min-w-0" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <ResultCards
              tabela={tabela}
              tab={tab}
              respostas={respostas}
              autenticado={autenticado}
              retomada={retomada}
              onRetomada={() => setRetomada(null)}
            />
            <ComparisonTable tab={tab} />
            <p className="mt-4 text-xs text-muted-foreground">
              Os valores apresentados são calculados com base nas informações fornecidas e ficam
              registrados na contratação. A ativação do serviço acontece após a confirmação do
              pagamento e das demais etapas necessárias.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
