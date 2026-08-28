"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/connection";
import { perfisProfissionais } from "@/db/schema";
import { SEM_AUTORIZACAO } from "@/features/usuarios/constants/autorizacao";
import { enviarAvatarPublico, removerAvatarPublico } from "@/features/usuarios/lib/avatar-profissional";
import { obterPrestadorSessao } from "@/features/usuarios/lib/obter-prestador-sessao";

/**
 * Upload/troca do avatar do próprio prestador.
 *
 * Dono sempre pela sessão (`obterPrestadorSessao`), nunca por id do client. O
 * arquivo antigo só é removido depois que o novo já está gravado em
 * `avatar_url` — nunca antes, para não deixar o perfil sem foto se o `update`
 * falhar.
 */
export async function salvarAvatarProfissional(formulario: FormData) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const arquivo = formulario.get("avatar");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { sucesso: false as const, mensagem: "Selecione uma imagem." };
  }

  const [anterior] = await db
    .select({ avatarUrl: perfisProfissionais.avatarUrl })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, prestador.usuarioId))
    .limit(1);
  if (!anterior) return SEM_AUTORIZACAO;

  let novo: { url: string };
  try {
    novo = await enviarAvatarPublico(prestador.usuarioId, arquivo);
  } catch (erro) {
    return {
      sucesso: false as const,
      mensagem: erro instanceof Error ? erro.message : "Não foi possível enviar a imagem.",
    };
  }

  await db
    .update(perfisProfissionais)
    .set({ avatarUrl: novo.url, updatedAt: new Date() })
    .where(eq(perfisProfissionais.usuarioId, prestador.usuarioId));

  if (anterior.avatarUrl) await removerAvatarPublico(anterior.avatarUrl);

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: "Foto atualizada.", url: novo.url };
}
