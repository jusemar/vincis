"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/connection";
import {
  perfilCasosSucesso,
  perfilExperiencias,
  perfilPerguntasFrequentes,
} from "@/db/schema";
import { SEM_AUTORIZACAO } from "@/features/usuarios/constants/autorizacao";
import { obterPrestadorSessao } from "@/features/usuarios/lib/obter-prestador-sessao";
import {
  CasosSucessoListaSchema,
  ExperienciasListaSchema,
  PerguntasFrequentesListaSchema,
} from "../schemas/conteudo-vitrine";

/**
 * Persistência dos três blocos ordenáveis de vitrine — Casos de sucesso,
 * Experiência e FAQ.
 *
 * ## Substituir tudo, em transação
 *
 * Cada action recebe a lista inteira (já na ordem final) e troca o conteúdo
 * gravado por ela: apaga as linhas do prestador e insere de novo com `ordem`
 * = posição no array. Mesmo padrão de `salvarDisponibilidades`, da
 * consultoria — criar, editar, remover e reordenar são a mesma operação
 * quando a fonte da verdade é "a lista completa que a pessoa está vendo
 * agora", e evita quatro rotas concorrentes (criar/editar/excluir/mover) para
 * o mesmo dado.
 *
 * ## Dono sempre pela sessão
 *
 * `obterPrestadorSessao()` — o mesmo portal de catálogo, consultoria e da
 * vitrine (Prompt 3) — nunca aceita `prestadorId` do cliente. O `where` do
 * `delete` e o `prestadorId` do `insert` usam sempre `prestador.usuarioId`.
 */

function primeiraMensagem(erro: { issues: { message: string }[] }) {
  return erro.issues[0]?.message ?? "Revise os dados informados.";
}

export async function salvarCasosSucesso(entrada: unknown) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const validacao = CasosSucessoListaSchema.safeParse(entrada);
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(perfilCasosSucesso)
      .where(eq(perfilCasosSucesso.prestadorId, prestador.usuarioId));
    if (validacao.data.length) {
      await tx.insert(perfilCasosSucesso).values(
        validacao.data.map((item, indice) => ({
          prestadorId: prestador.usuarioId,
          tipo: item.tipo,
          titulo: item.titulo,
          descricao: item.descricao,
          ordem: indice,
        })),
      );
    }
  });

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: "Casos de sucesso atualizados." };
}

export async function salvarExperiencias(entrada: unknown) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const validacao = ExperienciasListaSchema.safeParse(entrada);
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(perfilExperiencias)
      .where(eq(perfilExperiencias.prestadorId, prestador.usuarioId));
    if (validacao.data.length) {
      await tx.insert(perfilExperiencias).values(
        validacao.data.map((item, indice) => ({
          prestadorId: prestador.usuarioId,
          periodo: item.periodo,
          titulo: item.titulo,
          descricao: item.descricao,
          ordem: indice,
        })),
      );
    }
  });

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: "Histórico profissional atualizado." };
}

export async function salvarPerguntasFrequentes(entrada: unknown) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const validacao = PerguntasFrequentesListaSchema.safeParse(entrada);
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(perfilPerguntasFrequentes)
      .where(eq(perfilPerguntasFrequentes.prestadorId, prestador.usuarioId));
    if (validacao.data.length) {
      await tx.insert(perfilPerguntasFrequentes).values(
        validacao.data.map((item, indice) => ({
          prestadorId: prestador.usuarioId,
          pergunta: item.pergunta,
          resposta: item.resposta,
          ordem: indice,
        })),
      );
    }
  });

  revalidatePath("/perfil-profissional");
  return { sucesso: true as const, mensagem: "FAQ atualizado." };
}
