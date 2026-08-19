"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { CheckCircle2, HandHeart, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
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
import { salvarPerfilColaborador } from "../../actions/salvar-perfil-colaborador";
import { REGIMES_TRIBUTARIOS } from "../../schemas/perfil-profissional";
import {
  PerfilColaboradorSchema,
  type PerfilColaboradorDTO,
} from "../../schemas/perfil-colaborador";

const REGIMES: Record<(typeof REGIMES_TRIBUTARIOS)[number], string> = {
  mei: "MEI",
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

const ETAPAS = ["Atuação", "Localização", "Contato"] as const;

/**
 * Cadastro do Colaborador.
 *
 * Espelha o design do cadastro profissional, mas sem registro (CRC/OAB), sem
 * comprovante de habilitação e sem etapa de análise: ao salvar, o colaborador
 * já entra no painel com as funcionalidades permitidas ao perfil dele.
 */
export function OnboardingColaborador({
  nome,
  email,
  whatsapp,
  dadosIniciais = {},
  modo = "cadastro",
}: {
  nome: string;
  email: string;
  whatsapp?: string | null;
  dadosIniciais?: Partial<PerfilColaboradorDTO>;
  /**
   * `cadastro`: primeira entrada, fora do painel, e ao salvar segue para /admin.
   * `perfil`: edição dentro do painel (Meu Perfil), permanecendo na página.
   */
  modo?: "cadastro" | "perfil";
}) {
  const router = useRouter();
  const { logout, refreshSession } = useAuth();
  const [etapa, setEtapa] = useState(1);
  const [mensagem, setMensagem] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<PerfilColaboradorDTO>({
    resolver: zodResolver(PerfilColaboradorSchema),
    defaultValues: {
      nomeAtuacao: dadosIniciais.nomeAtuacao ?? nome,
      areasAtuacao: dadosIniciais.areasAtuacao ?? "",
      apresentacao: dadosIniciais.apresentacao ?? "",
      cidade: dadosIniciais.cidade ?? "",
      estado: dadosIniciais.estado ?? "",
      cep: dadosIniciais.cep ?? "",
      logradouro: dadosIniciais.logradouro ?? "",
      numero: dadosIniciais.numero ?? "",
      complemento: dadosIniciais.complemento ?? "",
      bairro: dadosIniciais.bairro ?? "",
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
  const cep = useWatch({ control, name: "cep" });

  function aoFalharValidacao(erros: FieldErrors<PerfilColaboradorDTO>) {
    const primeiroCampo = Object.keys(erros)[0];
    const elemento = primeiroCampo
      ? document.querySelector<HTMLElement>(`[name="${primeiroCampo}"]`)
      : null;
    elemento?.scrollIntoView({ behavior: "smooth", block: "center" });
    elemento?.focus({ preventScroll: true });
  }

  async function continuar() {
    const campos: Record<number, (keyof PerfilColaboradorDTO)[]> = {
      1: ["nomeAtuacao", "areasAtuacao", "apresentacao"],
      2: ["cidade", "estado", "cep"],
      3: [],
    };
    if (!(await trigger(campos[etapa]))) return aoFalharValidacao(errors);
    setEtapa((atual) => Math.min(ETAPAS.length, atual + 1));
  }

  async function buscarCep() {
    setBuscandoCep(true);
    setMensagem("");
    const resultado = await consultarCep(cep ?? "");
    setBuscandoCep(false);
    if (!resultado.sucesso) return setMensagem(resultado.mensagem);
    for (const [campo, valor] of Object.entries(resultado.endereco))
      setValue(campo as keyof PerfilColaboradorDTO, valor);
  }

  async function enviar(dados: PerfilColaboradorDTO) {
    const resultado = await salvarPerfilColaborador(dados);
    setMensagem(resultado.sucesso ? "" : resultado.mensagem);
    if (!resultado.sucesso) return;
    if (modo === "perfil") {
      toast.success("Perfil atualizado.");
      router.refresh();
      return;
    }
    setConfirmacaoAberta(true);
  }

  async function irParaPainel() {
    setConfirmacaoAberta(false);
    // A sessão guarda o destino resolvido: sem atualizar, o painel recém
    // liberado continuaria redirecionando de volta para o cadastro.
    await refreshSession();
    router.replace("/admin");
    router.refresh();
  }

  async function sair() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  const erro = (campo: keyof typeof errors) =>
    errors[campo] && (
      <p className="mt-1 text-xs text-destructive">
        {errors[campo]?.message as string}
      </p>
    );

  const editando = modo === "perfil";

  return (
    <div
      className={
        editando
          ? ""
          : "min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.08),transparent_38%)] px-4 py-8"
      }
    >
      <Card className="mx-auto max-w-4xl overflow-hidden shadow-card">
        <CardContent className="p-5 sm:p-8">
          <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-amber-500/5 p-5 sm:p-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
              Perfil de colaborador
            </p>
            <HandHeart className="size-9 text-primary" />
            <h1 className="mt-4 font-serif text-3xl font-bold">
              {editando
                ? "Meu perfil de colaborador"
                : "Complete seu perfil de colaborador"}
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Colaborador presta serviços compatíveis com sua atuação. Você não
              precisa informar CRC ou OAB, e não será apresentado como contador
              ou advogado na plataforma.
            </p>
          </div>

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

          <div className="mt-6 grid grid-cols-3 gap-2">
            {ETAPAS.map((titulo, indice) => (
              <button
                key={titulo}
                type="button"
                onClick={() => indice + 1 < etapa && setEtapa(indice + 1)}
                className={`rounded-xl border px-2 py-3 text-xs font-semibold sm:text-sm ${etapa === indice + 1 ? "border-primary bg-primary text-primary-foreground" : etapa > indice + 1 ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"}`}
              >
                {indice + 1}. {titulo}
              </button>
            ))}
          </div>

          <form
            className="mt-6 space-y-6"
            onSubmit={handleSubmit(enviar, aoFalharValidacao)}
          >
            {etapa === 1 && (
              <section className="rounded-2xl border border-amber-500/15 bg-card p-5 shadow-card sm:p-6">
                <h2 className="font-serif text-xl font-semibold">
                  Como você atua
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Nome de atuação</Label>
                    <Input className="mt-2" {...register("nomeAtuacao")} />
                    {erro("nomeAtuacao")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Áreas de atuação (separadas por vírgula)</Label>
                    <Input
                      className="mt-2"
                      placeholder="Ex.: declaração de imposto de renda, rotinas fiscais"
                      {...register("areasAtuacao")}
                    />
                    {erro("areasAtuacao")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Especialidades (separadas por vírgula)</Label>
                    <Input className="mt-2" {...register("especialidades")} />
                    {erro("especialidades")}
                  </div>
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
                  <div>
                    <Label>Formação (opcional)</Label>
                    <Input className="mt-2" {...register("formacao")} />
                    {erro("formacao")}
                  </div>
                  <div>
                    <Label>Instituição de ensino (opcional)</Label>
                    <Input className="mt-2" {...register("instituicaoEnsino")} />
                    {erro("instituicaoEnsino")}
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Cursos e certificações (separados por vírgula)</Label>
                    <Input className="mt-2" {...register("certificacoes")} />
                    {erro("certificacoes")}
                  </div>
                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      {...register("disponivelAtendimento")}
                    />
                    Disponível para atendimento
                  </label>
                  <div className="sm:col-span-2">
                    <Label>Regimes que você atende</Label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {REGIMES_TRIBUTARIOS.map((regime) => (
                        <label
                          key={regime}
                          className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            value={regime}
                            {...register("regimesAtendidos")}
                          />
                          {REGIMES[regime]}
                        </label>
                      ))}
                    </div>
                  </div>
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
                  Localização
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cidade e estado são obrigatórios. O endereço completo é
                  opcional — preencha apenas se quiser.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  <div>
                    <Label>CEP (opcional)</Label>
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
                    <Label>Logradouro (opcional)</Label>
                    <Input className="mt-2" {...register("logradouro")} />
                    {erro("logradouro")}
                  </div>
                  <div>
                    <Label>Número (opcional)</Label>
                    <Input className="mt-2" {...register("numero")} />
                    {erro("numero")}
                  </div>
                  <div>
                    <Label>Complemento (opcional)</Label>
                    <Input className="mt-2" {...register("complemento")} />
                  </div>
                  <div>
                    <Label>Bairro (opcional)</Label>
                    <Input className="mt-2" {...register("bairro")} />
                    {erro("bairro")}
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
                    <Label>E-mail de contato</Label>
                    <Input
                      className="mt-2"
                      type="email"
                      {...register("emailProfissional")}
                    />
                    {erro("emailProfissional")}
                  </div>
                </div>
                {!editando && (
                  <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                    Seu cadastro não passa por análise de habilitação
                    regulamentada. Ao salvar, você já entra no painel.
                  </p>
                )}
              </section>
            )}

            {mensagem && (
              <p className="rounded-lg border p-3 text-sm">{mensagem}</p>
            )}

            <div className="sticky bottom-3 flex flex-col-reverse justify-between gap-2 rounded-2xl border bg-card/95 p-3 shadow-card backdrop-blur sm:flex-row">
              {editando ? (
                <span />
              ) : (
                <Button type="button" variant="ghost" onClick={() => void sair()}>
                  Sair
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={etapa === 1 || isSubmitting}
                  onClick={() => setEtapa((atual) => Math.max(1, atual - 1))}
                >
                  Voltar
                </Button>
                {etapa < ETAPAS.length ? (
                  <Button type="button" onClick={() => void continuar()}>
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Salvando..."
                      : editando
                        ? "Salvar alterações"
                        : "Salvar e entrar no painel"}
                  </Button>
                )}
              </div>
            </div>
          </form>

          <Dialog
            open={confirmacaoAberta}
            onOpenChange={(aberto) => {
              if (!aberto) void irParaPainel();
            }}
          >
            <DialogContent className="max-w-md text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-9 text-emerald-600" />
              </div>
              <DialogHeader className="text-center sm:text-center">
                <DialogTitle className="font-serif text-2xl">
                  Perfil de colaborador criado
                </DialogTitle>
                <DialogDescription className="text-base leading-relaxed">
                  Você já pode acessar o painel e receber convites de equipe e
                  de colaboração em clientes.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full" onClick={() => void irParaPainel()}>
                Ir para o painel
              </Button>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
