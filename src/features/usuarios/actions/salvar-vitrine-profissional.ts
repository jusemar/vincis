"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/connection";
import { perfisProfissionais } from "@/db/schema";
import { SEM_AUTORIZACAO } from "../constants/autorizacao";
import { obterPrestadorSessao } from "../lib/obter-prestador-sessao";
import { VitrineProfissionalSchema } from "../schemas/vitrine-profissional";

/**
 * Edição do conteúdo de vitrine do perfil público — apresentação,
 * especialidades, formação, certificações, áreas de atuação, cidade, estado,
 * disponibilidade e regimes atendidos.
 *
 * ## Por que não é `salvarPerfilProfissional`
 *
 * Aquela action é o cadastro regulamentado: toda gravação sua reabre análise
 * (`statusAnalise` volta para `aguardando_analise`, `enviadoEm` e
 * `analisadoEm` mudam junto). Vitrine não é cadastro — ninguém deveria perder
 * a aprovação por editar a apresentação ou trocar uma especialidade. Por isso
 * esta action nunca lê nem escreve `statusAnalise`, `enviadoEm`,
 * `analisadoEm` ou `observacaoAnalise`, e a whitelist do Zod
 * (`VitrineProfissionalSchema`) é o único portão: nenhuma chave fora dela
 * chega perto do `update`.
 *
 * ## Dono sempre pela sessão
 *
 * `obterPrestadorSessao()` é o mesmo portal já usado por catálogo e
 * consultoria — resolve o prestador da sessão (Profissional aprovado ou
 * Colaborador ativo) e nunca aceita um id vindo do cliente. O `where` do
 * `update` usa `prestador.usuarioId`, não qualquer valor da requisição.
 */
export async function salvarVitrineProfissional(entrada: unknown) {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return SEM_AUTORIZACAO;

  const validacao = VitrineProfissionalSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? "Revise os dados informados.",
    };
  }
  const valor = validacao.data;

  const [anterior] = await db
    .select({
      statusAnalise: perfisProfissionais.statusAnalise,
      cidade: perfisProfissionais.cidade,
      estado: perfisProfissionais.estado,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, prestador.usuarioId))
    .limit(1);

  if (!anterior) return SEM_AUTORIZACAO;

  /**
   * Cidade e estado ficam travados depois da aprovação — a mesma regra que já
   * vale no cadastro completo (`CAMPOS_BLOQUEADOS_APOS_APROVACAO`, em
   * `schemas/perfil-profissional.ts`). O registro profissional (CRC/OAB) é
   * conferido contra o estado informado na análise; deixar a vitrine mudar
   * isso sem nova análise seria uma porta lateral para o mesmo contorno que o
   * cadastro completo já impede.
   */
  const localizacaoBloqueada = anterior.statusAnalise === "aprovado";

  await db
    .update(perfisProfissionais)
    .set({
      apresentacao: valor.apresentacao,
      especialidades: valor.especialidades,
      certificacoes: valor.certificacoes,
      formacao: valor.formacao || null,
      instituicaoEnsino: valor.instituicaoEnsino || null,
      anoFormacao: valor.anoFormacao,
      areasAtuacao: valor.areasAtuacao,
      disponivelAtendimento: valor.disponivelAtendimento,
      regimesAtendidos: valor.regimesAtendidos,
      sobreTitulo: valor.sobreTitulo || null,
      sobreTexto: valor.sobreTexto || null,
      ...(localizacaoBloqueada
        ? {}
        : {
            cidade: valor.cidade || anterior.cidade,
            estado: valor.estado || anterior.estado,
          }),
      updatedAt: new Date(),
    })
    .where(eq(perfisProfissionais.usuarioId, prestador.usuarioId));

  // A página pública lê direto do banco a cada requisição (a rota usa sessão
  // via cookies, o que já a torna dinâmica), mas revalidar é o sinal explícito
  // de que este caminho muda o que `/perfil-profissional` mostra.
  revalidatePath("/perfil-profissional");

  return {
    sucesso: true as const,
    mensagem: localizacaoBloqueada
      ? "Vitrine atualizada. Cidade e estado não podem ser alterados após a aprovação."
      : "Vitrine atualizada.",
  };
}
