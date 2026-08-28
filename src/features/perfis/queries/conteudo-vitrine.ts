import { asc, eq } from "drizzle-orm";
import { db } from "@/db/connection";
import {
  perfilCasosSucesso,
  perfilExperiencias,
  perfilPerguntasFrequentes,
} from "@/db/schema";

/**
 * Leitura pública dos três blocos ordenáveis do perfil (Casos de sucesso,
 * Experiência, FAQ).
 *
 * Sem checagem de habilitação aqui: quem decide se a página mostra estes
 * blocos é a presença de `identidade` em `/perfil-profissional` (resolvida
 * por `obterIdentidadePublica`, que já exige conta ativa, verificada e
 * prestador habilitado) — chamar estas funções sem esse portão exporia
 * conteúdo de um cadastro que a própria vitrine pública não mostraria.
 */

export async function listarCasosSucessoPublicos(prestadorId: string) {
  return db
    .select({
      id: perfilCasosSucesso.id,
      tipo: perfilCasosSucesso.tipo,
      titulo: perfilCasosSucesso.titulo,
      descricao: perfilCasosSucesso.descricao,
    })
    .from(perfilCasosSucesso)
    .where(eq(perfilCasosSucesso.prestadorId, prestadorId))
    .orderBy(asc(perfilCasosSucesso.ordem));
}

export async function listarExperienciasPublicas(prestadorId: string) {
  return db
    .select({
      id: perfilExperiencias.id,
      periodo: perfilExperiencias.periodo,
      titulo: perfilExperiencias.titulo,
      descricao: perfilExperiencias.descricao,
    })
    .from(perfilExperiencias)
    .where(eq(perfilExperiencias.prestadorId, prestadorId))
    .orderBy(asc(perfilExperiencias.ordem));
}

export async function listarPerguntasFrequentesPublicas(prestadorId: string) {
  return db
    .select({
      id: perfilPerguntasFrequentes.id,
      pergunta: perfilPerguntasFrequentes.pergunta,
      resposta: perfilPerguntasFrequentes.resposta,
    })
    .from(perfilPerguntasFrequentes)
    .where(eq(perfilPerguntasFrequentes.prestadorId, prestadorId))
    .orderBy(asc(perfilPerguntasFrequentes.ordem));
}
