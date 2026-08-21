"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Clock3,
  GraduationCap,
  MailPlus,
  Search,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ColaboracoesExternas from "@/features/clientes/components/admin/ColaboracoesExternas";
import FilterBar from "@/features/profissionais/components/FilterBar";
import ProfessionalCard from "@/features/profissionais/components/ProfessionalCard";
import type {
  FilterState,
  Professional,
} from "@/features/profissionais/types/profissionais";
import {
  carregarEquipe,
  alterarAtribuicaoCliente,
  alterarPapelMembro,
  enviarConviteEmpresa,
  listarClientesParaAtribuicao,
  pesquisarProfissionais,
  removerMembroEquipe,
  responderConviteEmpresa,
} from "../actions/equipe";
import type { FuncaoEquipe } from "../schemas/equipe";
import type {
  PapelEscritorio,
  PermissoesEscritorio,
} from "../lib/papeis-escritorio";

type Escritorio = {
  empresaId: string;
  nome: string;
  funcao: string | null;
  papel: PapelEscritorio | null;
  /** Matriz vinda do servidor — a mesma que autoriza as Server Actions. */
  permissoes: PermissoesEscritorio;
};

type Membro = {
  id: string;
  empresaId: string;
  usuarioId: string;
  nome: string;
  email: string;
  /** Papel exercido neste escritório. */
  funcao: string | null;
  /** Papel efetivo já resolvido (absorve o vínculo legado sem `funcao`). */
  papel: PapelEscritorio | null;
  avatarUrl: string | null;
  /** Tipo da pessoa na plataforma — não se confunde com `funcao`. */
  tipoPrestador: string | null;
  tipoProfissional: string | null;
  formacao: string | null;
  instituicaoEnsino: string | null;
  tempoExperiencia: number | null;
  especialidades: string[] | null;
  numeroRegistro: string | null;
};

type ConviteRecebido = {
  id: string;
  empresaId: string;
  empresaNome: string;
  remetenteNome: string;
  remetenteTipoPrestador: string | null;
  remetenteProfissao: string | null;
  funcao: string;
  status: string;
  expiraEm: Date;
  createdAt: Date;
};

type ConviteEnviado = {
  id: string;
  empresaId: string;
  empresaNome: string;
  destinatarioNome: string;
  destinatarioEmail: string;
  destinatarioTipoPrestador: string | null;
  destinatarioProfissao: string | null;
  funcao: string;
  status: string;
  expiraEm: Date;
  createdAt: Date;
};

type Profissional = {
  usuarioId: string;
  nome: string;
  avatarUrl: string | null;
  tipoPrestador: string;
  tipoProfissional: string;
  areasAtuacao: string[];
  especialidades: string[];
  cidade: string;
  estado: string;
  formacao: string | null;
  instituicaoEnsino: string | null;
  numeroRegistro: string | null;
  tempoExperiencia: number | null;
  modalidade: string;
  valorHoraCentavos: number | null;
  avaliacaoMedia: number | null;
  totalAvaliacoes: number;
  disponivel: boolean;
  situacao: "membro" | "convite_pendente" | "disponivel";
};
type ClienteAtribuido = {
  empresaId: string;
  profissionalId: string;
  clienteId: string;
  codigo: string;
  nome: string;
};
type ClienteDisponivel = {
  id: string;
  codigo: string;
  nome: string;
  proprietarioId: string;
};

const FUNCOES: Record<string, string> = {
  proprietario: "Proprietário",
  administrador: "Administrador",
  profissional: "Profissional",
  colaborador: "Colaborador",
};

const STATUS: Record<string, string> = {
  pendente: "Pendente",
  aceito: "Aceito",
  recusado: "Recusado",
  expirado: "Expirado",
};

const FILTROS_INICIAIS: FilterState = {
  search: "",
  profession: "all",
  specialty: "Todas as Especialidades",
  location: "Todas as Localizações",
  city: "",
  state: "",
  formation: "",
  minExperience: 0,
  modality: "all",
  minRating: 0,
  availability: "all",
  maxPrice: 1000,
};

function dataCurta(data: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(data));
}

function statusConvite(status: string, expiraEm: Date) {
  if (status === "pendente" && new Date(expiraEm) <= new Date())
    return "expirado";
  return status;
}

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

/**
 * Categoria técnica declarada no cadastro. Só faz sentido para o Profissional —
 * o Colaborador não tem categoria regulamentada e é identificado pelo tipo.
 */
function nomeProfissao(tipo: string | null) {
  if (tipo === "contabilidade") return "Contador";
  if (tipo === "advocacia") return "Advogado";
  if (tipo === "especialista_fiscal") return "Especialista fiscal";
  return "Profissional";
}

/** Tipo da pessoa: quem ela é. Nunca confundir com o papel no escritório. */
function rotuloTipoPessoa(tipoPrestador: string | null) {
  return tipoPrestador === "colaborador" ? "Colaborador" : "Profissional";
}

/**
 * Como identificar a pessoa em uma linha: o Colaborador aparece pelo tipo, o
 * Profissional pela categoria (Contador/Advogado).
 */
function identificacaoPessoa(
  tipoPrestador: string | null,
  tipoProfissional: string | null,
) {
  return tipoPrestador === "colaborador"
    ? "Colaborador"
    : nomeProfissao(tipoProfissional);
}

/**
 * Papéis que podem ser oferecidos a um candidato, conforme o tipo dele.
 * Espelha a regra validada no servidor (`compatibilidade-convite.ts`) — a
 * interface só evita a tentativa; quem decide é o servidor.
 */
function funcoesDisponiveis(tipoPrestador: string): FuncaoEquipe[] {
  return tipoPrestador === "colaborador"
    ? ["colaborador", "administrador"]
    : ["profissional", "administrador"];
}

function funcaoPadrao(tipoPrestador: string): FuncaoEquipe {
  return tipoPrestador === "colaborador" ? "colaborador" : "profissional";
}

/**
 * Papéis que um membro já vinculado pode passar a exercer. Mesma regra do
 * convite: o papel novo tem de aceitar o tipo da pessoa. `proprietario` fica
 * fora — virar dono exige transferência legítima, não troca de função.
 */
function papeisPossiveis(tipoPrestador: string | null): FuncaoEquipe[] {
  return funcoesDisponiveis(tipoPrestador ?? "profissional");
}

export default function EquipeEscritorioPage() {
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const [escritorios, setEscritorios] = useState<Escritorio[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [atuaIndividualmente, setAtuaIndividualmente] = useState(false);
  const [recebidos, setRecebidos] = useState<ConviteRecebido[]>([]);
  const [enviados, setEnviados] = useState<ConviteEnviado[]>([]);
  const [clientesAtribuidos, setClientesAtribuidos] = useState<
    ClienteAtribuido[]
  >([]);
  const [empresaId, setEmpresaId] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const filtrosAdiados = useDeferredValue(filtros);
  const [resultados, setResultados] = useState<Profissional[]>([]);
  const [limiteResultados, setLimiteResultados] = useState(9);
  const [pesquisando, setPesquisando] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [funcoes, setFuncoes] = useState<Record<string, FuncaoEquipe>>({});
  // Tipo da pessoa procurada. O escritório monta equipe com os dois tipos, então
  // o padrão é mostrar todos — diferente da vitrine pública.
  const [tipoPrestadorBusca, setTipoPrestadorBusca] = useState<
    "todos" | "profissional" | "colaborador"
  >("todos");
  const [membroAtribuicao, setMembroAtribuicao] = useState<Membro | null>(null);
  const [membroRemovido, setMembroRemovido] = useState<Membro | null>(null);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<
    ClienteDisponivel[]
  >([]);

  useEffect(() => {
    let ativo = true;
    startTransition(async () => {
      setCarregando(true);
      const resultado = await carregarEquipe();
      if (!ativo) return;
      if (!resultado.sucesso || !resultado.dados) {
        toast.error(resultado.mensagem);
        setCarregando(false);
        return;
      }
      setEscritorios(resultado.dados.escritorios);
      setAtuaIndividualmente(resultado.dados.atuaIndividualmente);
      setMembros(resultado.dados.membros);
      setRecebidos(resultado.dados.recebidos);
      setEnviados(resultado.dados.enviados);
      setClientesAtribuidos(resultado.dados.clientesAtribuidos);
      setEmpresaId((atual) => {
        if (
          resultado.dados.escritorios.some((item) => item.empresaId === atual)
        ) {
          return atual;
        }
        return resultado.dados.escritorios[0]?.empresaId ?? "";
      });
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const escritorioAtual = escritorios.find(
    (item) => item.empresaId === empresaId,
  );

  useEffect(() => {
    let ativo = true;
    if (!empresaId || !escritorioAtual?.permissoes.convidarMembro) {
      return;
    }
    startTransition(async () => {
      setPesquisando(true);
      const [cidadeLocalizacao, estadoLocalizacao] =
        filtrosAdiados.location === "Todas as Localizações" ||
        filtrosAdiados.location === "Remoto"
          ? ["", ""]
          : filtrosAdiados.location.split(",").map((item) => item.trim());
      const profissao =
        filtrosAdiados.profession === "contador"
          ? "contabilidade"
          : filtrosAdiados.profession === "advogado"
            ? "advocacia"
            : filtrosAdiados.profession === "tecnico"
              ? "especialista_fiscal"
              : "todos";
      const resultado = await pesquisarProfissionais({
        empresaId,
        tipoPrestador: tipoPrestadorBusca,
        busca: filtrosAdiados.search,
        profissao,
        estado: filtrosAdiados.state || estadoLocalizacao,
        cidade: filtrosAdiados.city || cidadeLocalizacao,
        formacao: filtrosAdiados.formation,
        especialidade:
          filtrosAdiados.specialty === "Todas as Especialidades"
            ? ""
            : filtrosAdiados.specialty,
        modalidade:
          filtrosAdiados.modality === "all" ? "todos" : filtrosAdiados.modality,
        experienciaMinima: filtrosAdiados.minExperience,
      });
      if (!ativo) return;
      setPesquisando(false);
      if (!resultado.sucesso || !resultado.dados) {
        setResultados([]);
        if (filtrosAdiados.search) toast.error(resultado.mensagem);
        return;
      }
      setResultados(resultado.dados);
      setLimiteResultados(9);
    });
    return () => {
      ativo = false;
    };
  }, [
    empresaId,
    escritorioAtual?.permissoes.convidarMembro,
    filtrosAdiados,
    tipoPrestadorBusca,
  ]);

  async function enviar(profissional: Profissional) {
    setProcessando(profissional.usuarioId);
    const resultado = await enviarConviteEmpresa({
      empresaId,
      destinatarioId: profissional.usuarioId,
      funcao:
        funcoes[profissional.usuarioId] ??
        funcaoPadrao(profissional.tipoPrestador),
    });
    setProcessando(null);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setResultados((atuais) =>
      atuais.map((item) =>
        item.usuarioId === profissional.usuarioId
          ? { ...item, situacao: "convite_pendente" }
          : item,
      ),
    );
    setVersao((atual) => atual + 1);
  }

  async function responder(conviteId: string, resposta: "aceitar" | "recusar") {
    setProcessando(conviteId);
    const resultado = await responderConviteEmpresa({ conviteId, resposta });
    setProcessando(null);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  /**
   * Troca o papel do membro. A interface só oferece os papéis compatíveis com o
   * tipo da pessoa; o servidor revalida a mesma regra antes de gravar.
   */
  async function alterarFuncao(membro: Membro, funcao: FuncaoEquipe) {
    if (membro.papel === funcao) return;
    setProcessando(membro.id);
    const resultado = await alterarPapelMembro({
      empresaId: membro.empresaId,
      usuarioId: membro.usuarioId,
      funcao,
    });
    setProcessando(null);
    if (!resultado.sucesso) return toast.error(resultado.mensagem);
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  async function removerMembro(membro: Membro) {
    setProcessando(membro.id);
    const resultado = await removerMembroEquipe({
      empresaId: membro.empresaId,
      usuarioId: membro.usuarioId,
    });
    setProcessando(null);
    setMembroRemovido(null);
    if (!resultado.sucesso) return toast.error(resultado.mensagem);
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  async function abrirAtribuicoes(membro: Membro) {
    setMembroAtribuicao(membro);
    const resultado = await listarClientesParaAtribuicao(membro.empresaId);
    if (!resultado.sucesso || !resultado.dados)
      return toast.error(resultado.mensagem);
    setClientesDisponiveis(resultado.dados);
  }

  async function alternarAtribuicao(cliente: ClienteDisponivel) {
    if (!membroAtribuicao) return;
    const atribuida = clientesAtribuidos.some(
      (item) =>
        item.clienteId === cliente.id &&
        item.profissionalId === membroAtribuicao.usuarioId,
    );
    const resultado = await alterarAtribuicaoCliente({
      empresaId: membroAtribuicao.empresaId,
      clienteId: cliente.id,
      profissionalId: membroAtribuicao.usuarioId,
      atribuir: !atribuida,
    });
    if (!resultado.sucesso) return toast.error(resultado.mensagem);
    toast.success(resultado.mensagem);
    setVersao((atual) => atual + 1);
  }

  if (carregando) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-xl border bg-card">
        <Clock3 className="mr-3 size-5 animate-pulse text-primary" />
        <span className="text-sm text-muted-foreground">
          Carregando equipe...
        </span>
      </div>
    );
  }

  const membrosAtuais = membros.filter((item) => item.empresaId === empresaId);
  const enviadosAtuais = enviados.filter(
    (item) => item.empresaId === empresaId,
  );
  const resultadosVisiveis = escritorioAtual?.permissoes.convidarMembro
    ? resultados.filter((item) => {
        const avaliacao = (item.avaliacaoMedia ?? 0) / 10;
        const valorHora = (item.valorHoraCentavos ?? 0) / 100;
        return (
          avaliacao >= filtrosAdiados.minRating &&
          valorHora <= filtrosAdiados.maxPrice &&
          (filtrosAdiados.availability === "all" ||
            item.disponivel === (filtrosAdiados.availability === "available"))
        );
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="glass-card relative overflow-hidden rounded-2xl border border-amber-500/20 p-5 shadow-card sm:p-6">
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-gold" />
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-gold shadow-glow">
            <UsersRound className="size-5 text-on-gradient" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
              Gestão do escritório
            </p>
            <h2 className="font-serif text-2xl font-bold">
              Equipe e escritório
            </h2>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Consulte seus vínculos e gerencie convites profissionais.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          <b className="text-foreground">Convite de equipe</b> cria vínculo
          permanente com o escritório.{" "}
          <b className="text-foreground">Colaboração externa</b> concede acesso
          pontual e revogável a um cliente, sem entrar na equipe.
        </p>
      </div>

      {escritorios.length > 0 && (
        <Card className="border-amber-500/15 shadow-card">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="escritorio-equipe">Escritório visualizado</Label>
              <select
                id="escritorio-equipe"
                value={empresaId}
                onChange={(evento) => setEmpresaId(evento.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {escritorios.map((item) => (
                  <option key={item.empresaId} value={item.empresaId}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              Seu papel no escritório:{" "}
              {FUNCOES[escritorioAtual?.funcao ?? "proprietario"] ?? "Membro"}
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs
        defaultValue={
          recebidos.some((item) => item.status === "pendente")
            ? "recebidos"
            : "membros"
        }
      >
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="membros">Profissionais</TabsTrigger>
          <TabsTrigger value="recebidos">
            Recebidos
            {recebidos.filter((item) => item.status === "pendente").length >
              0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                {recebidos.filter((item) => item.status === "pendente").length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="enviados">Enviados</TabsTrigger>
          <TabsTrigger value="pesquisar">Pesquisar</TabsTrigger>
          <TabsTrigger value="colaboracoes">Colaborações externas</TabsTrigger>
        </TabsList>

        <TabsContent value="membros" className="mt-4">
          {!empresaId ? (
            <EstadoVazio
              icone={Building2}
              titulo="Você ainda não está vinculado a um escritório"
              texto="Convites recebidos continuam disponíveis nesta área."
            />
          ) : membrosAtuais.length === 0 ? (
            <EstadoVazio
              icone={UsersRound}
              titulo="Nenhum profissional encontrado"
              texto="Os membros ativos aparecerão aqui."
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {membrosAtuais.map((membro) => (
                <Card
                  key={membro.id}
                  className="group overflow-hidden border-amber-500/15 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <div className="h-1 bg-gradient-gold" />
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-gold font-bold text-on-gradient ring-2 ring-amber-500/20">
                        {membro.avatarUrl ? (
                          <img
                            src={membro.avatarUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          iniciais(membro.nome)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-serif text-lg font-semibold">
                          {membro.nome}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {membro.email}
                        </p>
                        <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                          {identificacaoPessoa(
                            membro.tipoPrestador,
                            membro.tipoProfissional,
                          )}
                          {membro.numeroRegistro
                            ? ` · ${membro.numeroRegistro}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {/* Papel exercido neste escritório. */}
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          {FUNCOES[membro.funcao ?? "profissional"] ??
                            "Profissional"}
                        </span>
                        {/* Tipo da pessoa: independe do papel acima. */}
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                          {rotuloTipoPessoa(membro.tipoPrestador)}
                        </span>
                        {/* Diferencia do colaborador externo, que nunca aparece nesta aba. */}
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          Membro da equipe
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-2">
                        <GraduationCap className="size-4 text-amber-500" />
                        {[membro.formacao, membro.instituicaoEnsino]
                          .filter(Boolean)
                          .join(" · ") || "Formação não informada"}
                      </p>
                      <p>
                        <b className="text-foreground">
                          {membro.tempoExperiencia ?? 0} anos
                        </b>{" "}
                        de experiência
                      </p>
                      {(membro.especialidades?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {membro.especialidades?.slice(0, 3).map((item) => (
                            <span
                              key={item}
                              className="rounded-md bg-primary/10 px-2 py-1 text-primary"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 border-t border-amber-500/15 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Clientes atendidos
                      </p>
                      {clientesAtribuidos.filter(
                        (item) => item.profissionalId === membro.usuarioId,
                      ).length ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {clientesAtribuidos
                            .filter(
                              (item) =>
                                item.profissionalId === membro.usuarioId,
                            )
                            .slice(0, 3)
                            .map((item) => (
                              <li key={item.clienteId}>
                                <span className="font-mono text-xs text-primary">
                                  {item.codigo}
                                </span>{" "}
                                · {item.nome}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Nenhum cliente atribuído.
                        </p>
                      )}
                      {/* Ações administrativas. Nunca aparecem sobre a linha do
                          Proprietário, e nunca para quem não administra — as
                          mesmas condições que o servidor aplica. */}
                      {membro.papel !== "proprietario" && (
                        <div className="mt-3 space-y-2">
                          {escritorioAtual?.permissoes.atribuirCliente && (
                            <Button
                              className="w-full"
                              size="sm"
                              variant="outline"
                              onClick={() => void abrirAtribuicoes(membro)}
                            >
                              Gerenciar clientes
                            </Button>
                          )}
                          {escritorioAtual?.permissoes.alterarPapel && (
                            <div className="flex items-center gap-2">
                              <Label
                                className="sr-only"
                                htmlFor={`papel-${membro.id}`}
                              >
                                Função de {membro.nome}
                              </Label>
                              <select
                                id={`papel-${membro.id}`}
                                className="h-9 flex-1 rounded-md border bg-background px-2 text-xs"
                                value={membro.papel ?? ""}
                                disabled={processando === membro.id}
                                onChange={(evento) =>
                                  void alterarFuncao(
                                    membro,
                                    evento.target.value as FuncaoEquipe,
                                  )
                                }
                              >
                                {papeisPossiveis(membro.tipoPrestador).map(
                                  (papel) => (
                                    <option key={papel} value={papel}>
                                      {FUNCOES[papel]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                          )}
                          {escritorioAtual?.permissoes.removerMembro && (
                            <Button
                              className="w-full"
                              size="sm"
                              variant="ghost"
                              disabled={processando === membro.id}
                              onClick={() => setMembroRemovido(membro)}
                            >
                              <X />
                              Remover do escritório
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recebidos" className="mt-4 space-y-3">
          {recebidos.length === 0 ? (
            <EstadoVazio
              icone={MailPlus}
              titulo="Nenhum convite recebido"
              texto="Novos convites de escritórios aparecerão aqui."
            />
          ) : (
            recebidos.map((convite) => (
              <Card
                key={convite.id}
                className="overflow-hidden border-amber-500/15 shadow-card"
              >
                <div className="h-1 bg-gradient-gold" />
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-gold shadow-glow">
                      <Building2 className="size-5 text-on-gradient" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-semibold">
                        {convite.empresaNome}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Enviado por {convite.remetenteNome} em{" "}
                        {dataCurta(convite.createdAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                          {identificacaoPessoa(
                            convite.remetenteTipoPrestador,
                            convite.remetenteProfissao,
                          )}
                        </span>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                          Papel proposto:{" "}
                          {FUNCOES[convite.funcao] ?? convite.funcao}
                        </span>
                      </div>
                    </div>
                  </div>
                  {statusConvite(convite.status, convite.expiraEm) ===
                  "pendente" ? (
                    <div className="flex gap-2 rounded-xl bg-muted/60 p-2">
                      <Button
                        variant="outline"
                        disabled={processando === convite.id}
                        onClick={() => void responder(convite.id, "recusar")}
                      >
                        <X />
                        Recusar
                      </Button>
                      <Button
                        disabled={processando === convite.id}
                        onClick={() => void responder(convite.id, "aceitar")}
                      >
                        <Check />
                        Aceitar
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium">
                      {STATUS[
                        statusConvite(convite.status, convite.expiraEm)
                      ] ?? convite.status}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="enviados" className="mt-4 space-y-3">
          {enviadosAtuais.length === 0 ? (
            <EstadoVazio
              icone={UserRoundPlus}
              titulo="Nenhum convite enviado"
              texto="Pesquise profissionais para montar sua equipe."
            />
          ) : (
            enviadosAtuais.map((convite) => (
              <Card
                key={convite.id}
                className="overflow-hidden border-amber-500/15 shadow-card"
              >
                <div className="h-1 bg-gradient-gold" />
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-gold font-bold text-on-gradient">
                      {iniciais(convite.destinatarioNome)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-serif text-lg font-semibold">
                        {convite.destinatarioNome}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {convite.destinatarioEmail}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                          {identificacaoPessoa(
                            convite.destinatarioTipoPrestador,
                            convite.destinatarioProfissao,
                          )}
                        </span>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300">
                          Papel proposto:{" "}
                          {FUNCOES[convite.funcao] ?? convite.funcao}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Enviado em {dataCurta(convite.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {STATUS[statusConvite(convite.status, convite.expiraEm)] ??
                      convite.status}
                  </span>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="pesquisar" className="mt-4 space-y-4">
          {!escritorioAtual?.permissoes.convidarMembro ? (
            <EstadoVazio
              icone={Building2}
              titulo={
                atuaIndividualmente
                  ? "Você atua de forma individual"
                  : "Você não administra este escritório"
              }
              texto={
                atuaIndividualmente
                  ? "Para pesquisar e convidar profissionais, é necessário ser proprietário ou administrador de um escritório."
                  : "Para pesquisar e convidar profissionais, é necessário ser proprietário ou administrador deste escritório."
              }
            />
          ) : (
            <>
              <Card className="border-amber-500/15 shadow-card">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="tipo-pessoa-busca">Tipo de pessoa</Label>
                    <select
                      id="tipo-pessoa-busca"
                      value={tipoPrestadorBusca}
                      onChange={(evento) =>
                        setTipoPrestadorBusca(
                          evento.target.value as typeof tipoPrestadorBusca,
                        )
                      }
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="todos">
                        Profissionais e colaboradores
                      </option>
                      <option value="profissional">
                        Somente profissionais
                      </option>
                      <option value="colaborador">
                        Somente colaboradores
                      </option>
                    </select>
                  </div>
                  <p className="max-w-md text-sm text-muted-foreground">
                    <b className="text-foreground">Profissional</b> tem
                    habilitação regulamentada (CRC/OAB).{" "}
                    <b className="text-foreground">Colaborador</b> presta
                    serviços compatíveis sem registro regulamentado.
                  </p>
                </CardContent>
              </Card>
              <FilterBar
                filters={filtros}
                onFilterChange={setFiltros}
                variant="adminEquipe"
              />
              {pesquisando ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Pesquisando profissionais...
                </p>
              ) : resultadosVisiveis.length === 0 ? (
                <EstadoVazio
                  icone={Search}
                  titulo="Nenhum profissional disponível"
                  texto="A busca mostra apenas profissionais aprovados que podem receber convite."
                />
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {resultadosVisiveis
                    .slice(0, limiteResultados)
                    .map((profissional) => (
                      <ProfessionalCard
                        key={profissional.usuarioId}
                        variant="adminEquipe"
                        statusLabel={
                          profissional.situacao === "membro"
                            ? "Na equipe"
                            : profissional.situacao === "convite_pendente"
                              ? "Convite pendente"
                              : "Disponível"
                        }
                        professional={
                          {
                            id: profissional.usuarioId,
                            name: profissional.nome,
                            photo: profissional.avatarUrl ?? null,
                            // O card público só possui estas três chaves; o
                            // tipo real da pessoa é exibido no badge acima.
                            profession:
                              profissional.tipoProfissional === "advocacia"
                                ? "advogado"
                                : profissional.tipoProfissional ===
                                    "contabilidade"
                                  ? "contador"
                                  : "tecnico",
                            specialty:
                              profissional.especialidades[0] ??
                              profissional.areasAtuacao[0] ??
                              "Atendimento profissional",
                            location: `${profissional.cidade}, ${profissional.estado}`,
                            rating: (profissional.avaliacaoMedia ?? 0) / 10,
                            reviewCount: profissional.totalAvaliacoes,
                            education:
                              [
                                profissional.formacao,
                                profissional.instituicaoEnsino,
                              ]
                                .filter(Boolean)
                                .join(" - ") || "Formação não informada",
                            experience: `${profissional.tempoExperiencia ?? 0} anos`,
                            hourlyRate:
                              (profissional.valorHoraCentavos ?? 0) / 100,
                            isAvailable: profissional.disponivel,
                            specialties: profissional.especialidades,
                            about: "",
                            certifications: profissional.numeroRegistro
                              ? [profissional.numeroRegistro]
                              : [],
                          } satisfies Professional
                        }
                        adminControls={
                          <div className="flex w-full flex-col gap-2">
                            {/* Tipo da pessoa antes do papel: o papel oferecido
                                depende do tipo, não o contrário. */}
                            <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                              {rotuloTipoPessoa(profissional.tipoPrestador)}
                            </span>
                            <div className="flex w-full flex-col gap-2 sm:flex-row">
                            <select
                              aria-label={`Papel no escritório para ${profissional.nome}`}
                              value={
                                funcoes[profissional.usuarioId] ??
                                funcaoPadrao(profissional.tipoPrestador)
                              }
                              onChange={(evento) =>
                                setFuncoes((atual) => ({
                                  ...atual,
                                  [profissional.usuarioId]: evento.target
                                    .value as FuncaoEquipe,
                                }))
                              }
                              className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
                            >
                              {/* Só os papéis compatíveis com o tipo da pessoa:
                                  Colaborador não é convidado como Profissional
                                  e vice-versa. */}
                              {funcoesDisponiveis(
                                profissional.tipoPrestador,
                              ).map((funcao) => (
                                <option key={funcao} value={funcao}>
                                  {FUNCOES[funcao]}
                                </option>
                              ))}
                            </select>
                            <Button
                              disabled={
                                processando === profissional.usuarioId ||
                                profissional.situacao !== "disponivel"
                              }
                              onClick={() => void enviar(profissional)}
                            >
                              {profissional.situacao === "convite_pendente" ? (
                                <Clock3 />
                              ) : profissional.situacao === "membro" ? (
                                <Check />
                              ) : (
                                <MailPlus />
                              )}
                              {profissional.situacao === "membro"
                                ? "Já integra a equipe"
                                : profissional.situacao === "convite_pendente"
                                  ? "Convite enviado"
                                  : "Convidar"}
                            </Button>
                            </div>
                          </div>
                        }
                      />
                    ))}
                </div>
              )}
              {resultadosVisiveis.length > limiteResultados && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setLimiteResultados((atual) => atual + 9)}
                  >
                    Carregar mais profissionais
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="colaboracoes" className="mt-4">
          <ColaboracoesExternas />
        </TabsContent>
      </Tabs>
      <Dialog
        open={Boolean(membroAtribuicao)}
        onOpenChange={(aberto) => {
          if (!aberto) setMembroAtribuicao(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Clientes atendidos por {membroAtribuicao?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {clientesDisponiveis
              .filter(
                (cliente) =>
                  cliente.proprietarioId !== membroAtribuicao?.usuarioId,
              )
              .map((cliente) => {
                const marcado = clientesAtribuidos.some(
                  (item) =>
                    item.clienteId === cliente.id &&
                    item.profissionalId === membroAtribuicao?.usuarioId,
                );
                return (
                  <label
                    key={cliente.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => void alternarAtribuicao(cliente)}
                    />
                    <span>
                      <b className="font-mono text-xs text-primary">
                        {cliente.codigo}
                      </b>
                      <br />
                      {cliente.nome}
                    </span>
                  </label>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(membroRemovido)}
        onOpenChange={(aberto) => !aberto && setMembroRemovido(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Remover {membroRemovido?.nome} do escritório?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O vínculo é encerrado e as atribuições de cliente desta pessoa neste
            escritório são desfeitas na hora. Os clientes que pertencem a ela
            continuam sendo dela.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMembroRemovido(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={processando === membroRemovido?.id}
              onClick={() =>
                membroRemovido && void removerMembro(membroRemovido)
              }
            >
              {processando === membroRemovido?.id
                ? "Removendo..."
                : "Remover membro"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoVazio({
  icone: Icone,
  titulo,
  texto,
}: {
  icone: typeof Building2;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center">
      <Icone className="size-9 text-muted-foreground" />
      <h3 className="mt-3 font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}
