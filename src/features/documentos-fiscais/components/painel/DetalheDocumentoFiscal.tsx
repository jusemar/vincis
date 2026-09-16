"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  FileWarning,
  Loader2,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reprocessarDocumentoFiscalAction } from "../../actions/reprocessar-documento";
import {
  marcarDocumentoFiscalRevisado,
  reabrirRevisaoDocumentoFiscal,
} from "../../actions/revisar-documento";
import { ROTA_DOCUMENTOS_FISCAIS } from "../../constants/rotas";
import {
  formatarChaveAcesso,
  formatarDataFiscal,
  formatarInstanteFiscal,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
  formatarValorUnitario,
} from "../../lib/formatacao-fiscal";
import { formatarIdentificacaoFiscal } from "../../lib/identidade-fiscal";
import type { DocumentoFiscalDetalhado } from "../../queries/obter-documento-fiscal";
import {
  BadgeProcessamento,
  BadgeRevisao,
  BadgeSentido,
  BadgeSituacao,
} from "./badges-fiscais";

/**
 * Detalhe da NF-e — o que o XML declarou, em ordem de leitura.
 *
 * Nada aqui é calculado: todos os números vêm da extração vigente, como texto,
 * e são formatados sem passar por `number`. O protocolo é apresentado como o que
 * é — um registro presente no arquivo —, e a situação fiscal continua a que o
 * documento tem, porque conferir com a autoridade fiscal é outra coisa.
 *
 * A revisão é humana e reversível: marca que alguém autorizado conferiu a
 * leitura, sem afirmar nada sobre a operação nem sobre os tributos.
 */

type Detalhe = NonNullable<DocumentoFiscalDetalhado>;
type Parte = Detalhe["emitente"];
type Item = Detalhe["itens"][number];
type Tributo = Item["tributos"][number];

const NOMES_DE_TRIBUTO: Record<string, string> = {
  icms: "ICMS",
  icms_st: "ICMS-ST",
  icms_uf_destino: "ICMS UF destino",
  fcp: "FCP",
  fcp_st: "FCP-ST",
  ipi: "IPI",
  ii: "II",
  pis: "PIS",
  pis_st: "PIS-ST",
  cofins: "COFINS",
  cofins_st: "COFINS-ST",
  iss: "ISS",
  irrf: "IRRF",
  csll: "CSLL",
  inss: "INSS",
  ibs: "IBS",
  cbs: "CBS",
  is: "Imposto Seletivo",
};

/** Tributo sem nome conhecido ainda aparece — IBS, CBS e o que vier depois. */
function nomeDoTributo(codigo: string) {
  return NOMES_DE_TRIBUTO[codigo] ?? codigo.replaceAll("_", " ").toUpperCase();
}

function Secao({
  titulo,
  descricao,
  children,
  acao,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <Card className="border-amber-500/15 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg font-semibold">{titulo}</h2>
            {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
          </div>
          {acao}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 break-words text-sm">{valor || "—"}</p>
    </div>
  );
}

function DadosDaParte({ parte, papel }: { parte: Parte; papel: string }) {
  if (!parte) {
    return (
      <Secao titulo={papel}>
        <p className="text-sm text-muted-foreground">
          O documento não traz {papel.toLowerCase()}.
        </p>
      </Secao>
    );
  }
  const endereco = [parte.logradouro, parte.numero, parte.complemento].filter(Boolean).join(", ");
  const municipio = [parte.municipio, parte.uf].filter(Boolean).join(" / ");
  return (
    <Secao titulo={papel} descricao="Como estava escrito na nota.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome / razão social" valor={parte.nome} />
        <Campo
          rotulo={parte.tipoIdentificacao === "cpf" ? "CPF" : "CNPJ"}
          valor={formatarIdentificacaoFiscal(parte.identificacao)}
        />
        {parte.nomeFantasia && <Campo rotulo="Nome fantasia" valor={parte.nomeFantasia} />}
        <Campo rotulo="Inscrição estadual" valor={parte.inscricaoEstadual} />
        <Campo rotulo="Endereço" valor={[endereco, parte.bairro].filter(Boolean).join(" · ")} />
        <Campo rotulo="Município / UF" valor={municipio} />
        {parte.cep && <Campo rotulo="CEP" valor={parte.cep} />}
        {parte.telefone && <Campo rotulo="Telefone" valor={parte.telefone} />}
        {parte.email && <Campo rotulo="E-mail" valor={parte.email} />}
      </div>
    </Secao>
  );
}

function TabelaDeTributos({ tributos }: { tributos: Tributo[] }) {
  if (tributos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum tributo declarado para este item.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {tributos.map((tributo) => (
        <div key={tributo.id} className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{nomeDoTributo(tributo.tributo)}</span>
            {tributo.retido && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Retido</span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Campo rotulo="CST/CSOSN" valor={tributo.codigoSituacao} />
            <Campo rotulo="Base" valor={formatarMoeda(tributo.baseCalculo)} />
            <Campo rotulo="Alíquota" valor={formatarPercentual(tributo.aliquotaPercentual)} />
            <Campo rotulo="Valor" valor={formatarMoeda(tributo.valor)} />
          </div>
          {tributo.classificacaoTributaria && (
            <p className="mt-2 text-xs text-muted-foreground">
              Classificação tributária: {tributo.classificacaoTributaria}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function DetalheDocumentoFiscal({
  detalhe,
  voltarPara,
}: {
  detalhe: Detalhe;
  voltarPara: string;
}) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [processando, setProcessando] = useState<"revisao" | "reprocesso" | null>(null);
  const [itemAberto, setItemAberto] = useState<string | null>(null);

  const { documento, emitente, destinatario, itens, tributosDoDocumento } = detalhe;
  const interpretado = documento.statusProcessamento === "processado";

  async function executar(acao: "revisar" | "reabrir" | "reprocessar") {
    setProcessando(acao === "reprocessar" ? "reprocesso" : "revisao");
    const resultado =
      acao === "reprocessar"
        ? await reprocessarDocumentoFiscalAction(documento.id)
        : acao === "revisar"
          ? await marcarDocumentoFiscalRevisado(documento.id)
          : await reabrirRevisaoDocumentoFiscal(documento.id);
    setProcessando(null);
    if (resultado.sucesso) toast.success(resultado.mensagem);
    else toast.error(resultado.mensagem);
    iniciarTransicao(() => router.refresh());
  }

  const titulo = `${documento.tipo === "nfce" ? "NFC-e" : "NF-e"} ${
    documento.numero ? `nº ${documento.numero}` : "sem número"
  }${documento.serie ? ` — Série ${documento.serie}` : ""}`;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`${ROTA_DOCUMENTOS_FISCAIS}${voltarPara}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Documentos Fiscais
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Emissão {formatarDataFiscal(documento.dataEmissao)} ·{" "}
            {documento.clienteNome ?? "Escritório"} · Importado em{" "}
            {formatarInstanteFiscal(documento.importadoEm)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <BadgeSentido sentido={documento.sentido} />
            <BadgeProcessamento status={documento.statusProcessamento} />
            <BadgeRevisao status={documento.statusRevisao} />
            <BadgeSituacao situacao={documento.situacao} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {detalhe.permissoes.revisar && (
            <>
              {documento.statusRevisao === "revisado" ? (
                <Button
                  variant="outline"
                  disabled={processando !== null || pendente}
                  onClick={() => void executar("reabrir")}
                >
                  <RotateCcw className="size-4" /> Reabrir revisão
                </Button>
              ) : (
                <Button
                  disabled={processando !== null || pendente || !interpretado}
                  onClick={() => void executar("revisar")}
                >
                  {processando === "revisao" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Marcar como revisado
                </Button>
              )}
              <Button
                variant="outline"
                disabled={processando !== null || pendente}
                onClick={() => void executar("reprocessar")}
              >
                {processando === "reprocesso" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Reprocessar
              </Button>
            </>
          )}
          {detalhe.permissoes.baixar && detalhe.arquivoOriginal && (
            <Button variant="outline" asChild>
              <a
                href={`/api/documentos-fiscais/${documento.id}/arquivos/${detalhe.arquivoOriginal.id}`}
                download
              >
                <Download className="size-4" /> Baixar XML
              </a>
            </Button>
          )}
        </div>
      </div>

      {documento.statusRevisao === "revisado" && (
        <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          ✓ Dados extraídos revisados{documento.revisadoPorNome ? ` por ${documento.revisadoPorNome}` : ""}{" "}
          em {formatarInstanteFiscal(documento.revisadoEm)}. A revisão confirma a leitura do XML — não a
          situação na SEFAZ nem a apuração dos tributos.
        </p>
      )}

      {!interpretado && (
        <Secao
          titulo="Não foi possível interpretar este XML"
          descricao="O arquivo original continua guardado e pode ser reprocessado quando o leitor fiscal evoluir."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Arquivo" valor={detalhe.arquivoOriginal?.nomeOriginal} />
            <Campo rotulo="Importado em" valor={formatarInstanteFiscal(documento.importadoEm)} />
            <Campo
              rotulo="Motivo registrado"
              valor={
                (detalhe.extracaoVigente?.erros as { codigo?: string } | null)?.codigo ??
                (detalhe.historicoExtracoes[0]?.erros as { codigo?: string } | null)?.codigo ??
                "Leitura não concluída"
              }
            />
            <Campo
              rotulo="Caminho no leiaute"
              valor={
                (detalhe.historicoExtracoes[0]?.erros as { caminho?: string } | null)?.caminho ?? "—"
              }
            />
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileWarning className="size-4" /> Nenhum dado fiscal foi registrado para este documento.
          </p>
        </Secao>
      )}

      {interpretado && (
        <>
          <Secao titulo="Valores declarados" descricao="Os totais como vieram no XML — nada é recalculado.">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Campo rotulo="Produtos" valor={formatarMoeda(documento.valorProdutos)} />
              <Campo rotulo="Frete" valor={formatarMoeda(documento.valorFrete)} />
              <Campo rotulo="Seguro" valor={formatarMoeda(documento.valorSeguro)} />
              <Campo rotulo="Desconto" valor={formatarMoeda(documento.valorDesconto)} />
              <Campo rotulo="Outras despesas" valor={formatarMoeda(documento.valorOutrasDespesas)} />
              {documento.valorServicos && (
                <Campo rotulo="Serviços" valor={formatarMoeda(documento.valorServicos)} />
              )}
              <div className="sm:col-span-1">
                <p className="text-xs text-muted-foreground">Total da nota</p>
                <p className="mt-0.5 font-serif text-xl font-bold">
                  {formatarMoeda(documento.valorTotal)}
                </p>
              </div>
            </div>
          </Secao>

          <div className="grid gap-4 lg:grid-cols-2">
            <DadosDaParte parte={emitente} papel="Emitente" />
            <DadosDaParte parte={destinatario} papel="Destinatário" />
          </div>

          <Secao
            titulo="Itens da NF-e"
            descricao={`${itens.length} ${itens.length === 1 ? "item declarado" : "itens declarados"}.`}
          >
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">O documento não traz itens.</p>
            ) : (
              <>
                {/* Desktop: tabela; o detalhe tributário abre por item. */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>NCM / CFOP</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Unitário</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Tributos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item) => (
                        <Fragment key={item.id}>
                          <TableRow>
                            <TableCell className="align-top">{item.numeroItem}</TableCell>
                            <TableCell className="align-top">
                              <div className="max-w-72 truncate font-medium">{item.descricao ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.codigoProduto ?? "sem código"}
                                {item.gtin ? ` · ${item.gtin}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-sm">
                              <div>{item.ncm ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                CFOP {item.cfop ?? "—"}
                                {item.cest ? ` · CEST ${item.cest}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-right">
                              {formatarQuantidade(item.quantidade)} {item.unidade ?? ""}
                            </TableCell>
                            <TableCell className="align-top text-right">
                              {formatarValorUnitario(item.valorUnitario)}
                            </TableCell>
                            <TableCell className="align-top text-right font-medium">
                              {formatarMoeda(item.valorBruto)}
                              {item.valorDesconto && (
                                <div className="text-xs text-muted-foreground">
                                  desconto {formatarMoeda(item.valorDesconto)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setItemAberto((atual) => (atual === item.id ? null : item.id))
                                }
                              >
                                {item.tributos.length}{" "}
                                {itemAberto === item.id ? "ocultar" : "ver"}
                              </Button>
                            </TableCell>
                          </TableRow>
                          {itemAberto === item.id && (
                            <TableRow>
                              <TableCell colSpan={7} className="bg-muted/20">
                                <TabelaDeTributos tributos={item.tributos} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Celular: um cartão por item, com os tributos dentro. */}
                <div className="grid gap-3 md:hidden">
                  {itens.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {item.numeroItem}. {item.descricao ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.codigoProduto ?? "sem código"} · NCM {item.ncm ?? "—"} · CFOP{" "}
                            {item.cfop ?? "—"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium">
                          {formatarMoeda(item.valorBruto)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatarQuantidade(item.quantidade)} {item.unidade ?? ""} ×{" "}
                        {formatarValorUnitario(item.valorUnitario)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 px-0"
                        onClick={() => setItemAberto((atual) => (atual === item.id ? null : item.id))}
                      >
                        {itemAberto === item.id ? "Ocultar tributos" : `Tributos (${item.tributos.length})`}
                      </Button>
                      {itemAberto === item.id && (
                        <div className="mt-2">
                          <TabelaDeTributos tributos={item.tributos} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Secao>

          <Secao
            titulo="Tributos declarados no documento"
            descricao="Totais e retenções como o XML os apresenta. O Vincis ainda não apura imposto."
          >
            {tributosDoDocumento.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                O documento não traz totais de tributos próprios.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tributosDoDocumento.map((tributo) => (
                  <div key={tributo.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{nomeDoTributo(tributo.tributo)}</span>
                      {tributo.retido && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Retido</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <Campo rotulo="Base" valor={formatarMoeda(tributo.baseCalculo)} />
                      <Campo rotulo="Valor" valor={formatarMoeda(tributo.valor)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>
        </>
      )}

      <Secao titulo="Protocolo e eventos" descricao="O que está registrado no arquivo recebido.">
        {detalhe.eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O XML não traz protocolo. A situação fiscal segue não verificada.
          </p>
        ) : (
          <div className="space-y-3">
            {detalhe.eventos.map((evento) => {
              const dados = (evento.dadosEspecificos ?? {}) as Record<string, string | null>;
              return (
                <div key={evento.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {evento.tipo === "autorizacao"
                      ? "Protocolo de autorização presente no XML"
                      : evento.tipo === "denegacao"
                        ? "Denegação registrada no XML"
                        : `Evento ${evento.tipo}`}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <Campo rotulo="Protocolo" valor={evento.protocolo} />
                    <Campo rotulo="Data/hora" valor={formatarInstanteFiscal(evento.ocorridoEm)} />
                    <Campo rotulo="Status declarado" valor={dados.codigoStatus} />
                    <Campo rotulo="Motivo" valor={dados.motivo} />
                  </div>
                </div>
              );
            })}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Isto é o que o arquivo declara. A Vincis não consultou a SEFAZ, então a situação fiscal
              continua como está no documento.
            </p>
          </div>
        )}
      </Secao>

      <Secao titulo="Documento e arquivo original">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Modelo" valor={documento.modelo} />
          <Campo rotulo="Versão do leiaute" valor={documento.versaoLeiaute} />
          <Campo rotulo="Emissão" valor={formatarInstanteFiscal(documento.emitidoEm)} />
          <Campo rotulo="Processado em" valor={formatarInstanteFiscal(documento.processadoEm)} />
          <Campo rotulo="Arquivo" valor={detalhe.arquivoOriginal?.nomeOriginal} />
          <Campo
            rotulo="Tamanho"
            valor={
              detalhe.arquivoOriginal
                ? `${(detalhe.arquivoOriginal.tamanhoBytes / 1024).toFixed(1).replace(".", ",")} KB`
                : null
            }
          />
        </div>
        {documento.chaveAcesso && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Chave de acesso</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all text-xs">{formatarChaveAcesso(documento.chaveAcesso)}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(documento.chaveAcesso ?? "");
                  toast.success("Chave de acesso copiada.");
                }}
              >
                <Copy className="size-3.5" /> Copiar
              </Button>
            </div>
          </div>
        )}
      </Secao>

      {detalhe.historicoExtracoes.length > 1 && (
        <Secao
          titulo="Histórico de processamento"
          descricao="Cada leitura do mesmo arquivo original, em ordem."
        >
          <ul className="space-y-2 text-sm">
            {detalhe.historicoExtracoes.map((extracao) => (
              <li key={extracao.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {formatarInstanteFiscal(extracao.finalizadaEm ?? extracao.createdAt)}
                </span>
                <span>
                  {extracao.provedor} {extracao.versao}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    extracao.status === "concluida"
                      ? "badge-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {extracao.status === "concluida" ? "Processado" : "Falhou"}
                </span>
                {extracao.vigente && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Vigente</span>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}
