"use client";

import { useState, useTransition } from "react";
import { Download, FileText, RotateCcw, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analisarAjuste } from "@/features/atendimentos/actions/ajustes";
import { TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA } from "@/features/atendimentos/constants/atendimento";
import type { RealAdjustment } from "../../types/atendimentos";

/**
 * Solicitação de ajuste do Cliente, dentro do Protocolo do painel.
 *
 * Fica onde a manifestação dela foi registrada — o Protocolo é o canal formal —
 * e não numa tela, rota ou módulo administrativo à parte: quem analisa já está
 * com o Atendimento aberto, lendo o que o Cliente escreveu.
 *
 * A decisão tem duas saídas e nenhuma terceira:
 *
 * - **Aceitar e reabrir**: o Atendimento volta para Em andamento, com
 *   observação opcional;
 * - **Recusar**: o Atendimento permanece Concluído, com justificativa
 *   obrigatória — recusar sem dizer por quê deixaria o Cliente sem nada sobre o
 *   que agir.
 *
 * Os botões só existem enquanto o pedido está pendente, e o servidor confere de
 * novo quem está decidindo: esconder botão nunca foi proteção.
 */
export const SolicitacaoDeAjusteCard = ({
  adjustment,
  onAtualizar,
}: {
  adjustment: RealAdjustment;
  onAtualizar?: () => void;
}) => {
  const [decisao, setDecisao] = useState<"aceitar" | "recusar" | null>(null);
  const [resposta, setResposta] = useState("");
  const [processando, iniciarTransicao] = useTransition();

  const pendente = adjustment.status === "pendente";
  const justificativaCurta =
    decisao === "recusar" &&
    resposta.trim().length < TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA;

  function confirmar() {
    // Guarda dupla: o botão já está desabilitado durante o envio. Esta linha
    // impede o clique duplo rápido; a condição `status = 'pendente'` do UPDATE
    // é a barreira final, e é ela que faz uma decisão única prevalecer quando
    // duas pessoas autorizadas decidem ao mesmo tempo.
    if (!decisao || processando || justificativaCurta) return;
    iniciarTransicao(async () => {
      const resultado = await analisarAjuste({
        solicitacaoId: adjustment.id,
        decisao,
        resposta: resposta.trim() || null,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      setDecisao(null);
      setResposta("");
      onAtualizar?.();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
          Solicitação de ajuste
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {adjustment.statusLabel}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        {adjustment.requesterName} · {adjustment.createdAtLabel}
      </p>

      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
        {adjustment.reason}
      </p>

      {adjustment.attachment && (
        <a
          href={adjustment.attachment.url}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[220px] truncate">
            {adjustment.attachment.name}
          </span>
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
      )}

      {adjustment.answer && (
        <div className="mt-3 rounded-lg border border-border bg-card p-2.5">
          <p className="text-[11px] text-muted-foreground">
            Resposta
            {adjustment.reviewerName ? ` de ${adjustment.reviewerName}` : ""}
            {adjustment.reviewedAtLabel ? ` · ${adjustment.reviewedAtLabel}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {adjustment.answer}
          </p>
        </div>
      )}

      {pendente && !decisao && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={processando}
            onClick={() => setDecisao("aceitar")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Aceitar e reabrir
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={processando}
            onClick={() => setDecisao("recusar")}
          >
            <X className="h-3.5 w-3.5" />
            Recusar
          </Button>
        </div>
      )}

      {pendente && decisao && (
        <div className="mt-3 rounded-xl border border-border bg-card">
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={2}
            placeholder={
              decisao === "aceitar"
                ? "Observação para o cliente (opcional)…"
                : "Explique brevemente o motivo da recusa…"
            }
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2 py-1.5">
            <span className="px-1.5 text-[11px] text-muted-foreground">
              {decisao === "aceitar"
                ? "O atendimento volta para Em andamento."
                : "O atendimento permanece Concluído."}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={processando}
                onClick={() => {
                  setDecisao(null);
                  setResposta("");
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant={decisao === "recusar" ? "outline" : "default"}
                disabled={processando || justificativaCurta}
                onClick={confirmar}
              >
                {processando
                  ? "Registrando…"
                  : decisao === "aceitar"
                    ? "Confirmar reabertura"
                    : "Confirmar recusa"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
