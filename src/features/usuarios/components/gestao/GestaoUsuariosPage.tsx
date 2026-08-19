"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  LogOut,
  MessageCircle,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/shared/ThemeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/usuarios";
import {
  desativarUsuarioGestao,
  reativarUsuarioGestao,
} from "../../actions/alterar-status-usuario-gestao";
import { confirmarContaViaWhatsappGestao } from "../../actions/confirmar-conta-whatsapp-gestao";
import { excluirUsuarioGestao } from "../../actions/excluir-usuario-gestao";
import {
  contaVerificada,
  rotuloVerificacao,
} from "../../lib/verificacao-conta";
import { listarUsuariosGestao } from "../../actions/listar-usuarios-gestao";
import type {
  ResultadoListaUsuarios,
  UsuarioGestao,
} from "../../types/gestao-usuarios";

type AcaoConfirmacao = {
  tipo: "desativar" | "excluir" | "confirmar_whatsapp";
  usuario: UsuarioGestao;
} | null;

const PERFIS: Record<string, string> = {
  cliente: "Cliente",
  contador: "Contador",
  advogado: "Advogado",
  profissional: "Profissional",
  colaborador: "Colaborador",
  gestor_vincis: "Gestor da Vincis",
};

/** Categoria técnica declarada — só existe para o Profissional. */
const CATEGORIAS_PROFISSIONAIS: Record<string, string> = {
  advocacia: "Advogado",
  contabilidade: "Contador",
  especialista_fiscal: "Especialista fiscal",
};

const STATUS: Record<string, string> = {
  ativo: "Ativo",
  bloqueado: "Desativado",
  pendente_email: "Pendente",
};
const STATUS_PROFISSIONAL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_analise: "Aguardando análise",
  correcao_solicitada: "Correção solicitada",
  rejeitado: "Rejeitado",
  aprovado: "Aprovado",
};
const FUNCOES: Record<string, string> = {
  proprietario: "Proprietário",
  administrador: "Administrador",
  profissional: "Profissional",
  colaborador: "Colaborador",
};

type GestaoUsuariosPageProps = {
  gestorNome: string;
  resultadoInicial: Pick<
    ResultadoListaUsuarios,
    "usuarios" | "total" | "pagina" | "totalPaginas"
  >;
};

export function GestaoUsuariosPage({
  gestorNome,
  resultadoInicial,
}: GestaoUsuariosPageProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const [usuarios, setUsuarios] = useState(resultadoInicial.usuarios);
  const [total, setTotal] = useState(resultadoInicial.total);
  const [pagina, setPagina] = useState(resultadoInicial.pagina);
  const [totalPaginas, setTotalPaginas] = useState(
    resultadoInicial.totalPaginas,
  );
  const [filtros, setFiltros] = useState({
    busca: "",
    perfil: "todos",
    profissao: "todos",
    modalidade: "todos" as "todos" | "individual" | "escritorio",
    status: "todos",
    statusProfissional: "todos",
    emailVerificado: "todos" as "todos" | "sim" | "nao",
    verificacao: "todos" as "todos" | "nao_verificada" | "email" | "whatsapp",
    empresa: "",
    pagina: 1,
    porPagina: 10,
  });
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const [confirmacao, setConfirmacao] = useState<AcaoConfirmacao>(null);
  const [pendente, iniciarTransicao] = useTransition();

  async function atualizarLista(proximaPagina = filtros.pagina) {
    const resultado = await listarUsuariosGestao({
      ...filtros,
      pagina: proximaPagina,
    });
    if (resultado.sucesso) {
      setUsuarios(resultado.usuarios);
      setTotal(resultado.total);
      setPagina(resultado.pagina);
      setTotalPaginas(resultado.totalPaginas);
      setFiltros((atual) => ({ ...atual, pagina: resultado.pagina }));
    }
    return resultado.sucesso;
  }

  function buscar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    iniciarTransicao(async () => {
      setFiltros((atual) => ({ ...atual, pagina: 1 }));
      const sucesso = await atualizarLista(1);
      if (!sucesso) {
        setErro(true);
        setMensagem("Não foi possível carregar os usuários.");
      }
    });
  }

  function reativar(usuario: UsuarioGestao) {
    iniciarTransicao(async () => {
      const resultado = await reativarUsuarioGestao(usuario.id);
      setErro(!resultado.sucesso);
      setMensagem(resultado.mensagem);
      if (resultado.sucesso) await atualizarLista(pagina);
    });
  }

  function confirmarAcao() {
    if (!confirmacao) return;
    iniciarTransicao(async () => {
      const resultado =
        confirmacao.tipo === "desativar"
          ? await desativarUsuarioGestao(confirmacao.usuario.id)
          : confirmacao.tipo === "confirmar_whatsapp"
            ? await confirmarContaViaWhatsappGestao({
                usuarioId: confirmacao.usuario.id,
              })
            : await excluirUsuarioGestao(confirmacao.usuario.id);

      setConfirmacao(null);
      setErro(!resultado.sucesso);
      setMensagem(resultado.mensagem);
      if (resultado.sucesso) await atualizarLista(pagina);
    });
  }

  async function sair() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  /**
   * Estado da verificação de identidade. Nunca afirma que o e-mail foi
   * confirmado quando só houve confirmação pelo WhatsApp.
   */
  function BadgeVerificacao({ usuario }: { usuario: UsuarioGestao }) {
    const verificada = contaVerificada(usuario);
    return (
      <div className="space-y-1">
        <Badge variant={verificada ? "default" : "secondary"}>
          {rotuloVerificacao(usuario)}
        </Badge>
        <p className="text-xs text-muted-foreground">
          E-mail: {usuario.emailVerificado ? "confirmado" : "pendente"}
        </p>
        {usuario.whatsappVerificado && (
          <p className="text-xs text-muted-foreground">
            {usuario.whatsappVerificadoEm
              ? new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(usuario.whatsappVerificadoEm))
              : null}
            {usuario.whatsappVerificadoPor
              ? ` · por ${usuario.whatsappVerificadoPor}`
              : null}
          </p>
        )}
      </div>
    );
  }

  function AcoesUsuario({ usuario }: { usuario: UsuarioGestao }) {
    const gestor = usuario.perfil === "gestor_vincis";
    // A ação só faz sentido para quem ainda não comprovou identidade e tem
    // número cadastrado. O servidor revalida as duas condições.
    const podeConfirmarWhatsapp =
      !contaVerificada(usuario) && Boolean(usuario.whatsapp);

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {podeConfirmarWhatsapp && (
          <Button
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() =>
              setConfirmacao({ tipo: "confirmar_whatsapp", usuario })
            }
          >
            <MessageCircle className="size-4" /> Confirmar via WhatsApp
          </Button>
        )}
        {usuario.status === "ativo" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pendente || usuario.proprioGestor}
            onClick={() => setConfirmacao({ tipo: "desativar", usuario })}
          >
            <UserX className="size-4" /> Desativar
          </Button>
        )}
        {usuario.status === "bloqueado" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() => reativar(usuario)}
          >
            <UserCheck className="size-4" /> Reativar
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={pendente || usuario.proprioGestor || gestor}
          onClick={() => setConfirmacao({ tipo: "excluir", usuario })}
        >
          <Trash2 className="size-4" /> Excluir
        </Button>
      </div>
    );
  }

  /**
   * Tipo da pessoa. "Individual" e "de escritório" não são tipos diferentes de
   * usuário — são formas de atuação, exibidas separadamente em `formaAtuacao`.
   */
  function classificacao(usuario: UsuarioGestao) {
    if (usuario.perfil === "gestor_vincis") return "Gestor Vincis";
    if (usuario.tipoPrestador === "colaborador") return "Colaborador";
    if (usuario.tipoPrestador === "profissional") return "Profissional";
    return usuario.perfil === "cliente"
      ? "Cliente"
      : (PERFIS[usuario.perfil] ?? usuario.perfil);
  }

  /** Forma de atuação: contexto, nunca identidade. */
  function formaAtuacao(usuario: UsuarioGestao) {
    if (!usuario.tipoPrestador) return null;
    if (usuario.empresaNome) return `Escritório ${usuario.empresaNome}`;
    return "Atua sozinho";
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.1),transparent_32%),hsl(var(--background))]">
      <header className="border-b bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href="/gestao" aria-label="Voltar à gestão">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="truncate font-serif text-lg font-semibold">
                Gestão da Vincis
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {gestorNome}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => void sair()}>
              <LogOut /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users />
            </div>
            <h1 className="mt-4 font-serif text-3xl font-bold">Usuários</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Consulte contas e controle o acesso à plataforma.
            </p>
          </div>
          <form onSubmit={buscar} className="flex w-full max-w-md gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtros.busca}
                onChange={(e) =>
                  setFiltros((atual) => ({ ...atual, busca: e.target.value }))
                }
                maxLength={100}
                placeholder="Buscar por nome ou e-mail"
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={pendente}>
              Buscar
            </Button>
          </form>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={filtros.perfil}
            onChange={(e) =>
              setFiltros((a) => ({ ...a, perfil: e.target.value }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Todos os perfis</option>
            <option value="gestor_vincis">Gestor Vincis</option>
            <option value="cliente">Cliente</option>
            <option value="profissional">Profissional</option>
            <option value="colaborador">Colaborador</option>
          </select>
          <select
            value={filtros.profissao}
            onChange={(e) =>
              setFiltros((a) => ({ ...a, profissao: e.target.value }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Todas as profissões</option>
            <option value="contabilidade">Contador</option>
            <option value="advocacia">Advogado</option>
            <option value="especialista_fiscal">Especialista fiscal</option>
          </select>
          <select
            value={filtros.modalidade}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                modalidade: e.target.value as
                  "todos" | "individual" | "escritorio",
              }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Toda atuação</option>
            <option value="individual">Individual</option>
            <option value="escritorio">Escritório</option>
          </select>
          <select
            value={filtros.status}
            onChange={(e) =>
              setFiltros((a) => ({ ...a, status: e.target.value }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="bloqueado">Desativado</option>
            <option value="pendente_email">Pendente</option>
          </select>
          <select
            value={filtros.verificacao}
            onChange={(e) =>
              setFiltros((a) => ({
                ...a,
                verificacao: e.target.value as
                  | "todos"
                  | "nao_verificada"
                  | "email"
                  | "whatsapp",
              }))
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="todos">Toda verificação</option>
            <option value="nao_verificada">Não verificada</option>
            <option value="email">Verificada por e-mail</option>
            <option value="whatsapp">Verificada via WhatsApp</option>
          </select>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {total} usuário{total === 1 ? "" : "s"} encontrado
          {total === 1 ? "" : "s"}.
        </p>

        {mensagem && (
          <div
            className={`mt-6 flex items-center gap-2 rounded-xl border p-3 text-sm ${erro ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-success/25 bg-success/5 text-success"}`}
          >
            {erro ? (
              <ShieldAlert className="size-4" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {mensagem}
          </div>
        )}

        <Card className="mt-6 overflow-hidden py-0">
          <CardContent className="p-0">
            {usuarios.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Nenhum usuário encontrado.
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Perfil</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Verificação</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Cadastro</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((usuario) => (
                        <TableRow key={usuario.id}>
                          <TableCell>
                            <Link
                              className="font-medium hover:underline"
                              href={`/gestao/usuarios/${usuario.id}`}
                            >
                              {usuario.nome}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {usuario.email}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">
                              {classificacao(usuario)}
                            </p>
                            {usuario.tipoPrestador === "profissional" &&
                              usuario.tipoProfissional && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {CATEGORIAS_PROFISSIONAIS[
                                    usuario.tipoProfissional
                                  ] ?? usuario.tipoProfissional}
                                </p>
                              )}
                            {formaAtuacao(usuario) && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formaAtuacao(usuario)}
                                {usuario.funcaoEmpresa
                                  ? ` · ${FUNCOES[usuario.funcaoEmpresa] ?? usuario.funcaoEmpresa}`
                                  : ""}
                              </p>
                            )}
                            {usuario.statusProfissional && (
                              <Badge
                                className="mt-1"
                                variant={
                                  usuario.statusProfissional ===
                                  "aguardando_analise"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {STATUS_PROFISSIONAL[
                                  usuario.statusProfissional
                                ] ?? usuario.statusProfissional}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                usuario.status === "ativo"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {STATUS[usuario.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <BadgeVerificacao usuario={usuario} />
                          </TableCell>
                          <TableCell>
                            <p className="break-all text-sm">{usuario.email}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {usuario.whatsapp ?? "sem WhatsApp"}
                            </p>
                          </TableCell>
                          <TableCell>
                            {new Intl.DateTimeFormat("pt-BR").format(
                              new Date(usuario.criadoEm),
                            )}
                          </TableCell>
                          <TableCell>
                            <AcoesUsuario usuario={usuario} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="divide-y md:hidden">
                  {usuarios.map((usuario) => (
                    <div key={usuario.id} className="space-y-4 p-4">
                      <div>
                        <Link
                          className="font-medium hover:underline"
                          href={`/gestao/usuarios/${usuario.id}`}
                        >
                          {usuario.nome}
                        </Link>
                        <p className="break-all text-sm text-muted-foreground">
                          {usuario.email}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Perfil
                          </p>
                          {classificacao(usuario)}
                          {usuario.empresaNome && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {usuario.empresaNome}
                            </p>
                          )}
                          {usuario.statusProfissional && (
                            <p className="mt-1 text-xs font-medium">
                              {STATUS_PROFISSIONAL[usuario.statusProfissional]}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Situação
                          </p>
                          {STATUS[usuario.status]}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Verificação
                          </p>
                          <BadgeVerificacao usuario={usuario} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            WhatsApp
                          </p>
                          <span className="tabular-nums">
                            {usuario.whatsapp ?? "não informado"}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Cadastro
                          </p>
                          {new Intl.DateTimeFormat("pt-BR").format(
                            new Date(usuario.criadoEm),
                          )}
                        </div>
                      </div>
                      <AcoesUsuario usuario={usuario} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm sm:flex-row">
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pendente || pagina <= 1}
              onClick={() =>
                iniciarTransicao(() => void atualizarLista(pagina - 1))
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pendente || pagina >= totalPaginas}
              onClick={() =>
                iniciarTransicao(() => void atualizarLista(pagina + 1))
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      </main>

      <AlertDialog
        open={Boolean(confirmacao)}
        onOpenChange={(aberto) => !aberto && setConfirmacao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "excluir"
                ? "Excluir conta definitivamente?"
                : confirmacao?.tipo === "confirmar_whatsapp"
                  ? "Confirmar identidade via WhatsApp?"
                  : "Desativar esta conta?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "excluir"
                ? `Você está prestes a excluir ${confirmacao.usuario.nome} (${confirmacao.usuario.email}). Esta ação não pode ser desfeita.`
                : confirmacao?.tipo === "confirmar_whatsapp"
                  ? "Confirme esta ação somente depois de validar a identidade do usuário pelo número de WhatsApp cadastrado."
                  : `O acesso de ${confirmacao?.usuario.nome} (${confirmacao?.usuario.email}) será bloqueado e todas as sessões serão encerradas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmacao?.tipo === "confirmar_whatsapp" && (
            <dl className="grid gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="text-right font-medium">
                  {confirmacao.usuario.nome}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">WhatsApp cadastrado</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {confirmacao.usuario.whatsapp ?? "não informado"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">E-mail</dt>
                <dd className="break-all text-right">
                  {confirmacao.usuario.email}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">E-mail confirmado</dt>
                <dd className="text-right">
                  {confirmacao.usuario.emailVerificado ? "Sim" : "Não"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Situação da conta</dt>
                <dd className="text-right">
                  {STATUS[confirmacao.usuario.status]}
                </dd>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                O e-mail continuará marcado como não confirmado — esta ação
                comprova a identidade pelo WhatsApp, não pelo e-mail.
              </p>
            </dl>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarAcao}
              disabled={pendente}
              className={
                confirmacao?.tipo === "excluir"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmacao?.tipo === "excluir"
                ? "Excluir definitivamente"
                : confirmacao?.tipo === "confirmar_whatsapp"
                  ? "Confirmar via WhatsApp"
                  : "Desativar conta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
