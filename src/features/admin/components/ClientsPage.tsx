"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Archive,
  CheckCircle,
  Clock,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  arquivarCliente,
  atualizarCliente,
  criarCliente,
  listarMeusClientes,
  obterMeuCliente,
  restaurarCliente,
} from "@/features/clientes/actions/clientes";
import {
  ClienteSchema,
  type ClienteDTO,
} from "@/features/clientes/schemas/cliente";
import type {
  NivelAcessoCliente,
  PermissoesCliente,
} from "@/features/clientes/lib/permissoes-cliente";
import { consultarCep } from "@/features/usuarios/actions/consultar-cep";

type StatusCliente = "ativo" | "pendente" | "inativo";
type AreaCliente = "contabil" | "juridico" | "ambos";

type ClienteLista = {
  id: string;
  codigo: string;
  nome: string;
  email: string;
  telefone: string;
  empresaNome: string | null;
  area: string;
  status: string;
  tipoAtendimento: string;
  valorReferenciaCentavos: number;
  responsavelNome: string;
  arquivadoEm: Date | null;
  createdAt: Date;
  // Verdadeiro quando o acesso vem de convite de colaboração (externo,
  // somente leitura), e não de propriedade ou atribuição interna.
  acessoColaboracao?: boolean;
  // Nível e permissões calculados no servidor pela mesma matriz que autoriza as
  // Server Actions. A interface não recalcula regra nenhuma — só obedece.
  nivelAcesso: NivelAcessoCliente;
  permissoes: PermissoesCliente;
};

type ClienteDetalhe = ClienteLista & {
  observacoes: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

const VALORES_INICIAIS: ClienteDTO = {
  nome: "",
  email: "",
  telefone: "",
  empresaNome: "",
  area: "contabil",
  status: "ativo",
  tipoAtendimento: "mensal",
  valorReferencia: "",
  observacoes: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
};

function formatarTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 6)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

function formatarMoedaDigitada(valor: string) {
  const centavos = Number(valor.replace(/\D/g, ""));
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

function formatarCentavos(centavos: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
}

const STATUS: Record<
  StatusCliente,
  { texto: string; classe: string; Icone: typeof CheckCircle }
> = {
  ativo: { texto: "Ativo", classe: "badge-success", Icone: CheckCircle },
  pendente: { texto: "Pendente", classe: "badge-warning", Icone: Clock },
  inativo: {
    texto: "Inativo",
    classe: "bg-destructive/10 text-destructive",
    Icone: AlertCircle,
  },
};

const AREAS: Record<AreaCliente, { texto: string; classe: string }> = {
  contabil: { texto: "Contábil", classe: "badge-info" },
  juridico: {
    texto: "Jurídico",
    classe: "bg-primary/10 text-primary",
  },
  ambos: { texto: "Ambos", classe: "badge-warning" },
};

function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function BadgeStatus({ status }: { status: string }) {
  const configuracao = STATUS[status as StatusCliente] ?? STATUS.inativo;
  const Icone = configuracao.Icone;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${configuracao.classe}`}
    >
      <Icone className="size-3" />
      {configuracao.texto}
    </span>
  );
}

function BadgeArea({ area }: { area: string }) {
  const configuracao = AREAS[area as AreaCliente] ?? AREAS.ambos;
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${configuracao.classe}`}>
      {configuracao.texto}
    </span>
  );
}

export default function ClientsPage() {
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca);
  const [status, setStatus] = useState<
    "todos" | "ativo" | "pendente" | "arquivados"
  >("todos");
  const [pagina, setPagina] = useState(1);
  const [clientes, setClientes] = useState<ClienteLista[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [versao, setVersao] = useState(0);
  const [clienteDetalhe, setClienteDetalhe] = useState<ClienteDetalhe | null>(
    null,
  );
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [clienteEditadoId, setClienteEditadoId] = useState<string | null>(null);
  const [clienteArquivado, setClienteArquivado] =
    useState<ClienteDetalhe | null>(null);
  const [arquivando, setArquivando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClienteDTO>({
    resolver: zodResolver(ClienteSchema),
    defaultValues: VALORES_INICIAIS,
  });
  const tipoAtendimento = useWatch({ control, name: "tipoAtendimento" });
  const area = useWatch({ control, name: "area" });
  const cep = useWatch({ control, name: "cep" });
  const atendimentoJuridico = area === "juridico";

  useEffect(() => {
    if (atendimentoJuridico) {
      setValue("tipoAtendimento", "mensal");
      setValue("valorReferencia", "");
    }
  }, [atendimentoJuridico, setValue]);

  useEffect(() => {
    let cancelado = false;

    startTransition(async () => {
      setCarregando(true);
      setErroLista("");
      const resultado = await listarMeusClientes({
        busca: buscaAdiada,
        status,
        pagina,
      });
      if (cancelado) return;
      if (!resultado.sucesso || !resultado.dados) {
        setClientes([]);
        setErroLista(resultado.mensagem);
      } else {
        setClientes(resultado.dados.clientes);
        setTotal(resultado.dados.total);
        setTotalPaginas(resultado.dados.totalPaginas);
      }
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [buscaAdiada, pagina, status, versao]);

  function recarregar() {
    setVersao((atual) => atual + 1);
  }

  function abrirNovoCliente() {
    setClienteEditadoId(null);
    reset(VALORES_INICIAIS);
    setFormularioAberto(true);
  }

  function abrirEdicao(cliente: ClienteDetalhe) {
    setClienteEditadoId(cliente.id);
    reset({
      nome: cliente.nome,
      email: cliente.email,
      telefone: formatarTelefone(cliente.telefone),
      empresaNome: cliente.empresaNome ?? "",
      area: cliente.area as AreaCliente,
      status: cliente.status as StatusCliente,
      tipoAtendimento: cliente.tipoAtendimento as "mensal" | "avulso",
      valorReferencia: formatarCentavos(cliente.valorReferenciaCentavos),
      observacoes: cliente.observacoes ?? "",
      cep: cliente.cep ?? "",
      logradouro: cliente.logradouro ?? "",
      numero: cliente.numero ?? "",
      complemento: cliente.complemento ?? "",
      bairro: cliente.bairro ?? "",
      cidade: cliente.cidade ?? "",
      estado: cliente.estado ?? "",
    });
    setFormularioAberto(true);
  }

  async function abrirDetalhe(clienteId: string) {
    setCarregandoDetalhe(true);
    const resultado = await obterMeuCliente(clienteId);
    setCarregandoDetalhe(false);
    if (!resultado.sucesso || !resultado.dados) {
      toast.error(resultado.mensagem);
      return;
    }
    setClienteDetalhe(resultado.dados);
  }

  async function salvar(dados: ClienteDTO) {
    const resultado = clienteEditadoId
      ? await atualizarCliente(clienteEditadoId, dados)
      : await criarCliente(dados);
    if (!resultado.sucesso) {
      if ("erros" in resultado && resultado.erros) {
        for (const [campo, mensagens] of Object.entries(resultado.erros)) {
          const mensagemCampo = mensagens?.[0];
          if (mensagemCampo) {
            setError(campo as keyof ClienteDTO, {
              type: "server",
              message: mensagemCampo,
            });
          }
        }
      }
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setFormularioAberto(false);
    setClienteDetalhe(null);
    setPagina(1);
    recarregar();
  }

  async function buscarEndereco() {
    setBuscandoCep(true);
    const resultado = await consultarCep(cep);
    setBuscandoCep(false);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    for (const [campo, valor] of Object.entries(resultado.endereco)) {
      setValue(campo as keyof ClienteDTO, valor);
    }
    toast.success("Endereço encontrado.");
  }

  async function confirmarArquivamento() {
    if (!clienteArquivado) return;
    setArquivando(true);
    const resultado = await arquivarCliente(clienteArquivado.id);
    setArquivando(false);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.warning(resultado.mensagem);
    setClienteArquivado(null);
    setClienteDetalhe(null);
    recarregar();
  }

  async function restaurar(cliente: ClienteDetalhe) {
    setRestaurando(true);
    const resultado = await restaurarCliente(cliente.id);
    setRestaurando(false);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem);
      return;
    }
    toast.success(resultado.mensagem);
    setClienteDetalhe(null);
    recarregar();
  }

  const erro = (campo: keyof typeof errors) =>
    errors[campo] ? (
      <p className="mt-1 text-xs text-destructive">
        {errors[campo]?.message as string}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-amber-500/20 p-5 shadow-card sm:p-6"
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-gold" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
            Carteira profissional
          </p>
          <h2 className="font-serif text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">
            Gerencie seus clientes e contatos.
          </p>
        </div>
        <Button
          onClick={abrirNovoCliente}
          className="bg-gradient-gold font-semibold text-on-gradient shadow-glow hover:shadow-glow-lg"
        >
          <Plus className="size-5" />
          Novo cliente
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card flex flex-wrap items-center gap-4 rounded-2xl border border-amber-500/15 p-4 shadow-card"
      >
        <div className="relative min-w-64 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(evento) => {
              setBusca(evento.target.value);
              setPagina(1);
            }}
            className="h-11 pl-10"
            placeholder="Buscar por nome, empresa ou e-mail..."
          />
        </div>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {(["todos", "ativo", "pendente", "arquivados"] as const).map(
            (opcao) => (
              <button
                key={opcao}
                onClick={() => {
                  setStatus(opcao);
                  setPagina(1);
                }}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-all sm:px-4 ${
                  status === opcao
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opcao === "todos"
                  ? "Todos"
                  : opcao === "ativo"
                    ? "Ativos"
                    : opcao === "pendente"
                      ? "Pendentes"
                      : "Arquivados"}
              </button>
            ),
          )}
        </div>
      </motion.div>

      {carregando ? (
        <div className="flex min-h-72 items-center justify-center rounded-xl border bg-card">
          <RefreshCw className="size-6 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">
            Carregando clientes...
          </span>
        </div>
      ) : erroLista ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card p-6 text-center">
          <AlertCircle className="size-9 text-destructive" />
          <p className="mt-3 font-medium">
            Não foi possível carregar os clientes
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{erroLista}</p>
          <Button className="mt-4" variant="outline" onClick={recarregar}>
            Tentar novamente
          </Button>
        </div>
      ) : clientes.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-6 text-center">
          <Users className="size-10 text-muted-foreground" />
          <h3 className="mt-4 font-serif text-xl font-semibold">
            {busca || status !== "todos"
              ? "Nenhum cliente encontrado"
              : "Sua carteira começa aqui"}
          </h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {busca || status !== "todos"
              ? "Ajuste a busca ou os filtros para encontrar outro cliente."
              : "Cadastre seu primeiro cliente para organizar contatos e atendimentos."}
          </p>
          {!busca && status === "todos" && (
            <Button className="mt-5" onClick={abrirNovoCliente}>
              <Plus />
              Cadastrar cliente
            </Button>
          )}
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {clientes.map((cliente, indice) => (
              <motion.button
                type="button"
                key={cliente.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + indice * 0.03 }}
                whileHover={{ y: -4 }}
                onClick={() => void abrirDetalhe(cliente.id)}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-amber-500/15 bg-card p-5 text-left shadow-card transition-all hover:border-amber-500/30 hover:shadow-glow"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-gold">
                      <span className="font-bold text-on-gradient">
                        {iniciais(cliente.nome)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{cliente.nome}</h3>
                      <p className="text-xs font-medium text-primary">
                        {cliente.codigo}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {cliente.empresaNome || "Pessoa física"}
                      </p>
                    </div>
                  </div>
                  <BadgeStatus status={cliente.status} />
                </div>
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="size-4 shrink-0" />
                    <span className="truncate">{cliente.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="size-4 shrink-0" />
                    <span>{formatarTelefone(cliente.telefone)}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    Responsável: {cliente.responsavelNome}
                  </p>
                  {cliente.acessoColaboracao && (
                    <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                      Colaboração externa
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-3 border-t pt-4">
                  <div className="space-y-2">
                    <BadgeArea area={cliente.area} />
                    {cliente.area === "juridico" ? (
                      <p className="text-sm font-medium text-foreground">
                        Atendimento jurídico
                      </p>
                    ) : (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {cliente.tipoAtendimento === "mensal"
                            ? "Mensal"
                            : "Serviço avulso"}
                        </p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums text-primary">
                          {formatarCentavos(cliente.valorReferenciaCentavos)}
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {cliente.arquivadoEm
                      ? "Arquivado"
                      : `Desde ${new Intl.DateTimeFormat("pt-BR").format(
                          new Date(cliente.createdAt),
                        )}`}
                  </span>
                </div>
              </motion.button>
            ))}
          </motion.div>

          <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 text-sm sm:flex-row">
            <p className="text-muted-foreground">
              {total}{" "}
              {total === 1 ? "cliente encontrado" : "clientes encontrados"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina((atual) => atual - 1)}
              >
                Anterior
              </Button>
              <span className="px-2">
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((atual) => atual + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={Boolean(clienteDetalhe) || carregandoDetalhe}
        onOpenChange={(aberto) => {
          if (!aberto) setClienteDetalhe(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {carregandoDetalhe || !clienteDetalhe ? (
            <div className="flex min-h-60 items-center justify-center">
              <RefreshCw className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-gold">
                    <span className="text-xl font-bold text-on-gradient">
                      {iniciais(clienteDetalhe.nome)}
                    </span>
                  </div>
                  <div>
                    <DialogTitle className="font-serif text-2xl">
                      {clienteDetalhe.nome}
                    </DialogTitle>
                    <DialogDescription>
                      {clienteDetalhe.empresaNome || "Pessoa física"}
                    </DialogDescription>
                    <div className="mt-2">
                      <BadgeStatus status={clienteDetalhe.status} />
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
                {clienteDetalhe.area !== "juridico" && (
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <a
                      href={`mailto:${clienteDetalhe.email}`}
                      className="mt-1 block break-all text-sm hover:text-primary"
                    >
                      {clienteDetalhe.email}
                    </a>
                  </div>
                )}
                {clienteDetalhe.area !== "juridico" && (
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <a
                      href={`tel:${clienteDetalhe.telefone}`}
                      className="mt-1 block text-sm hover:text-primary"
                    >
                      {formatarTelefone(clienteDetalhe.telefone)}
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Área</p>
                  <div className="mt-1">
                    <BadgeArea area={clienteDetalhe.area} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cadastro</p>
                  <p className="mt-1 text-sm">
                    {new Intl.DateTimeFormat("pt-BR").format(
                      new Date(clienteDetalhe.createdAt),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Tipo de atendimento
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {clienteDetalhe.tipoAtendimento === "mensal"
                      ? "Mensal"
                      : "Serviço avulso"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {clienteDetalhe.tipoAtendimento === "mensal"
                      ? "Valor mensal"
                      : "Valor do serviço"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-primary">
                    {formatarCentavos(clienteDetalhe.valorReferenciaCentavos)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    Profissional responsável
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {clienteDetalhe.responsavelNome}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold">Observações</h4>
                <p className="mt-2 whitespace-pre-wrap rounded-lg border p-4 text-sm text-muted-foreground">
                  {clienteDetalhe.observacoes ||
                    "Nenhuma observação registrada."}
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Endereço</h4>
                <p className="mt-2 rounded-lg border p-4 text-sm text-muted-foreground">
                  {[
                    clienteDetalhe.logradouro,
                    clienteDetalhe.numero,
                    clienteDetalhe.complemento,
                    clienteDetalhe.bairro,
                    clienteDetalhe.cidade && clienteDetalhe.estado
                      ? `${clienteDetalhe.cidade}/${clienteDetalhe.estado}`
                      : null,
                    clienteDetalhe.cep,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>

              {/* Só aparece o que o servidor de fato autoriza: as permissões
                  vêm calculadas de `PERMISSOES_POR_NIVEL`, a mesma tabela que
                  as Server Actions consultam. */}
              <DialogFooter className="items-center">
                {clienteDetalhe.nivelAcesso === "colaborador_externo" && (
                  <p className="mr-auto text-xs text-muted-foreground">
                    Acesso por colaboração externa — somente leitura.
                  </p>
                )}
                {clienteDetalhe.arquivadoEm
                  ? clienteDetalhe.permissoes.restaurar && (
                      <Button
                        disabled={restaurando}
                        onClick={() => void restaurar(clienteDetalhe)}
                      >
                        <RefreshCw />
                        {restaurando ? "Restaurando..." : "Restaurar cliente"}
                      </Button>
                    )
                  : (
                      <>
                        {clienteDetalhe.permissoes.arquivar && (
                          <Button
                            variant="outline"
                            onClick={() => setClienteArquivado(clienteDetalhe)}
                          >
                            <Archive />
                            Arquivar
                          </Button>
                        )}
                        {clienteDetalhe.permissoes.editar && (
                          <Button onClick={() => abrirEdicao(clienteDetalhe)}>
                            <Pencil />
                            Editar cliente
                          </Button>
                        )}
                      </>
                    )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formularioAberto} onOpenChange={setFormularioAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {clienteEditadoId ? "Editar cliente" : "Novo cliente"}
            </DialogTitle>
            <DialogDescription>
              As informações ficarão visíveis somente na sua carteira.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-7" onSubmit={handleSubmit(salvar)}>
            <section className="space-y-4">
              <div>
                <h3 className="font-semibold">Dados do cliente</h3>
                <p className="text-sm text-muted-foreground">
                  Identificação e canais de contato.
                </p>
              </div>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cliente-nome">Nome</Label>
                  <Input
                    id="cliente-nome"
                    className={errors.nome ? "border-destructive" : ""}
                    {...register("nome")}
                  />
                  {erro("nome")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-email">E-mail</Label>
                  <Input
                    id="cliente-email"
                    type="email"
                    className={errors.email ? "border-destructive" : ""}
                    {...register("email")}
                  />
                  {erro("email")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-telefone">Telefone</Label>
                  <Controller
                    control={control}
                    name="telefone"
                    render={({ field }) => (
                      <Input
                        id="cliente-telefone"
                        inputMode="tel"
                        maxLength={15}
                        className={errors.telefone ? "border-destructive" : ""}
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(evento) =>
                          field.onChange(formatarTelefone(evento.target.value))
                        }
                      />
                    )}
                  />
                  {erro("telefone")}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cliente-empresa">
                    Empresa do cliente (opcional)
                  </Label>
                  <Input
                    id="cliente-empresa"
                    placeholder="Opcional para pessoa física"
                    {...register("empresaNome")}
                  />
                  {erro("empresaNome")}
                </div>
              </div>
            </section>

            <section className="space-y-4 border-t pt-6">
              <div>
                <h3 className="font-semibold">Atendimento</h3>
                <p className="text-sm text-muted-foreground">
                  Área, situação e referência comercial.
                </p>
              </div>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cliente-area">Área</Label>
                  <select
                    id="cliente-area"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    {...register("area")}
                  >
                    <option value="contabil">Contábil</option>
                    <option value="juridico">Advogado</option>
                    <option value="ambos">Contábil e jurídico</option>
                  </select>
                  {erro("area")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-status">Situação</Label>
                  <select
                    id="cliente-status"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    {...register("status")}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="pendente">Pendente</option>
                    <option value="inativo">Inativo</option>
                  </select>
                  {erro("status")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-tipo-atendimento">
                    Tipo de atendimento
                  </Label>
                  <select
                    id="cliente-tipo-atendimento"
                    disabled={atendimentoJuridico}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    {...register("tipoAtendimento")}
                  >
                    <option value="mensal">Mensal</option>
                    <option value="avulso">Serviço avulso</option>
                  </select>
                  {erro("tipoAtendimento")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente-valor-referencia">
                    {tipoAtendimento === "avulso"
                      ? "Valor do serviço"
                      : "Valor mensal"}
                  </Label>
                  <Controller
                    control={control}
                    name="valorReferencia"
                    render={({ field }) => (
                      <Input
                        id="cliente-valor-referencia"
                        inputMode="numeric"
                        disabled={atendimentoJuridico}
                        className={
                          errors.valorReferencia ? "border-destructive" : ""
                        }
                        value={field.value}
                        onBlur={field.onBlur}
                        onChange={(evento) =>
                          field.onChange(
                            formatarMoedaDigitada(evento.target.value),
                          )
                        }
                        placeholder="R$ 0,00"
                      />
                    )}
                  />
                  {erro("valorReferencia")}
                </div>
              </div>
              {atendimentoJuridico && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Tipo e valor não são aplicados ao atendimento de advogado.
                </p>
              )}
            </section>

            <section className="space-y-2 border-t pt-6">
              <Label htmlFor="cliente-observacoes">Observações</Label>
              <Textarea
                id="cliente-observacoes"
                className="min-h-28"
                {...register("observacoes")}
              />
              {erro("observacoes")}
            </section>
            <section className="space-y-4 border-t pt-6">
              <div>
                <h3 className="font-semibold">Endereço</h3>
                <p className="text-sm text-muted-foreground">
                  Informe o CEP para preencher os dados automaticamente.
                </p>
              </div>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cliente-cep">CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cliente-cep"
                      inputMode="numeric"
                      maxLength={8}
                      {...register("cep")}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={buscandoCep}
                      onClick={() => void buscarEndereco()}
                    >
                      <Search />
                      {buscandoCep ? "Buscando" : "Buscar"}
                    </Button>
                  </div>
                  {erro("cep")}
                </div>
                <div className="space-y-2">
                  <Label>Logradouro</Label>
                  <Input {...register("logradouro")} />
                  {erro("logradouro")}
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input {...register("numero")} />
                  {erro("numero")}
                </div>
                <div className="space-y-2">
                  <Label>Complemento</Label>
                  <Input {...register("complemento")} />
                  {erro("complemento")}
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input {...register("bairro")} />
                  {erro("bairro")}
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input {...register("cidade")} />
                  {erro("cidade")}
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    maxLength={2}
                    className="uppercase"
                    {...register("estado")}
                  />
                  {erro("estado")}
                </div>
              </div>
            </section>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormularioAberto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(clienteArquivado)}
        onOpenChange={(aberto) => {
          if (!aberto) setClienteArquivado(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {clienteArquivado
                ? `${clienteArquivado.nome} será removido da carteira ativa. Os dados serão preservados com segurança.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={arquivando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={arquivando}
              onClick={(evento) => {
                evento.preventDefault();
                void confirmarArquivamento();
              }}
            >
              {arquivando ? "Arquivando..." : "Arquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
