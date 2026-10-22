"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/connection";
import { perfisProfissionais } from "@/db/schema";
import { SEM_AUTORIZACAO } from "@/features/usuarios/constants/autorizacao";
import {
  enviarAvatarPublico,
  removerAvatarPublico,
  type FinalidadeImagemPerfil,
} from "@/features/usuarios/lib/avatar-profissional";
import { obterPrestadorSessao } from "@/features/usuarios/lib/obter-prestador-sessao";

/**
 * As duas imagens públicas do perfil, cada uma na sua coluna.
 *
 * O mapa é fixo e mora no servidor: o navegador escolhe *qual action* chama,
 * nunca *qual coluna* é escrita. É isso que garante a independência — a action
 * do destaque não tem como tocar em `avatar_url`, e vice-versa.
 */
const IMAGENS = {
  avatar: {
    campo: "avatarUrl",
    salva: "Foto atualizada.",
    removida: "Foto removida.",
    ausente: "Você ainda não tem foto.",
  },
  destaque: {
    campo: "fotoDestaqueUrl",
    salva: "Imagem do perfil atualizada.",
    removida: "Imagem do perfil removida.",
    ausente: "Seu perfil ainda não tem imagem.",
  },
} as const satisfies Record<
  FinalidadeImagemPerfil,
  { campo: "avatarUrl" | "fotoDestaqueUrl"; salva: string; removida: string; ausente: string }
>;

async function lerImagemAtual(usuarioId: string, finalidade: FinalidadeImagemPerfil) {
  const [anterior] = await db
    .select({ url: perfisProfissionais[IMAGENS[finalidade].campo] })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1);
  return anterior;
}

async function gravarImagem(usuarioId: string, finalidade: FinalidadeImagemPerfil, url: string | null) {
  await db
    .update(perfisProfissionais)
    .set({ [IMAGENS[finalidade].campo]: url, updatedAt: new Date() })
    .where(eq(perfisProfissionais.usuarioId, usuarioId));
}

/**
 * Upload/troca de uma imagem do próprio prestador.
 *
 * Dono sempre pela sessão (`obterPrestadorSessao`), nunca por id do client. O
 * arquivo antigo só é removido depois que o novo já está gravado na coluna —
 * nunca antes, para não deixar o perfil sem imagem se o `update` falhar.
 */
async function salvarImagem(finalidade: FinalidadeImagemPerfil, arquivo: FormDataEntryValue | null) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { sucesso: false as const, mensagem: "Selecione uma imagem." };
  }

  const anterior = await lerImagemAtual(prestador.usuarioId, finalidade);
  if (!anterior) return SEM_AUTORIZACAO;

  let novo: { url: string };
  try {
    novo = await enviarAvatarPublico(prestador.usuarioId, arquivo, finalidade);
  } catch (erro) {
    return {
      sucesso: false as const,
      mensagem: erro instanceof Error ? erro.message : "Não foi possível enviar a imagem.",
    };
  }

  await gravarImagem(prestador.usuarioId, finalidade, novo.url);
  if (anterior.url) await removerAvatarPublico(anterior.url);

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: IMAGENS[finalidade].salva, url: novo.url };
}

/**
 * Remoção de uma imagem do próprio prestador.
 *
 * Mesma porta de entrada do upload: o dono vem da sessão, nunca do client.
 * Primeiro a coluna volta a `null` — é o que todas as telas leem —, só então
 * o arquivo sai do Blob; uma falha ali deixa no máximo um arquivo órfão,
 * nunca um perfil apontando para imagem inexistente.
 */
async function removerImagem(finalidade: FinalidadeImagemPerfil) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const anterior = await lerImagemAtual(prestador.usuarioId, finalidade);
  if (!anterior) return SEM_AUTORIZACAO;
  if (!anterior.url) {
    return { sucesso: true as const, mensagem: IMAGENS[finalidade].ausente };
  }

  await gravarImagem(prestador.usuarioId, finalidade, null);
  await removerAvatarPublico(anterior.url);

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: IMAGENS[finalidade].removida };
}

/** Avatar: a foto dos cards de `/profissionais`, editada em Admin > Meu perfil. */
export async function salvarAvatarProfissional(formulario: FormData) {
  return salvarImagem("avatar", formulario.get("avatar"));
}

export async function removerAvatarProfissional() {
  return removerImagem("avatar");
}

/** Foto de destaque: a imagem grande do perfil público, editada na própria página. */
export async function salvarFotoDestaqueProfissional(formulario: FormData) {
  return salvarImagem("destaque", formulario.get("foto"));
}

export async function removerFotoDestaqueProfissional() {
  return removerImagem("destaque");
}
