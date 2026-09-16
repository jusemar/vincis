"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  dividirEmLotesDeUpload,
  MENSAGENS_UPLOAD_FISCAL,
  QUANTIDADE_MAXIMA_LOTE_XML_FISCAL,
  TAMANHO_MAXIMO_LOTE_XML_FISCAL,
  TAMANHO_MAXIMO_XML_FISCAL,
} from "../../constants/upload";

/**
 * Importação de XML de NF-e.
 *
 * Os limites não são reescritos aqui: vêm de `constants/upload`, os mesmos que o
 * servidor aplica. Como um lote é uma requisição, a seleção é dividida em lotes
 * que caibam (quantidade e soma de bytes, por `excedeLimitesDoLote`) e cada um é
 * enviado na sequência — 300 XMLs entram sem uma requisição gigante. Os
 * resultados dos lotes são consolidados numa lista só.
 *
 * Arquivo maior que o teto individual é apontado aqui mesmo, sem ocupar espaço
 * de um lote; o resto do envio continua. Um arquivo nunca derruba o lote: cada
 * um tem o seu resultado, com o texto que o próprio servidor devolveu.
 */

type ResultadoArquivo = {
  nome: string;
  codigo: string;
  mensagem: string;
};

type RespostaLote = {
  sucesso: boolean;
  codigo?: string;
  mensagem?: string;
  arquivos?: ResultadoArquivo[];
};

const CLASSE_POR_CODIGO: Record<string, string> = {
  ACEITO: "badge-success",
  DOCUMENTO_DUPLICADO: "badge-info",
  ARQUIVO_DUPLICADO: "badge-info",
  DOCUMENTO_NAO_INTERPRETADO: "badge-warning",
};

const ROTULO_POR_CODIGO: Record<string, string> = {
  ACEITO: "Importado",
  DOCUMENTO_DUPLICADO: "Já existente",
  ARQUIVO_DUPLICADO: "Já existente",
  DOCUMENTO_NAO_INTERPRETADO: "Não interpretado",
};

export function ImportarXmlDialog({
  aberto,
  onOpenChange,
  clienteId,
  aoConcluir,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Contribuinte selecionado no filtro, quando houver. */
  clienteId: string | null;
  aoConcluir: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [selecionados, setSelecionados] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoArquivo[] | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  function limpar() {
    setSelecionados([]);
    setResultados(null);
    setErroGeral(null);
    if (entrada.current) entrada.current.value = "";
  }

  async function enviar() {
    if (selecionados.length === 0) return;
    setEnviando(true);
    setErroGeral(null);

    // Arquivo acima do teto individual nem sai do navegador.
    const grandes = selecionados.filter((arquivo) => arquivo.size > TAMANHO_MAXIMO_XML_FISCAL);
    const enviaveis = selecionados.filter((arquivo) => arquivo.size <= TAMANHO_MAXIMO_XML_FISCAL);
    const consolidado: ResultadoArquivo[] = grandes.map((arquivo) => ({
      nome: arquivo.name,
      codigo: "ARQUIVO_MUITO_GRANDE",
      mensagem: MENSAGENS_UPLOAD_FISCAL.ARQUIVO_MUITO_GRANDE,
    }));

    try {
      for (const lote of dividirEmLotesDeUpload(enviaveis)) {
        const formulario = new FormData();
        for (const arquivo of lote) formulario.append("arquivos", arquivo);
        if (clienteId) formulario.append("clienteId", clienteId);

        const resposta = await fetch("/api/documentos-fiscais/xml", {
          method: "POST",
          body: formulario,
        });
        const corpo = (await resposta.json().catch(() => null)) as RespostaLote | null;

        if (!corpo?.sucesso) {
          // Recusa do lote inteiro: a mensagem é a do servidor, e os arquivos
          // deste lote ficam registrados como não enviados.
          setErroGeral(corpo?.mensagem ?? "Não foi possível enviar os arquivos.");
          for (const arquivo of lote) {
            consolidado.push({
              nome: arquivo.name,
              codigo: corpo?.codigo ?? "FALHA",
              mensagem: corpo?.mensagem ?? "Não enviado.",
            });
          }
          continue;
        }
        consolidado.push(...(corpo.arquivos ?? []));
      }
      setResultados(consolidado);
      aoConcluir();
    } catch {
      setErroGeral("Não foi possível falar com o servidor. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const totalBytes = selecionados.reduce((soma, arquivo) => soma + arquivo.size, 0);
  const contagem = (codigos: string[]) =>
    (resultados ?? []).filter((item) => codigos.includes(item.codigo)).length;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(estado) => {
        if (!estado) limpar();
        onOpenChange(estado);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Importar XML</DialogTitle>
          <DialogDescription>
            Selecione os XMLs de NF-e. Até {QUANTIDADE_MAXIMA_LOTE_XML_FISCAL} arquivos e{" "}
            {(TAMANHO_MAXIMO_LOTE_XML_FISCAL / (1024 * 1024)).toFixed(1).replace(".", ",")} MB por
            envio — seleções maiores são divididas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="importar-xml">Arquivos XML</Label>
            <input
              id="importar-xml"
              ref={entrada}
              type="file"
              multiple
              accept=".xml,application/xml,text/xml"
              className="block w-full rounded-md border bg-background p-2 text-sm"
              onChange={(evento) => {
                setSelecionados(Array.from(evento.target.files ?? []));
                setResultados(null);
                setErroGeral(null);
              }}
            />
            {selecionados.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selecionados.length}{" "}
                {selecionados.length === 1 ? "arquivo selecionado" : "arquivos selecionados"} ·{" "}
                {(totalBytes / (1024 * 1024)).toFixed(2).replace(".", ",")} MB ·{" "}
                {dividirEmLotesDeUpload(selecionados).length}{" "}
                {dividirEmLotesDeUpload(selecionados).length === 1 ? "envio" : "envios"}
              </p>
            )}
          </div>

          {erroGeral && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erroGeral}</p>
          )}

          {resultados && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1">
                  {resultados.length} enviados
                </span>
                <span className="badge-success rounded-full px-2.5 py-1">
                  {contagem(["ACEITO"])} importados
                </span>
                <span className="badge-info rounded-full px-2.5 py-1">
                  {contagem(["DOCUMENTO_DUPLICADO", "ARQUIVO_DUPLICADO"])} já existentes
                </span>
                <span className="badge-warning rounded-full px-2.5 py-1">
                  {contagem(["DOCUMENTO_NAO_INTERPRETADO"])} não interpretados
                </span>
              </div>
              <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-3">
                {resultados.map((item, indice) => (
                  <li key={`${item.nome}-${indice}`} className="flex flex-col gap-1 border-b pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.nome}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                          CLASSE_POR_CODIGO[item.codigo] ?? "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {ROTULO_POR_CODIGO[item.codigo] ?? "Recusado"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.mensagem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {resultados ? "Fechar" : "Cancelar"}
            </Button>
            <Button onClick={() => void enviar()} disabled={enviando || selecionados.length === 0}>
              {enviando ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <FileUp className="size-4" /> Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
