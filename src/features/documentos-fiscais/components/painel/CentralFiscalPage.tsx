"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  FileUp,
  Filter,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reprocessarDocumentoFiscalAction } from "../../actions/reprocessar-documento";
import { ROTA_DOCUMENTOS_FISCAIS } from "../../constants/rotas";
import { formatarIdentificacaoFiscal } from "../../lib/identidade-fiscal";
import type {
  DocumentoFiscalDaLista,
  ResumoDocumentosFiscais,
} from "../../queries/listar-documentos-fiscais";
import type { FiltrosDocumentosFiscaisValidados } from "../../schemas/filtros-documentos-fiscais";
import { montarBuscaDocumentosFiscais } from "../../schemas/filtros-documentos-fiscais";
import {
  BadgeProcessamento,
  BadgeRevisao,
  BadgeSentido,
  BadgeSituacao,
} from "./badges-fiscais";
import { ImportarXmlDialog } from "./ImportarXmlDialog";

/**
 * Central Fiscal — a primeira tela operacional dos documentos importados.
 *
 * Filtro, busca e paginação vivem na URL e são resolvidos no servidor: a tela
 * nunca recebe documento que o filtro descartou, e recarregar mantém a vista.
 * As permissões chegam prontas do servidor e decidem só o que aparece — cada
 * ação é conferida de novo lá.
 *
 * No celular a mesma lista vira cartões: espremer dez colunas numa tela de
 * telefone esconderia justamente o que o contador precisa ler.
 */

type Contribuinte = { id: string | null; nome: string | null; identificacaoFiscal: string | null };

type Props = {
  documentos: DocumentoFiscalDaLista[];
  resumo: ResumoDocumentosFiscais;
  pagina: number;
  totalPaginas: number;
  filtros: FiltrosDocumentosFiscaisValidados;
  contribuintes: Contribuinte[];
  permissoes: { enviar: boolean; revisar: boolean; baixar: boolean };
};

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarValor(valor: string | null) {
  if (!valor) return "—";
  const numero = Number(valor);
  return Number.isFinite(numero) ? dinheiro.format(numero) : valor;
}

/** `2026-09-15` → `15/09/2026`, sem passar por fuso nenhum. */
function formatarData(data: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

function formatarDataHora(data: Date) {
  return new Date(data).toLocaleDateString("pt-BR");
}

/** Só o fim da chave: identifica a nota sem despejar 44 caracteres na tela. */
function finalDaChave(chave: string | null) {
  return chave ? `····${chave.slice(-8)}` : null;
}

function nomeDoContribuinte(documento: DocumentoFiscalDaLista) {
  return documento.clienteNome ?? "Escritório";
}

export function CentralFiscalPage({
  documentos,
  resumo,
  pagina,
  totalPaginas,
  filtros,
  contribuintes,
  permissoes,
}: Props) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState(filtros.busca ?? "");
  const [reprocessando, setReprocessando] = useState<string | null>(null);

  function aplicar(mudancas: Partial<Record<string, string | number | null>>) {
    const proximo = {
      cliente: filtros.cliente,
      sentido: filtros.sentido,
      processamento: filtros.processamento,
      revisao: filtros.revisao,
      de: filtros.de,
      ate: filtros.ate,
      busca: filtros.busca,
      pagina: 1,
      ...mudancas,
    };
    iniciarTransicao(() => {
      router.push(`${ROTA_DOCUMENTOS_FISCAIS}${montarBuscaDocumentosFiscais(proximo)}`);
    });
  }

  async function reprocessar(documentoId: string) {
    setReprocessando(documentoId);
    const resultado = await reprocessarDocumentoFiscalAction(documentoId);
    setReprocessando(null);
    if (resultado.sucesso) toast.success(resultado.mensagem);
    else toast.error(resultado.mensagem);
    iniciarTransicao(() => router.refresh());
  }

  const temFiltro = Boolean(
    filtros.cliente || filtros.sentido || filtros.processamento || filtros.revisao || filtros.de || filtros.ate || filtros.busca,
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold">Documentos Fiscais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As NF-e importadas dos seus clientes, com o que o próprio XML declara.
          </p>
        </div>
        {permissoes.enviar && (
          <Button onClick={() => setImportando(true)}>
            <FileUp className="size-4" /> Importar XML
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { rotulo: "Documentos", valor: resumo.total },
          { rotulo: "Emitidas", valor: resumo.emitidas },
          { rotulo: "Recebidas", valor: resumo.recebidas },
          { rotulo: "Não interpretadas", valor: resumo.comFalha },
        ].map((item) => (
          <Card key={item.rotulo} className="border-amber-500/15 shadow-card">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.rotulo}</p>
              <p className="mt-1 font-serif text-2xl font-bold">{item.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-amber-500/15 shadow-card">
        <CardContent className="space-y-4 p-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(evento) => {
              evento.preventDefault();
              aplicar({ busca: busca.trim() || null });
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar documentos fiscais"
                placeholder="Número, chave de acesso, CPF/CNPJ, emitente ou destinatário"
                className="pl-9"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              <Filter className="size-4" /> Filtrar
            </Button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="filtro-contribuinte" className="text-xs">
                Contribuinte
              </Label>
              <select
                id="filtro-contribuinte"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filtros.cliente ?? ""}
                onChange={(evento) => aplicar({ cliente: evento.target.value || null })}
              >
                <option value="">Todos</option>
                {contribuintes.map((contribuinte) => (
                  <option
                    key={contribuinte.id ?? "sem_cliente"}
                    value={contribuinte.id ?? "sem_cliente"}
                  >
                    {contribuinte.nome ?? "Escritório"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-sentido" className="text-xs">
                Sentido
              </Label>
              <select
                id="filtro-sentido"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filtros.sentido ?? ""}
                onChange={(evento) => aplicar({ sentido: evento.target.value || null })}
              >
                <option value="">Todos</option>
                <option value="emitido">Emitidas</option>
                <option value="recebido">Recebidas</option>
                <option value="nao_determinado">Não determinado</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-processamento" className="text-xs">
                Processamento
              </Label>
              <select
                id="filtro-processamento"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filtros.processamento ?? ""}
                onChange={(evento) => aplicar({ processamento: evento.target.value || null })}
              >
                <option value="">Todos</option>
                <option value="processado">Processado</option>
                <option value="falhou">Não interpretado</option>
                <option value="pendente">Aguardando</option>
                <option value="processando">Processando</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-revisao" className="text-xs">
                Revisão
              </Label>
              <select
                id="filtro-revisao"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={filtros.revisao ?? ""}
                onChange={(evento) => aplicar({ revisao: evento.target.value || null })}
              >
                <option value="">Todas</option>
                <option value="pendente">Pendente</option>
                <option value="revisado">Revisado</option>
                <option value="com_divergencia">Com divergência</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="filtro-de" className="text-xs">
                  Emissão de
                </Label>
                <Input
                  id="filtro-de"
                  type="date"
                  value={filtros.de ?? ""}
                  onChange={(evento) => aplicar({ de: evento.target.value || null })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="filtro-ate" className="text-xs">
                  até
                </Label>
                <Input
                  id="filtro-ate"
                  type="date"
                  value={filtros.ate ?? ""}
                  onChange={(evento) => aplicar({ ate: evento.target.value || null })}
                />
              </div>
            </div>
          </div>

          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca("");
                iniciarTransicao(() => router.push(ROTA_DOCUMENTOS_FISCAIS));
              }}
            >
              Limpar filtros
            </Button>
          )}
        </CardContent>
      </Card>

      {documentos.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center">
          <FileText className="size-10 text-muted-foreground" />
          <h2 className="mt-3 font-serif text-xl font-semibold">
            {temFiltro ? "Nenhum documento com esses filtros" : "Nenhum documento fiscal importado"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {temFiltro
              ? "Ajuste o período, o contribuinte ou a busca para encontrar o que procura."
              : "Importe os XMLs de NF-e dos seus clientes para começar a organizar os documentos fiscais."}
          </p>
          {temFiltro ? (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setBusca("");
                iniciarTransicao(() => router.push(ROTA_DOCUMENTOS_FISCAIS));
              }}
            >
              Limpar filtros
            </Button>
          ) : (
            permissoes.enviar && (
              <Button className="mt-4" onClick={() => setImportando(true)}>
                <FileUp className="size-4" /> Importar XML
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          {/* Desktop: tabela. */}
          <Card className="hidden border-amber-500/15 shadow-card md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Contribuinte</TableHead>
                    <TableHead>Emitente / Destinatário</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentos.map((documento) => (
                    <TableRow key={documento.id}>
                      <TableCell>
                        <div className="font-medium">
                          {documento.tipo === "nfce" ? "NFC-e" : "NF-e"}{" "}
                          {documento.numero ? `nº ${documento.numero}` : "sem número"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {documento.serie ? `Série ${documento.serie}` : "Série —"}
                          {finalDaChave(documento.chaveAcesso)
                            ? ` · ${finalDaChave(documento.chaveAcesso)}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{formatarData(documento.dataEmissao)}</div>
                        <div className="text-xs text-muted-foreground">
                          Importado em {formatarDataHora(documento.importadoEm)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-40 truncate">{nomeDoContribuinte(documento)}</div>
                        <div className="mt-1">
                          <BadgeSentido sentido={documento.sentido} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-56 truncate text-sm">
                          {documento.emitenteNome ?? "—"}
                        </div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">
                          {documento.emitenteIdentificacao
                            ? formatarIdentificacaoFiscal(documento.emitenteIdentificacao)
                            : ""}
                          {documento.destinatarioNome ? ` → ${documento.destinatarioNome}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatarValor(documento.valorTotal)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <BadgeProcessamento status={documento.statusProcessamento} />
                          <BadgeRevisao status={documento.statusRevisao} />
                          <BadgeSituacao situacao={documento.situacao} />
                        </div>
                        {documento.contribuinteSemIdentidade &&
                          documento.statusProcessamento === "processado" && (
                            <p className="mt-1 max-w-64 text-xs text-muted-foreground">
                              Cadastre o CPF/CNPJ do cliente para identificar notas emitidas e
                              recebidas.
                            </p>
                          )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <AcoesDoDocumento
                            documento={documento}
                            permissoes={permissoes}
                            reprocessando={reprocessando === documento.id}
                            aoReprocessar={() => void reprocessar(documento.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Celular e tablet estreito: cartões. */}
          <div className="grid gap-3 md:hidden">
            {documentos.map((documento) => (
              <Card key={documento.id} className="border-amber-500/15 shadow-card">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {documento.tipo === "nfce" ? "NFC-e" : "NF-e"}{" "}
                        {documento.numero ? `nº ${documento.numero}` : "sem número"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatarData(documento.dataEmissao)} · {nomeDoContribuinte(documento)}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">{formatarValor(documento.valorTotal)}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {documento.emitenteNome ?? "—"}
                    {documento.destinatarioNome ? ` → ${documento.destinatarioNome}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <BadgeSentido sentido={documento.sentido} />
                    <BadgeProcessamento status={documento.statusProcessamento} />
                    <BadgeRevisao status={documento.statusRevisao} />
                  </div>
                  {documento.contribuinteSemIdentidade &&
                    documento.statusProcessamento === "processado" && (
                      <p className="text-xs text-muted-foreground">
                        Cadastre o CPF/CNPJ do cliente para identificar notas emitidas e recebidas.
                      </p>
                    )}
                  <div className="flex flex-wrap gap-2">
                    <AcoesDoDocumento
                      documento={documento}
                      permissoes={permissoes}
                      reprocessando={reprocessando === documento.id}
                      aoReprocessar={() => void reprocessar(documento.id)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Página {pagina} de {totalPaginas} · {resumo.total}{" "}
              {resumo.total === 1 ? "documento" : "documentos"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || pendente}
                onClick={() => aplicar({ pagina: pagina - 1 })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas || pendente}
                onClick={() => aplicar({ pagina: pagina + 1 })}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      <ImportarXmlDialog
        aberto={importando}
        onOpenChange={setImportando}
        clienteId={filtros.cliente && filtros.cliente !== "sem_cliente" ? filtros.cliente : null}
        aoConcluir={() => iniciarTransicao(() => router.refresh())}
      />
    </div>
  );
}

function AcoesDoDocumento({
  documento,
  permissoes,
  reprocessando,
  aoReprocessar,
}: {
  documento: DocumentoFiscalDaLista;
  permissoes: { revisar: boolean; baixar: boolean };
  reprocessando: boolean;
  aoReprocessar: () => void;
}) {
  return (
    <>
      {permissoes.revisar && (
        <Button variant="outline" size="sm" disabled={reprocessando} onClick={aoReprocessar}>
          {reprocessando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCcw className="size-4" />
          )}
          Reprocessar
        </Button>
      )}
      {permissoes.baixar && documento.arquivoId && (
        // Rota autorizada no servidor: nada de URL pública nem caminho do storage.
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/api/documentos-fiscais/${documento.id}/arquivos/${documento.arquivoId}`}
            download
          >
            <Download className="size-4" /> XML
          </a>
        </Button>
      )}
    </>
  );
}
