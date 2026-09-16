"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/connection";
import { empresas } from "@/db/schema";
import { IdentidadeFiscalSchema } from "@/features/documentos-fiscais/schemas/identidade-fiscal";
import { obterPrestadorSessao } from "@/features/usuarios/lib/obter-prestador-sessao";
import { permissoesEscritorio } from "../lib/papeis-escritorio";
import { obterVinculoAtivo } from "../queries/equipe";

/**
 * Identidade fiscal do escritório — o CNPJ/CPF do próprio contribuinte.
 *
 * Fica junto da área de equipe porque é lá que os dados do escritório são
 * administrados; não existe (nem foi criada) uma segunda tela de configuração.
 * Quem pode alterar é quem já administra o escritório: a mesma matriz de
 * `papeis-escritorio` que autoriza convidar, remover e atribuir. O módulo
 * fiscal não ganha permissão nova por precisar do dado.
 *
 * Alterar aqui vale para o que vier depois. Documento fiscal já processado
 * guarda o snapshot da própria nota e não é reclassificado em silêncio — quando
 * for preciso, existe o reprocessamento explícito.
 */

const EntradaSchema = z.object({
  empresaId: z.string().uuid("Escritório inválido."),
  tipoIdentificacaoFiscal: z.union([z.enum(["cpf", "cnpj", "estrangeiro"]), z.literal("")]).optional().default(""),
  identificacaoFiscal: z.string().trim().max(30).optional().default(""),
});

const NAO_AUTORIZADO = { sucesso: false as const, mensagem: "Acesso não autorizado." };

export async function atualizarIdentidadeFiscalEscritorio(entrada: unknown) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return NAO_AUTORIZADO;

  const dados = EntradaSchema.safeParse(entrada);
  if (!dados.success) {
    return { sucesso: false as const, mensagem: dados.error.issues[0]?.message ?? "Revise os dados." };
  }

  const vinculo = await obterVinculoAtivo(prestador.usuarioId, dados.data.empresaId);
  if (!permissoesEscritorio(vinculo).administrar) return NAO_AUTORIZADO;

  // Mesma regra do cadastro de cliente e do módulo fiscal: uma definição só.
  const identidade = IdentidadeFiscalSchema.safeParse({
    tipoIdentificacaoFiscal: dados.data.tipoIdentificacaoFiscal,
    identificacaoFiscal: dados.data.identificacaoFiscal,
  });
  if (!identidade.success) {
    return {
      sucesso: false as const,
      mensagem: identidade.error.issues[0]?.message ?? "Revise o CPF/CNPJ informado.",
    };
  }

  await db
    .update(empresas)
    .set({ ...identidade.data, updatedAt: new Date() })
    .where(eq(empresas.id, dados.data.empresaId));

  revalidatePath("/admin");
  return {
    sucesso: true as const,
    mensagem: identidade.data.identificacaoFiscal
      ? "Identificação fiscal do escritório salva."
      : "Identificação fiscal do escritório removida.",
    dados: identidade.data,
  };
}
