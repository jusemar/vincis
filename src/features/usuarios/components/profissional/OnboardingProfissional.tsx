"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LogOut,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/usuarios";
import { consultarCep } from "../../actions/consultar-cep";
import { salvarPerfilProfissional } from "../../actions/salvar-perfil-profissional";
import {
  PerfilProfissionalSchema,
  REGIMES_TRIBUTARIOS,
  type PerfilProfissionalDTO,
} from "../../schemas/perfil-profissional";
import { ResumoPerfilProfissional } from "./ResumoPerfilProfissional";

type DadosIniciais = Partial<PerfilProfissionalDTO> & {
  statusAnalise?: string;
  observacaoAnalise?: string | null;
  comprovanteRegistroNomeOriginal?: string | null;
};
const REGIMES: Record<(typeof REGIMES_TRIBUTARIOS)[number], string> = {
  mei: "MEI",
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export function OnboardingProfissional({
  usuarioId,
  nome,
  email,
  whatsapp,
  dadosIniciais = {},
  bloquearModalidadeAtuacao = false,
}: {
  usuarioId: string;
  nome: string;
  email: string;
  whatsapp?: string | null;
  dadosIniciais?: DadosIniciais;
  bloquearModalidadeAtuacao?: boolean;
}) {
  const router = useRouter();
  const { logout } = useAuth();
  const [analisando, setAnalisando] = useState(
    dadosIniciais.statusAnalise === "aguardando_analise",
  );
  const [editando, setEditando] = useState(!analisando);
  const [mensagem, setMensagem] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroArquivo, setErroArquivo] = useState("");
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [etapa, setEtapa] = useState(1);
  const [dadosResumo, setDadosResumo] = useState<DadosIniciais>(dadosIniciais);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<PerfilProfissionalDTO>({
    resolver: zodResolver(PerfilProfissionalSchema),
    defaultValues: {
      tipoProfissional: dadosIniciais.tipoProfissional ?? "contabilidade",
      modalidadeAtuacao: dadosIniciais.modalidadeAtuacao ?? "individual",
      numeroRegistro: dadosIniciais.numeroRegistro ?? "",
      areasAtuacao: dadosIniciais.areasAtuacao ?? "",
      apresentacao: dadosIniciais.apresentacao ?? "",
      nomeAtuacao: dadosIniciais.nomeAtuacao ?? "",
      cep: dadosIniciais.cep ?? "",
      logradouro: dadosIniciais.logradouro ?? "",
      numero: dadosIniciais.numero ?? "",
      complemento: dadosIniciais.complemento ?? "",
      bairro: dadosIniciais.bairro ?? "",
      cidade: dadosIniciais.cidade ?? "",
      estado: dadosIniciais.estado ?? "",
      tempoExperiencia: dadosIniciais.tempoExperiencia ?? 0,
      formacao: dadosIniciais.formacao ?? "",
      instituicaoEnsino: dadosIniciais.instituicaoEnsino ?? "",
      especialidades: dadosIniciais.especialidades ?? "",
      certificacoes: dadosIniciais.certificacoes ?? "",
      valorHora: dadosIniciais.valorHora ?? 0,
      disponivelAtendimento: dadosIniciais.disponivelAtendimento ?? true,
      regimesAtendidos: dadosIniciais.regimesAtendidos ?? [],
      telefoneContato: dadosIniciais.telefoneContato ?? whatsapp ?? "",
      emailProfissional: dadosIniciais.emailProfissional ?? email,
    },
  });
  const categoria = useWatch({ control, name: "tipoProfissional" });
  const modalidade = useWatch({ control, name: "modalidadeAtuacao" });
  const cep = useWatch({ control, name: "cep" });

  async function continuar() {
    const campos: Record<number, (keyof PerfilProfissionalDTO)[]> = {
      1: [
        "tipoProfissional",
        "modalidadeAtuacao",
        "areasAtuacao",
        "apresentacao",
      ],
      2: ["cep", "logradouro", "numero", "bairro", "cidade", "estado"],
      3: ["telefoneContato", "emailProfissional"],
      4: [],
    };
    if (!(await trigger(campos[etapa]))) return aoFalharValidacao(errors);
    setEtapa((atual) => Math.min(4, atual + 1));
  }

  async function buscarCep() {
    setBuscandoCep(true);
    setMensagem("");
    const resultado = await consultarCep(cep);
    setBuscandoCep(false);
    if (!resultado.sucesso) return setMensagem(resultado.mensagem);
    for (const [campo, valor] of Object.entries(resultado.endereco))
      setValue(campo as keyof PerfilProfissionalDTO, valor);
  }

  async function enviar(dados: PerfilProfissionalDTO) {
    if (
      categoria !== "especialista_fiscal" &&
      !arquivo &&
      !dadosIniciais.comprovanteRegistroNomeOriginal
    ) {
      setErroArquivo("Anexe o comprovante do registro profissional.");
      const campoArquivo =
        document.querySelector<HTMLInputElement>('input[type="file"]');
      campoArquivo?.scrollIntoView({ behavior: "smooth", block: "center" });
      campoArquivo?.focus();
      return;
    }
    setErroArquivo("");
    const formData = new FormData();
    if (arquivo) formData.set("comprovante", arquivo);
    const resultado = await salvarPerfilProfissional(dados, formData);
    setMensagem(resultado.sucesso ? "" : resultado.mensagem);
    if (resultado.sucesso) {
      const status =
        dadosIniciais.statusAnalise === "aprovado"
          ? "aprovado"
          : "aguardando_analise";
      setDadosResumo({
        ...dados,
        statusAnalise: status,
        comprovanteRegistroNomeOriginal:
          arquivo?.name ?? dadosIniciais.comprovanteRegistroNomeOriginal,
      });
      setConfirmacaoAberta(true);
      router.refresh();
    }
  }
  function concluirConfirmacao() {
    setConfirmacaoAberta(false);
    if (dadosIniciais.statusAnalise !== "aprovado") {
      setAnalisando(true);
      setEditando(false);
    }
  }
  async function sair() {
    await logout();
    router.replace("/");
    router.refresh();
  }
  function aoFalharValidacao(erros: FieldErrors<PerfilProfissionalDTO>) {
    const primeiroCampo = Object.keys(erros)[0];
    const elemento = primeiroCampo
      ? document.querySelector<HTMLElement>(`[name="${primeiroCampo}"]`)
      : null;
    elemento?.scrollIntoView({ behavior: "smooth", block: "center" });
    elemento?.focus({ preventScroll: true });
  }

  if (dadosIniciais.statusAnalise === "rejeitado")
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-xl">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto size-12 text-destructive" />
            <h1 className="mt-5 font-serif text-3xl font-bold">
              Cadastro não aprovado
            </h1>
            <p className="mt-3 text-muted-foreground">
              Seu cadastro foi analisado e não foi aprovado.
            </p>
            {dadosIniciais.observacaoAnalise && (
              <p className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-left text-sm text-destructive">
                <b>Motivo:</b> {dadosIniciais.observacaoAnalise}
              </p>
            )}
            <div className="mt-6 text-left">
              <ResumoPerfilProfissional
                dados={{
                  usuarioId,
                  nome,
                  email,
                  whatsapp,
                  ...dadosResumo,
                  tempoExperiencia: Number(dadosResumo.tempoExperiencia ?? 0),
                }}
              />
            </div>
            <div className="mt-6 flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/suporte">Falar com o suporte</Link>
              </Button>
              <Button variant="ghost" onClick={() => void sair()}>
                <LogOut />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  if (analisando && !editando)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <Clock3 className="mx-auto size-12 text-primary" />
            <h1 className="mt-5 font-serif text-3xl font-bold">
              Cadastro em análise
            </h1>
            <p className="mt-3 text-muted-foreground">
              Recebemos os dados de {nome}. Você terá acesso ao painel após a
              aprovação da Vincis.
            </p>
            <div className="mt-6 text-left">
              <ResumoPerfilProfissional
                dados={{
                  usuarioId,
                  nome,
                  email,
                  whatsapp,
                  ...dadosResumo,
                  tempoExperiencia: Number(dadosResumo.tempoExperiencia ?? 0),
                }}
              />
            </div>
            <Button
              className="mt-6"
              variant="ghost"
              onClick={() => void sair()}
            >
              <LogOut /> Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const erro = (campo: keyof typeof errors) =>
    errors[campo] && (
      <p className="mt-1 text-xs text-destructive">
        {errors[campo]?.message as string}
      </p>
    );
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_38%)] px-4 py-8">
      <Card className="mx-auto max-w-4xl overflow-hidden shadow-card">
        <CardContent className="p-5 sm:p-8">
          <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-amber-500/5 p-5 sm:p-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
              Identidade profissional
            </p>
            <ShieldCheck className="size-9 text-primary" />
            <h1 className="mt-4 font-serif text-3xl font-bold">
              {dadosIniciais.statusAnalise === "correcao_solicitada"
                ? "Revise seu cadastro profissional"
                : "Complete seu perfil profissional"}
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              As informações serão reutilizadas em Meu Perfil e avaliadas pela
              equipe Vincis.
            </p>
          </div>
          {dadosIniciais.statusAnalise === "correcao_solicitada" && (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-amber-700" />
              <p>
                <b>Correção solicitada:</b>{" "}
                {dadosIniciais.observacaoAnalise ||
                  "Revise os dados apresentados e reenvie para uma nova análise."}
              </p>
            </div>
          )}
          <div className="mt-6 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-3">
            <div>
              <Label>Nome</Label>
              <p className="mt-1 text-sm font-medium">{nome}</p>
            </div>
            <div>
              <Label>E-mail da conta</Label>
              <p className="mt-1 break-all text-sm font-medium">{email}</p>
            </div>
            <div>
              <Label>WhatsApp</Label>
              <p className="mt-1 text-sm font-medium">
                {whatsapp || "Não informado"}
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-2">
            {["Perfil", "Endereço", "Contato", "Revisão"].map(
              (titulo, indice) => (
                <button
                  key={titulo}
                  type="button"
                  onClick={() => indice + 1 < etapa && setEtapa(indice + 1)}
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold sm:text-sm ${etapa === indice + 1 ? "border-primary bg-primary text-primary-foreground" : etapa > indice + 1 ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  {indice + 1}. {titulo}
                </button>
              ),
            )}
          </div>
          <form
            className="mt-6 space-y-6"
            onSubmit={handleSubmit(enviar, aoFalharValidacao)}
          >
            {etapa === 1 && (
              <section className="rounded-2xl border border-amber-500/15 bg-card p-5 shadow-card sm:p-6">
                <h2 className="font-serif text-xl font-semibold">
                  Atuação profissional
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Categoria</Label>
                    <select
                      className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                      {...register("tipoProfissional")}
                    >
                      <option value="contabilidade">
                        Contabilidade — Contador
                      </option>
                      <option value="especialista_fiscal">
                        Contabilidade — Especialista Fiscal
                      </option>
                      <option value="advocacia">Jurídico — Advogado</option>
                    </select>
                  </div>
                  <div>
                    <Label>Forma de atuação</Label>
                    {bloquearModalidadeAtuacao ? (
                      <>
                        <input
                          type="hidden"
                          {...register("modalidadeAtuacao")}
                        />
                        <Input
                          className="mt-2 bg-muted"
                          value={
                            modalidade === "escritorio"
                              ? "Escritório"
                              : "Atuação individual"
                          }
                          disabled
                          aria-readonly="true"
                        />
                      </>
                    ) : (
                      <select
                        className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                        {...register("modalidadeAtuacao")}
                      >
                        <option value="individual">Atuação individual</option>
                        <option value="escritorio">Escritório</option>
                      </select>
                    )}
                  </div>
                  {modalidade === "escritorio" && (
                    <div className="sm:col-span-2">
                      <Label>Nome do escritório</Label>
                      <Input className="mt-2" {...register("nomeAtuacao")} />
                      {erro("nomeAtuacao")}
                    </div>
                  )}
                  {categoria !== "especialista_fiscal" && (
                    <>
                      <div>
                        <Label>
                          {categoria === "advocacia"
                            ? "Número da OAB"
                            : "Número do CRC"}
                        </Label>
                        <Input
                          className={`mt-2 ${errors.numeroRegistro ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          {...register("numeroRegistro")}
                        />
                        {erro("numeroRegistro")}
                      </div>
                      <div className="sm:col-span-2">
                        <Label>
                          Comprovante do registro (PDF, JPG ou PNG, até 5 MB)
                        </Label>
                        <Input
                          className={`mt-2 ${erroArquivo ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          onChange={(e) => {
                            setArquivo(e.target.files?.[0] ?? null);
                            setErroArquivo("");
                          }}
                        />
                        {erroArquivo && (
                          <p className="mt-1 text-xs text-destructive">
                            {erroArquivo}
                          </p>
                        )}
                        {dadosIniciais.comprovanteRegistroNomeOriginal &&
                          !arquivo && (
                            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <FileCheck2 className="size-4" />
                              Arquivo atual:{" "}
                              {dadosIniciais.comprovanteRegistroNomeOriginal}
                            </p>
                          )}
                      </div>
                    </>
                  )}
                  <div>
                    <Label>Tempo de experiência</Label>
                    <select
                      className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                      {...register("tempoExperiencia")}
                    >
                      {Array.from({ length: 101 }, (_, anos) => (
                        <option key={anos} value={anos}>
                          {anos}{" "}
                          {anos === 1
                            ? "ano de experiência"
                            : "anos de experiência"}
                        </option>
                      ))}
                    </select>
                    {erro("tempoExperiencia")}
                  </div>
                  <div>
                    <Label>Formação</Label>
                    <Input className="mt-2" {...register("formacao")} />
                    {erro("formacao")}
                  </div>
                  <div>
                    <Label>Instituição de ensino</Label>
                    <Input
                      className="mt-2"
                      {...register("instituicaoEnsino")}
                    />
                    {erro("instituicaoEnsino")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Áreas de atuação (separadas por vírgula)</Label>
                    <Input className="mt-2" {...register("areasAtuacao")} />
                    {erro("areasAtuacao")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Especialidades (separadas por vírgula)</Label>
                    <Input className="mt-2" {...register("especialidades")} />
                    {erro("especialidades")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Certificações (separadas por vírgula)</Label>
                    <Input className="mt-2" {...register("certificacoes")} />
                    {erro("certificacoes")}
                  </div>
                  <div>
                    <Label>Valor por hora (R$)</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={0}
                      step="0.01"
                      {...register("valorHora")}
                    />
                    {erro("valorHora")}
                  </div>
                  <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      {...register("disponivelAtendimento")}
                    />
                    Disponível para atendimento
                  </label>
                  {categoria !== "advocacia" && (
                    <div className="sm:col-span-2">
                      <Label>Regimes atendidos</Label>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {REGIMES_TRIBUTARIOS.map((regime) => (
                          <label
                            key={regime}
                            className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="size-5 accent-primary"
                              value={regime}
                              {...register("regimesAtendidos")}
                            />
                            {REGIMES[regime]}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Label>Breve apresentação</Label>
                    <Textarea
                      className="mt-2 min-h-28"
                      {...register("apresentacao")}
                    />
                    {erro("apresentacao")}
                  </div>
                </div>
              </section>
            )}
            {etapa === 2 && (
              <section className="rounded-2xl border border-amber-500/15 bg-card p-5 shadow-card sm:p-6">
                <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
                  <MapPin className="size-5" />
                  Endereço profissional
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>CEP</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        inputMode="numeric"
                        maxLength={9}
                        {...register("cep")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={buscandoCep}
                        onClick={() => void buscarCep()}
                      >
                        <Search />
                        {buscandoCep ? "Buscando" : "Buscar"}
                      </Button>
                    </div>
                    {erro("cep")}
                  </div>
                  <div>
                    <Label>Logradouro</Label>
                    <Input className="mt-2" {...register("logradouro")} />
                    {erro("logradouro")}
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input className="mt-2" {...register("numero")} />
                    {erro("numero")}
                  </div>
                  <div>
                    <Label>Complemento</Label>
                    <Input className="mt-2" {...register("complemento")} />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input className="mt-2" {...register("bairro")} />
                    {erro("bairro")}
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input className="mt-2" {...register("cidade")} />
                    {erro("cidade")}
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input
                      className="mt-2 uppercase"
                      maxLength={2}
                      {...register("estado")}
                    />
                    {erro("estado")}
                  </div>
                </div>
              </section>
            )}
            {etapa === 3 && (
              <section className="rounded-2xl border border-amber-500/15 bg-card p-5 shadow-card sm:p-6">
                <h2 className="font-serif text-xl font-semibold">
                  Contato profissional
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Telefone</Label>
                    <Input className="mt-2" {...register("telefoneContato")} />
                    {erro("telefoneContato")}
                  </div>
                  <div>
                    <Label>E-mail profissional</Label>
                    <Input
                      className="mt-2"
                      type="email"
                      {...register("emailProfissional")}
                    />
                    {erro("emailProfissional")}
                  </div>
                </div>
              </section>
            )}
            {etapa === 4 && (
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-card sm:p-6">
                <h2 className="font-serif text-xl font-semibold">
                  Revise e envie
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Confira seus dados profissionais, endereço e contato antes de
                  encaminhar o cadastro para análise.
                </p>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <p>
                    <b>Profissional:</b> {nome}
                  </p>
                  <p>
                    <b>E-mail:</b> {email}
                  </p>
                  <p>
                    <b>Atuação:</b>{" "}
                    {modalidade === "escritorio" ? "Escritório" : "Individual"}
                  </p>
                  <p>
                    <b>Localização:</b>{" "}
                    {cep ? "Endereço informado" : "Endereço pendente"}
                  </p>
                </div>
              </section>
            )}
            {mensagem && (
              <p className="rounded-lg border p-3 text-sm">
                {mensagem}{" "}
                {mensagem.includes("indisponível") && (
                  <Link className="font-medium underline" href="/suporte">
                    Falar com o suporte
                  </Link>
                )}
              </p>
            )}
            <div className="sticky bottom-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col-reverse justify-between gap-2 rounded-2xl border bg-card/95 p-3 shadow-card backdrop-blur sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => void sair()}>
                Sair
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={etapa === 1 || isSubmitting}
                  onClick={() => setEtapa((atual) => Math.max(1, atual - 1))}
                >
                  Voltar
                </Button>
                {etapa < 4 ? (
                  <Button type="button" onClick={() => void continuar()}>
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Enviar para análise"}
                  </Button>
                )}
              </div>
            </div>
          </form>
          <Dialog
            open={confirmacaoAberta}
            onOpenChange={(aberto) => {
              if (!aberto) concluirConfirmacao();
            }}
          >
            <DialogContent className="max-w-md text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-9 text-emerald-600" />
              </div>
              <DialogHeader className="text-center sm:text-center">
                <DialogTitle className="font-serif text-2xl">
                  Cadastro enviado para análise
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  Seu perfil será revisado pela equipe Vincis. Você será
                  informado assim que a análise for concluída.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full" onClick={concluirConfirmacao}>
                Entendi
              </Button>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
