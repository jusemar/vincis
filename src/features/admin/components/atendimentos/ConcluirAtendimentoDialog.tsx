"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckSquare, FileText, Paperclip, Square, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { anexarArquivoAoAtendimento } from "@/features/atendimentos/actions/anexar-arquivo";
import { registrarConclusaoDoAtendimento } from "@/features/atendimentos/actions/conclusao";
import { TAMANHO_MAXIMO_OBSERVACAO_FINAL } from "@/features/atendimentos/constants/atendimento";
import type { RealChecklistItem, RealFile } from "../../types/atendimentos";

interface Props {
  open: boolean;
  onClose: () => void;
  atendimentoId: string;
  protocolo: string;
  /** Arquivos já anexados: qualquer um pode ser marcado como entrega. */
  arquivos: RealFile[];
  /** Checklist real, para mostrar o que ainda está aberto. */
  checklist: RealChecklistItem[];
  onAtualizar?: () => void;
}

/**
 * Confirmação da conclusão do Atendimento.
 *
 * Mesma forma dos demais diálogos da tela — o de Participantes e o de Novo
 * atendimento: sobreposição, cartão arredondado, cabeçalho com o protocolo e
 * rodapé com os dois botões. Nada de layout novo; o que muda é o conteúdo.
 *
 * As três coisas que a conclusão precisa perguntar ficam numa tela só, na ordem
 * em que a decisão acontece: o que registrar, o que entregar e o que ainda está
 * pendente. A observação e a entrega são **opcionais** de propósito — nem todo
 * serviço rende documento, e forçar um anexo faria a equipe subir arquivo vazio
 * só para conseguir encerrar.
 *
 * Nenhuma etapa do checklist é marcada aqui. Etapa aberta vira aviso e uma
 * confirmação explícita; concluir o Atendimento não conclui o trabalho que não
 * foi feito.
 */
export const ConcluirAtendimentoDialog = ({
  open, onClose, atendimentoId, protocolo, arquivos, checklist, onAtualizar,
}: Props) => {
  const [observacao, setObservacao] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [confirmouPendencias, setConfirmouPendencias] = useState(false);
  /** Anexos enviados de dentro deste diálogo, ainda não recarregados do servidor. */
  const [recemEnviados, setRecemEnviados] = useState<
    { id: string; name: string }[]
  >([]);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const [processando, iniciarTransicao] = useTransition();

  if (!open) return null;

  const pendentes = checklist.filter((item) => !item.done);
  const disponiveis = [
    ...arquivos.map((arquivo) => ({ id: arquivo.id, name: arquivo.name })),
    // Um anexo enviado agora ainda não voltou na consulta do servidor; entra na
    // lista para poder ser marcado sem esperar o refresh.
    ...recemEnviados.filter(
      (novo) => !arquivos.some((arquivo) => arquivo.id === novo.id),
    ),
  ];

  function alternar(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((outro) => outro !== id) : [...atual, id],
    );
  }

  function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    const dados = new FormData();
    dados.set("atendimentoId", atendimentoId);
    dados.set("arquivo", arquivo);
    setEnviandoArquivo(true);
    iniciarTransicao(async () => {
      const resultado = await anexarArquivoAoAtendimento(dados);
      setEnviandoArquivo(false);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      const anexado = resultado.dados;
      setRecemEnviados((atual) => [
        ...atual,
        { id: anexado.id, name: anexado.nome },
      ]);
      // Quem acabou de subir um arquivo aqui quis entregá-lo: já vem marcado.
      setSelecionados((atual) => [...atual, anexado.id]);
      onAtualizar?.();
    });
  }

  function concluir() {
    if (processando) return;
    iniciarTransicao(async () => {
      const resultado = await registrarConclusaoDoAtendimento({
        atendimentoId,
        observacaoFinal: observacao.trim() || null,
        arquivoIds: selecionados,
        confirmarPendencias: confirmouPendencias,
      });
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      onClose();
      onAtualizar?.();
    });
  }

  const faltaConfirmar = pendentes.length > 0 && !confirmouPendencias;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <button
        aria-label="Fechar"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-card-hover animate-in fade-in zoom-in-95">
        <header className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Concluir atendimento
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{protocolo}</span> · registre a
              observação final e a entrega
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

        <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Observação final</h3>
            <div className="rounded-xl border border-border bg-background">
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={TAMANHO_MAXIMO_OBSERVACAO_FINAL}
                rows={4}
                placeholder="Ex.: Serviço concluído. O comprovante e os documentos finais estão disponíveis em Arquivos."
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Fica registrada no protocolo e aparece para o cliente. Opcional.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Arquivos de entrega</h3>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={processando}
                onClick={() => entrada.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" />
                {enviandoArquivo ? "Enviando…" : "Anexar"}
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

            {disponiveis.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Nenhum arquivo neste atendimento. Nem todo serviço gera
                documento — é possível concluir só com a observação.
              </p>
            ) : (
              <div className="space-y-1">
                {disponiveis.map((arquivo) => {
                  const marcado = selecionados.includes(arquivo.id);
                  return (
                    <button
                      key={arquivo.id}
                      type="button"
                      onClick={() => alternar(arquivo.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      {marcado ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-status-done" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <FileText className="h-4 w-4 shrink-0 text-status-progress" />
                      <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Os arquivos marcados passam a valer como entrega final do serviço.
            </p>
          </div>

          {pendentes.length > 0 && (
            <div className="rounded-lg border border-status-waiting/30 bg-status-waiting-bg p-3">
              {/* Mesmo par de cores do aviso "Área interna" da Conversa: o
                  âmbar do design system com texto escuro o bastante para ler. */}
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {pendentes.length === 1
                  ? "1 etapa do checklist ainda está pendente"
                  : `${pendentes.length} etapas do checklist ainda estão pendentes`}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-foreground">
                {pendentes.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <Square className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.internal && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Interna
                      </span>
                    )}
                  </li>
                ))}
                {pendentes.length > 5 && (
                  <li className="text-muted-foreground">
                    e mais {pendentes.length - 5}…
                  </li>
                )}
              </ul>
              {/* Confirmar não marca nada: as etapas continuam abertas e ficam
                  registradas como pendentes no histórico da conclusão. */}
              <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={confirmouPendencias}
                  onChange={(e) => setConfirmouPendencias(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                />
                Concluir mesmo assim. As etapas continuam como estão — nenhuma
                será marcada automaticamente.
              </label>
            </div>
          )}

          <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
            Ao concluir, o atendimento passa para <strong>Concluído</strong> e o
            cliente é avisado. Este status é final: reabertura terá regra própria.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={processando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className={cn("gap-1.5")}
            onClick={concluir}
            disabled={processando || faltaConfirmar}
          >
            {processando ? "Concluindo…" : "Concluir atendimento"}
          </Button>
        </footer>
      </div>
    </div>
  );
};
