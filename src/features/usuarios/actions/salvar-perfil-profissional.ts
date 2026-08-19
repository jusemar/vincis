"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/connection";
import { empresaMembros, empresas, perfisProfissionais } from "@/db/schema";
import {
  enviarComprovantePrivado,
  removerComprovantePrivado,
} from "../lib/comprovante-profissional";
import { ehPessoaProfissional } from "../lib/prestador";
import { obterSessaoServidor } from "../lib/sessao-servidor";
import {
  PerfilProfissionalAprovadoSchema,
  PerfilProfissionalSchema,
  type PerfilProfissionalDTO,
} from "../schemas/perfil-profissional";

export async function salvarPerfilProfissional(
  dados: PerfilProfissionalDTO,
  formularioArquivo?: FormData,
) {
  const usuario = await obterSessaoServidor();
  // Somente pessoa do tipo Profissional preenche o cadastro regulamentado.
  // O Colaborador tem cadastro próprio, em /cadastro-colaborador.
  if (!usuario || !ehPessoaProfissional(usuario.perfilTipo))
    return { sucesso: false, mensagem: "Operação não autorizada." };
  const entrada = dados as Record<string, unknown>;
  if ("avaliacaoMedia" in entrada || "totalAvaliacoes" in entrada) {
    return {
      sucesso: false,
      mensagem: "Avaliações não podem ser alteradas pelo perfil profissional.",
    };
  }

  const [anterior] = await db
    .select()
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuario.id))
    .limit(1);

  // Depois da aprovação o endereço e a experiência ficam imutáveis e a tela os
  // desabilita. Validá-los aqui impediria salvar qualquer outro campo quando o
  // dado gravado é legado e inválido — e o usuário não teria como corrigir.
  // Os valores enviados nesses campos são descartados logo abaixo.
  const schema =
    anterior?.statusAnalise === "aprovado"
      ? PerfilProfissionalAprovadoSchema
      : PerfilProfissionalSchema;
  const validacao = schema.safeParse(dados);
  if (!validacao.success)
    return {
      sucesso: false,
      mensagem:
        validacao.error.issues[0]?.message ?? "Revise os dados informados.",
    };
  const valor = validacao.data;
  // Um cadastro de colaborador não é convertido em profissional por este
  // formulário: seria promover o tipo da pessoa por um caminho lateral.
  if (anterior && anterior.tipoPrestador !== "profissional")
    return {
      sucesso: false,
      mensagem:
        "Esta conta possui cadastro de colaborador. Fale com o suporte para alterar o tipo de conta.",
    };
  if (anterior?.statusAnalise === "aguardando_analise")
    return {
      sucesso: false,
      mensagem: "O cadastro já está em análise e não pode ser alterado agora.",
    };
  if (anterior?.statusAnalise === "rejeitado")
    return {
      sucesso: false,
      mensagem:
        "Este cadastro foi encerrado. Consulte o suporte para orientação.",
    };
  if (
    anterior?.statusAnalise === "aprovado" &&
    valor.tipoProfissional !== anterior.tipoProfissional
  ) {
    return {
      sucesso: false,
      mensagem: "A profissão não pode ser alterada após a aprovação.",
    };
  }
  if (
    anterior?.statusAnalise === "aprovado" &&
    (valor.modalidadeAtuacao !== anterior.modalidadeAtuacao ||
      valor.tempoExperiencia !== anterior.tempoExperiencia ||
      valor.cep !== (anterior.cep ?? "") ||
      valor.logradouro !== (anterior.logradouro ?? "") ||
      valor.numero !== (anterior.numero ?? "") ||
      valor.complemento !== (anterior.complemento ?? "") ||
      valor.bairro !== (anterior.bairro ?? "") ||
      valor.cidade !== anterior.cidade ||
      valor.estado !== anterior.estado)
  ) {
    return {
      sucesso: false,
      mensagem:
        "A forma de atuação, localização e experiência não podem ser alteradas após a aprovação.",
    };
  }
  const arquivo = formularioArquivo?.get("comprovante");
  const exigeComprovante = valor.tipoProfissional !== "especialista_fiscal";
  if (
    exigeComprovante &&
    !(arquivo instanceof File && arquivo.size > 0) &&
    !anterior?.comprovanteRegistroChave
  ) {
    return {
      sucesso: false,
      mensagem: "Anexe o comprovante do registro profissional.",
    };
  }

  let novoComprovante: Awaited<
    ReturnType<typeof enviarComprovantePrivado>
  > | null = null;
  try {
    if (arquivo instanceof File && arquivo.size > 0)
      novoComprovante = await enviarComprovantePrivado(usuario.id, arquivo);
    const agora = new Date();
    const modalidadeAtuacao =
      anterior?.statusAnalise === "aprovado"
        ? anterior.modalidadeAtuacao
        : valor.modalidadeAtuacao;
    const nomeAtuacao =
      anterior?.statusAnalise === "aprovado"
        ? anterior.nomeAtuacao
        : modalidadeAtuacao === "individual"
          ? usuario.nome
          : valor.nomeAtuacao;
    const comprovante = novoComprovante
      ? {
          comprovanteRegistroChave: novoComprovante.chave,
          comprovanteRegistroNomeOriginal: novoComprovante.nomeOriginal,
          comprovanteRegistroTipo: novoComprovante.tipo,
          comprovanteRegistroTamanho: novoComprovante.tamanho,
          comprovanteRegistroEnviadoEm: novoComprovante.enviadoEm,
        }
      : valor.tipoProfissional === "especialista_fiscal"
        ? {
            comprovanteRegistroChave: null,
            comprovanteRegistroNomeOriginal: null,
            comprovanteRegistroTipo: null,
            comprovanteRegistroTamanho: null,
            comprovanteRegistroEnviadoEm: null,
          }
        : {};
    const registro = {
      ...valor,
      // Explícito para não depender do default da coluna em atualizações.
      tipoPrestador: "profissional" as const,
      modalidadeAtuacao,
      nomeAtuacao,
      numeroRegistro: exigeComprovante ? valor.numeroRegistro : null,
      estadoRegistro: null,
      complemento: valor.complemento || null,
      areasAtuacao: valor.areasAtuacao
        .split(",")
        .map((area) => area.trim())
        .filter(Boolean),
      especialidades: valor.especialidades
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      certificacoes: valor.certificacoes
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      tempoExperiencia: valor.tempoExperiencia,
      valorHoraCentavos: Math.round(valor.valorHora * 100),
      disponivelAtendimento: valor.disponivelAtendimento,
      regimesAtendidos:
        valor.tipoProfissional === "advocacia" ? [] : valor.regimesAtendidos,
      ...comprovante,
      statusAnalise:
        anterior?.statusAnalise === "aprovado"
          ? "aprovado"
          : "aguardando_analise",
      observacaoAnalise: null,
      enviadoEm:
        anterior?.statusAnalise === "aprovado" ? anterior.enviadoEm : agora,
    };
    await db
      .insert(perfisProfissionais)
      .values({ usuarioId: usuario.id, ...registro })
      .onConflictDoUpdate({
        target: perfisProfissionais.usuarioId,
        set: { ...registro, analisadoEm: null, updatedAt: agora },
      });
    if (
      anterior?.comprovanteRegistroChave &&
      anterior.comprovanteRegistroChave !== novoComprovante?.chave &&
      (novoComprovante || !exigeComprovante)
    ) {
      await removerComprovantePrivado(anterior.comprovanteRegistroChave).catch(
        () => undefined,
      );
    }
    // Sem isto a página seguia servindo os dados antigos do cache: o valor era
    // gravado no banco, mas ao reabrir o perfil aparecia o anterior — o que
    // fazia o salvamento parecer que não funcionava.
    revalidatePath("/admin");
    revalidatePath("/cadastro-profissional");
    return { sucesso: true, mensagem: "Cadastro enviado para análise." };
  } catch (erro) {
    if (novoComprovante)
      await removerComprovantePrivado(novoComprovante.chave).catch(
        () => undefined,
      );
    return {
      sucesso: false,
      mensagem:
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar o cadastro.",
    };
  }
}

export async function obterMeuPerfilProfissional() {
  const usuario = await obterSessaoServidor();
  if (!usuario || !ehPessoaProfissional(usuario.perfilTipo)) return null;
  const [perfil] = await db
    .select()
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuario.id))
    .limit(1);
  if (!perfil) return null;
  const [empresaVinculada] =
    perfil.modalidadeAtuacao === "escritorio"
      ? await db
          .select({ id: empresas.id, nome: empresas.nome })
          .from(empresaMembros)
          .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
          .where(
            and(
              eq(empresaMembros.usuarioId, usuario.id),
              eq(empresaMembros.status, "ativo"),
              eq(empresas.status, "ativo"),
            ),
          )
          .limit(1)
      : [];
  return {
    ...perfil,
    areasAtuacao: perfil.areasAtuacao.join(", "),
    especialidades: perfil.especialidades.join(", "),
    certificacoes: perfil.certificacoes.join(", "),
    valorHora: (perfil.valorHoraCentavos ?? 0) / 100,
    empresaVinculada: empresaVinculada ?? null,
  };
}
