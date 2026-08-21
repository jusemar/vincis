"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import {
  BriefcaseBusiness,
  CheckCircle2,
  DollarSign,
  Package,
  GraduationCap,
  MapPin,
  Plus,
  Save,
  Star,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CatalogoServicos } from "@/features/servicos/components/CatalogoServicos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  obterMeuPerfilProfissional,
  salvarPerfilProfissional,
} from "@/features/usuarios/actions/salvar-perfil-profissional";
import {
  PerfilProfissionalAprovadoSchema,
  PerfilProfissionalSchema,
  REGIMES_TRIBUTARIOS,
  type PerfilProfissionalDTO,
} from "@/features/usuarios/schemas/perfil-profissional";

type Perfil = NonNullable<
  Awaited<ReturnType<typeof obterMeuPerfilProfissional>>
>;

const CATEGORIAS = {
  contabilidade: "Contador",
  advocacia: "Advogado",
  especialista_fiscal: "Especialista fiscal",
} as const;

const REGIMES = {
  mei: "MEI",
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
} as const;

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function TagEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [novoItem, setNovoItem] = useState("");
  const itens = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  function adicionar() {
    const item = novoItem.trim();
    if (!item || itens.includes(item)) return;
    onChange([...itens, item].join(", "));
    setNovoItem("");
  }

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="min-h-11 rounded-lg border border-amber-500/15 bg-muted/40 p-2">
        <div className="flex flex-wrap gap-2">
          {itens.length ? (
            itens.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remover ${item}`}
                  className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                  onClick={() =>
                    onChange(itens.filter((atual) => atual !== item).join(", "))
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          ) : (
            <span className="px-1 text-sm text-muted-foreground">
              Nenhum item informado.
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          value={novoItem}
          placeholder={placeholder}
          onChange={(event) => setNovoItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              adicionar();
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={adicionar}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

/** Em qual aba mora cada campo, para levar o usuário ao erro. */
const ABA_DO_CAMPO: Record<string, string> = {
  tipoProfissional: "dados",
  numeroRegistro: "dados",
  nomeAtuacao: "dados",
  modalidadeAtuacao: "dados",
  apresentacao: "dados",
  telefoneContato: "dados",
  emailProfissional: "dados",
  cep: "dados",
  logradouro: "dados",
  numero: "dados",
  complemento: "dados",
  bairro: "dados",
  cidade: "dados",
  estado: "dados",
  areasAtuacao: "especialidades",
  especialidades: "especialidades",
  certificacoes: "especialidades",
  formacao: "especialidades",
  instituicaoEnsino: "especialidades",
  tempoExperiencia: "especialidades",
  regimesAtendidos: "especialidades",
  valorHora: "valores",
  disponivelAtendimento: "valores",
};

export function ProfessionalProfileContent({
  perfil,
  nome,
  email,
  whatsapp,
}: {
  perfil: Perfil;
  nome: string;
  email: string;
  whatsapp: string | null | undefined;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Permite chegar direto no catálogo vindo de Admin → Serviços.
  const router = useRouter();
  const parametros = useSearchParams();
  const abaInicial =
    parametros.get("aba") === "servicos" ? "servicos" : "dados";
  const [abaAtiva, setAbaAtiva] = useState(abaInicial);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PerfilProfissionalDTO>({
    // Cadastro aprovado bloqueia endereço e experiência na tela; validar esses
    // campos impediria salvar qualquer outra coisa quando o dado legado é
    // inválido e o usuário não tem como corrigir.
    resolver: zodResolver(
      perfil.statusAnalise === "aprovado"
        ? PerfilProfissionalAprovadoSchema
        : PerfilProfissionalSchema,
    ),
    defaultValues: {
      tipoProfissional:
        perfil.tipoProfissional as PerfilProfissionalDTO["tipoProfissional"],
      numeroRegistro: perfil.numeroRegistro ?? "",
      areasAtuacao: perfil.areasAtuacao,
      apresentacao: perfil.apresentacao,
      nomeAtuacao: perfil.nomeAtuacao,
      modalidadeAtuacao: perfil.modalidadeAtuacao as
        "individual" | "escritorio",
      cep: perfil.cep ?? "",
      logradouro: perfil.logradouro ?? "",
      numero: perfil.numero ?? "",
      complemento: perfil.complemento ?? "",
      bairro: perfil.bairro ?? "",
      cidade: perfil.cidade,
      estado: perfil.estado,
      tempoExperiencia: perfil.tempoExperiencia ?? 0,
      formacao: perfil.formacao ?? "",
      instituicaoEnsino: perfil.instituicaoEnsino ?? "",
      especialidades: perfil.especialidades,
      certificacoes: perfil.certificacoes,
      valorHora: perfil.valorHora,
      disponivelAtendimento: perfil.disponivelAtendimento,
      regimesAtendidos:
        perfil.regimesAtendidos as PerfilProfissionalDTO["regimesAtendidos"],
      telefoneContato: perfil.telefoneContato ?? whatsapp ?? "",
      emailProfissional: perfil.emailProfissional,
    },
  });

  const categoria = useWatch({ control, name: "tipoProfissional" });
  const especialidades = useWatch({ control, name: "especialidades" }) ?? "";
  const certificacoes = useWatch({ control, name: "certificacoes" }) ?? "";
  const areasAtuacao = useWatch({ control, name: "areasAtuacao" }) ?? "";
  const modalidade = useWatch({ control, name: "modalidadeAtuacao" });
  const valorHora = useWatch({ control, name: "valorHora" }) ?? 0;
  const disponivelAtendimento = useWatch({
    control,
    name: "disponivelAtendimento",
  });
  const temAvaliacoes =
    perfil.totalAvaliacoes > 0 && perfil.avaliacaoMedia !== null;
  const perfilAprovado = perfil.statusAnalise === "aprovado";

  const erro = (campo: keyof typeof errors) =>
    errors[campo] ? (
      <p className="mt-1 text-xs text-destructive">
        {errors[campo]?.message as string}
      </p>
    ) : null;

  /**
   * Falha de validação.
   *
   * Antes isto apenas focava o campo — e quando o campo inválido estava em
   * outra aba, o foco não produzia nenhum efeito visível: o usuário clicava em
   * Salvar e não acontecia nada, nem toast, nem erro. Agora a recusa é sempre
   * anunciada, com a mensagem do próprio campo.
   */
  function aoFalhar(erros: FieldErrors<PerfilProfissionalDTO>) {
    const campo = Object.keys(erros)[0];
    const mensagem = campo
      ? ((erros as Record<string, { message?: string }>)[campo]?.message ??
        "Revise os campos destacados.")
      : "Revise os campos destacados.";
    toast.error(mensagem);
    // O campo inválido pode estar em outra aba. Sem trocar de aba, o usuário
    // lê o erro e não encontra onde corrigir.
    const destino = ABA_DO_CAMPO[campo] ?? "dados";
    setAbaAtiva(destino);
    // O foco só funciona depois que a aba de destino renderiza.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[name="${campo}"]`)?.focus(),
    );
  }

  async function salvar(dados: PerfilProfissionalDTO) {
    const formulario = new FormData();
    if (arquivo) formulario.set("comprovante", arquivo);
    const resultado = await salvarPerfilProfissional(dados, formulario);
    if (!resultado.sucesso) return toast.error(resultado.mensagem);
    toast.success("Perfil atualizado com sucesso.");
    setArquivo(null);
    // Recarrega os dados do servidor para a tela refletir o que foi gravado.
    router.refresh();
  }

  return (
    <form
      className="mx-auto max-w-5xl space-y-5"
      onSubmit={handleSubmit(salvar, aoFalhar)}
    >
      <Card className="overflow-hidden border-amber-500/20 shadow-card">
        <div className="h-1 bg-gradient-gold" />
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-gold text-xl font-bold text-on-gradient ring-4 ring-amber-500/15">
            {perfil.avatarUrl ? (
              <img
                src={perfil.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              iniciais(nome)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
              Meu perfil profissional
            </p>
            <h1 className="mt-1 truncate font-serif text-2xl font-bold sm:text-3xl">
              {nome}
            </h1>
            <p className="mt-1 text-sm font-medium text-primary">
              {CATEGORIAS[perfil.tipoProfissional as keyof typeof CATEGORIAS]}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{perfil.numeroRegistro || "Registro não aplicável"}</span>
              <span className="hidden text-amber-500 sm:inline">•</span>
              <span>
                {perfil.cidade}, {perfil.estado}
              </span>
            </p>
            {modalidade === "escritorio" && (
              <p className="mt-2 text-sm text-muted-foreground">
                Escritório:{" "}
                {perfil.empresaVinculada?.nome ?? perfil.nomeAtuacao}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">Experiência</p>
              <p className="font-bold text-amber-700 dark:text-amber-300">
                {perfil.tempoExperiencia ?? 0} anos
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-muted/50 px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">Avaliação</p>
              {temAvaliacoes ? (
                <p className="flex items-center gap-1 font-bold text-foreground">
                  {((perfil.avaliacaoMedia ?? 0) / 10)
                    .toFixed(1)
                    .replace(".", ",")}
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-xs font-medium text-muted-foreground">
                    ({perfil.totalAvaliacoes})
                  </span>
                </p>
              ) : (
                <p className="text-xs font-medium text-muted-foreground">
                  Ainda sem avaliações
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-4 rounded-xl border border-amber-500/15 bg-muted/70 p-1.5">
          <TabsTrigger
            value="dados"
            className="h-11 gap-2 rounded-lg text-xs sm:text-sm"
          >
            <BriefcaseBusiness />
            Dados e profissão
          </TabsTrigger>
          <TabsTrigger
            value="especialidades"
            className="h-11 gap-2 rounded-lg text-xs sm:text-sm"
          >
            <GraduationCap />
            Especialidades
          </TabsTrigger>
          <TabsTrigger
            value="valores"
            className="h-11 gap-2 rounded-lg text-xs sm:text-sm"
          >
            <DollarSign />
            Valores
          </TabsTrigger>
          <TabsTrigger
            value="servicos"
            className="h-11 gap-2 rounded-lg text-xs sm:text-sm"
          >
            <Package />
            Serviços
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Informações pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input value={nome} disabled />
                </div>
                <div className="space-y-2">
                  <Label>E-mail da conta</Label>
                  <Input value={email} disabled />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input {...register("telefoneContato")} />
                    {erro("telefoneContato")}
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail profissional</Label>
                    <Input type="email" {...register("emailProfissional")} />
                    {erro("emailProfissional")}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Profissão e formação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Profissão</Label>
                    <Input
                      value={
                        CATEGORIAS[
                          perfil.tipoProfissional as keyof typeof CATEGORIAS
                        ]
                      }
                      disabled
                    />
                    <input type="hidden" {...register("tipoProfissional")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Registro (OAB/CRC)</Label>
                    <Input
                      disabled={categoria === "especialista_fiscal"}
                      {...register("numeroRegistro")}
                    />
                    {erro("numeroRegistro")}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Formação</Label>
                    <Input {...register("formacao")} />
                    {erro("formacao")}
                  </div>
                  <div className="space-y-2">
                    <Label>Instituição de ensino</Label>
                    <Input {...register("instituicaoEnsino")} />
                    {erro("instituicaoEnsino")}
                  </div>
                </div>
                {modalidade === "escritorio" && (
                  <div className="space-y-2">
                    <Label>Escritório ou empresa vinculada</Label>
                    <Input
                      value={
                        perfil.empresaVinculada?.nome ?? perfil.nomeAtuacao
                      }
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">
                      O vínculo e a organização são gerenciados em fluxo
                      próprio.
                    </p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tempo de experiência</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      disabled={perfilAprovado}
                      {...register("tempoExperiencia")}
                    >
                      {Array.from({ length: 101 }, (_, anos) => (
                        <option key={anos} value={anos}>
                          {anos} {anos === 1 ? "ano" : "anos"}
                        </option>
                      ))}
                    </select>
                    {erro("tempoExperiencia")}
                  </div>
                  <div className="space-y-2">
                    <Label>Forma de atuação</Label>
                    <Input
                      value={
                        modalidade === "escritorio"
                          ? "Escritório"
                          : "Atuação individual"
                      }
                      disabled
                    />
                    <input type="hidden" {...register("modalidadeAtuacao")} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="size-4 text-amber-500" />
                  Localização profissional
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input disabled={perfilAprovado} {...register("cidade")} />
                  {erro("cidade")}
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    maxLength={2}
                    className="uppercase"
                    disabled={perfilAprovado}
                    {...register("estado")}
                  />
                  {erro("estado")}
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input disabled={perfilAprovado} {...register("cep")} />
                  {erro("cep")}
                </div>
                <div className="space-y-2">
                  <Label>Logradouro</Label>
                  <Input
                    disabled={perfilAprovado}
                    {...register("logradouro")}
                  />
                  {erro("logradouro")}
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input disabled={perfilAprovado} {...register("numero")} />
                  {erro("numero")}
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input disabled={perfilAprovado} {...register("bairro")} />
                  {erro("bairro")}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Complemento</Label>
                  <Input
                    disabled={perfilAprovado}
                    {...register("complemento")}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comprovante</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {perfil.comprovanteRegistroNomeOriginal
                    ? `Arquivo atual: ${perfil.comprovanteRegistroNomeOriginal}`
                    : "Nenhum comprovante enviado."}
                </p>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) =>
                    setArquivo(event.target.files?.[0] ?? null)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  PDF, JPG ou PNG, até 5 MB.
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="border-amber-500/15 shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Apresentação profissional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea className="min-h-28" {...register("apresentacao")} />
              {erro("apresentacao")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="especialidades" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Especialidades</CardTitle>
              </CardHeader>
              <CardContent>
                <TagEditor
                  label="Áreas de especialidade"
                  value={especialidades}
                  onChange={(valor) =>
                    setValue("especialidades", valor, { shouldDirty: true })
                  }
                  placeholder="Nova especialidade"
                />
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Áreas atendidas</CardTitle>
              </CardHeader>
              <CardContent>
                <TagEditor
                  label="Áreas de atuação"
                  value={areasAtuacao}
                  onChange={(valor) =>
                    setValue("areasAtuacao", valor, { shouldDirty: true })
                  }
                  placeholder="Nova área de atuação"
                />
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Certificações</CardTitle>
              </CardHeader>
              <CardContent>
                <TagEditor
                  label="Qualificações e certificações"
                  value={certificacoes}
                  onChange={(valor) =>
                    setValue("certificacoes", valor, { shouldDirty: true })
                  }
                  placeholder="Nova certificação"
                />
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Regimes atendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {REGIMES_TRIBUTARIOS.map((regime) => (
                    <label
                      key={regime}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/10 p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        value={regime}
                        {...register("regimesAtendidos")}
                        disabled={categoria === "advocacia"}
                      />
                      {REGIMES[regime]}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="valores" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Valores de consultoria
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Valor por hora (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    {...register("valorHora")}
                  />
                  {erro("valorHora")}
                </div>
                <div className="space-y-2">
                  <Label>Disponibilidade para serviços avulsos</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-amber-500/15 bg-muted/40 p-2">
                    <button
                      type="button"
                      onClick={() =>
                        setValue("disponivelAtendimento", true, {
                          shouldDirty: true,
                        })
                      }
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${disponivelAtendimento ? "bg-gradient-gold text-on-gradient shadow-sm" : "text-muted-foreground hover:bg-background"}`}
                    >
                      Disponível
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setValue("disponivelAtendimento", false, {
                          shouldDirty: true,
                        })
                      }
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${!disponivelAtendimento ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background"}`}
                    >
                      Indisponível no momento
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quando indisponível, seu perfil continua visível, mas
                    serviços avulsos ficam temporariamente bloqueados.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/15 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo comercial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-muted/50 p-4 text-sm">
                  <p className="text-muted-foreground">Valor de consultoria</p>
                  <p className="mt-1 text-2xl font-bold text-primary">
                    R$ {Number(valorHora).toFixed(2)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    por hora de atendimento
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Informações comerciais atualizadas no seu perfil.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Catálogo público do prestador. Fica fora do formulário de perfil
            porque tem persistência própria — o botão Salvar abaixo continua
            cuidando apenas dos dados do perfil. */}
        <TabsContent value="servicos" className="mt-0">
          <CatalogoServicos />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] flex justify-end rounded-2xl border border-amber-500/20 bg-card/95 p-3 shadow-card backdrop-blur">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-gradient-gold font-semibold text-on-gradient shadow-glow hover:shadow-glow-lg"
        >
          <Save />
          {isSubmitting ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
