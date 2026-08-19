"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Handshake, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  adotarContrapropostaConvite,
  escreverNegociacaoConvite,
} from "@/features/atendimentos/actions/colaboracao";
import type { ConviteAtendimentoDTO } from "@/features/atendimentos/queries/convites-do-atendimento";
import {
  centavosDoTexto,
  rotuloValorCentavos,
} from "@/features/atendimentos/lib/valores";
import { ROTULO_STATUS_CONVITE } from "@/features/atendimentos/constants/atendimento";

/** Rótulo da situação derivada, com "Em negociação" entre Pendente e Aceito. */
const ROTULO_SITUACAO: Record<ConviteAtendimentoDTO["situacao"], string> = {
  pendente: ROTULO_STATUS_CONVITE.pendente,
  em_negociacao: "Em negociação",
  aceito: ROTULO_STATUS_CONVITE.aceito,
  recusado: ROTULO_STATUS_CONVITE.recusado,
  expirado: ROTULO_STATUS_CONVITE.expirado,
  revogado: ROTULO_STATUS_CONVITE.revogado,
};

/**
 * Negociação privada de um convite.
 *
 * Quarto canal do Atendimento, ao lado do Protocolo, da Conversa Cliente e da
 * Interna — e sem nenhum dado em comum com os três. Só as duas pontas do
 * convite leem o que está aqui; o servidor entrega a lista já recortada, então
 * a conversa alheia não chega ao navegador para ser descoberta.
 *
 * **Um botão só.** Antes havia "Enviar contraproposta" e "Enviar", e a pessoa
 * precisava decidir de antemão que tipo de coisa estava escrevendo. Agora
 * escreve, opcionalmente informa um valor, e clica em Enviar: quem decide se
 * aquilo é mensagem, proposta, contraproposta ou correção é o servidor, a
 * partir do estado da negociação e do lado da mesa. Perguntar antes de
 * precificar continua sendo só uma mensagem.
 */
export const NegociacaoConvite = ({
  convite,
  onAtualizar,
}: {
  convite: ConviteAtendimentoDTO;
  onAtualizar?: () => void;
}) => {
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState("");
  const [enviando, iniciarTransicao] = useTransition();

  const aberta = convite.status === "pendente";
  const souRemetente = convite.papel === "remetente";
  const centavos = centavosDoTexto(valor);
  /** Este lado já pôs um valor na mesa? Então mandar outro é corrigir. */
  const corrigindo = souRemetente
    ? convite.valorOferecidoCentavos !== null
    : convite.valorContrapropostaCentavos !== null;

  function executar(
    acao: () => Promise<{ sucesso: boolean; mensagem: string }>,
    aoConcluir?: () => void,
  ) {
    if (enviando) return;
    iniciarTransicao(async () => {
      const resultado = await acao();
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      aoConcluir?.();
      onAtualizar?.();
    });
  }

  /**
   * O único gesto de envio.
   *
   * Texto sem valor vira mensagem; valor — com ou sem texto — vira proposta,
   * contraproposta ou correção. Nada disso é decidido aqui: o servidor lê o
   * estado da negociação. A tela só recusa o envio completamente vazio.
   */
  function enviar() {
    if (!texto.trim() && centavos === null) return;
    executar(
      () =>
        escreverNegociacaoConvite({
          conviteId: convite.id,
          conteudo: texto,
          valorCentavos: centavos,
        }),
      () => {
        setTexto("");
        setValor("");
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* O estado do acordo, sempre visível: é o que a pessoa procura antes de
          ler qualquer mensagem. "Em negociação" separa o convite que já teve
          ida e volta daquele que ninguém respondeu ainda. */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium",
            convite.situacao === "aceito"
              ? "bg-status-done-bg text-status-done"
              : convite.situacao === "em_negociacao"
                ? "bg-status-progress-bg text-status-progress"
                : convite.situacao === "pendente"
                  ? "bg-status-waiting-bg text-status-waiting"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {ROTULO_SITUACAO[convite.situacao]}
        </span>
        {convite.aguardandoDecisao && (
          <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-priority-high">
            Contraproposta aguardando sua decisão
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ValorCelula rotulo="Oferecido" valor={convite.valorOferecidoCentavos} />
        <ValorCelula
          rotulo="Contraproposta"
          valor={convite.valorContrapropostaCentavos}
        />
        <ValorCelula
          rotulo={convite.status === "aceito" ? "Acordado" : "Em negociação"}
          // Enquanto não há aceite, o número que vale é a oferta vigente — é
          // exatamente ela que o aceite congela.
          valor={convite.valorAcordadoCentavos ?? convite.valorOferecidoCentavos}
          destaque
        />
      </div>

      {/* Um clique para adotar o valor pedido pelo convidado, em vez de
          redigitar o número — que é de onde saem os erros de digitação. */}
      {aberta && convite.aguardandoDecisao && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={enviando}
          onClick={() =>
            executar(() => adotarContrapropostaConvite({ conviteId: convite.id }))
          }
        >
          <Handshake className="h-3.5 w-3.5" />
          Adotar {rotuloValorCentavos(convite.valorContrapropostaCentavos)} como
          proposta
        </Button>
      )}

      <div className="scrollbar-thin max-h-64 space-y-3 overflow-y-auto rounded-xl border border-border bg-background p-3">
        {convite.negociacao.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma mensagem nesta negociação.
          </p>
        ) : (
          convite.negociacao.map((linha) => (
            <div
              key={linha.id}
              className={cn("flex", linha.autoria ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                  linha.autoria
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <div
                  className={cn(
                    "mb-0.5 text-[11px] font-medium",
                    linha.autoria
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {linha.autoria ? "Você" : linha.autorNome}
                </div>
                <p className="whitespace-pre-wrap leading-snug">{linha.conteudo}</p>
                {linha.valorCentavos !== null && (
                  <div
                    className={cn(
                      "mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                      linha.autoria
                        ? "bg-primary-foreground/15"
                        : "bg-background text-foreground",
                    )}
                  >
                    <Handshake className="h-3 w-3" />
                    {linha.tipo === "contraproposta" ? "Contraproposta" : "Proposta"}
                    {" · "}
                    {/* A correção mostra de onde veio: o valor antigo continua
                        legível no histórico, riscado, e nada é apagado. */}
                    {linha.valorAnteriorCentavos !== null && (
                      <>
                        <span className="line-through opacity-70">
                          {rotuloValorCentavos(linha.valorAnteriorCentavos)}
                        </span>
                        <ArrowRight className="h-3 w-3" />
                      </>
                    )}
                    {rotuloValorCentavos(linha.valorCentavos)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {aberta ? (
        <div className="rounded-xl border border-border bg-background">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva na negociação…"
            rows={2}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">R$</span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Valor (opcional)"
                className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm focus:border-ring focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {centavos === null
                ? "Sem valor: envia só a mensagem"
                : corrigindo
                  ? souRemetente
                    ? "Corrige a sua proposta"
                    : "Corrige a sua contraproposta"
                  : souRemetente
                    ? "Registra uma proposta"
                    : "Registra uma contraproposta"}
            </span>
            <Button
              size="sm"
              className="ml-auto gap-1.5"
              disabled={enviando || (!texto.trim() && centavos === null)}
              onClick={enviar}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
          Negociação encerrada · {ROTULO_SITUACAO[convite.situacao]}
        </p>
      )}
    </div>
  );
};

const ValorCelula = ({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number | null;
  destaque?: boolean;
}) => (
  <div
    className={cn(
      "rounded-lg border border-border bg-background p-2.5",
      destaque && valor !== null && "border-primary/40 bg-primary/5",
    )}
  >
    <div className="text-[11px] text-muted-foreground">{rotulo}</div>
    <div className="mt-0.5 text-sm font-semibold text-foreground">
      {rotuloValorCentavos(valor, "—")}
    </div>
  </div>
);
