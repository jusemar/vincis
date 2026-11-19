import type { pesquisarProfissionaisReais } from "../queries/pesquisar-profissionais";
import type { Professional } from "../types/profissionais";

/** Um item do resultado da pesquisa pública de profissionais. */
export type ResultadoPesquisaProfissional = Awaited<ReturnType<typeof pesquisarProfissionaisReais>>["profissionais"][number];

/**
 * Converte um resultado da pesquisa pública no formato do `ProfessionalCard`.
 *
 * É a MESMA conversão feita hoje dentro de `components/ProfessionalsPage.tsx`
 * (a vitrine `/profissionais`), copiada aqui sem nenhuma diferença para que a
 * demonstração da Home desenhe os cards exatamente como a vitrine desenha.
 * A vitrine não foi alterada; quando for oportuno, ela pode passar a usar esta
 * função e a cópia deixa de existir.
 */
export function paraCartaoProfissional(item: ResultadoPesquisaProfissional): Professional {
  return {
    id: item.id,
    // Escritório aparece pelo nome do escritório; a pessoa, como responsável.
    name: item.escritorioNome ?? item.nome,
    responsavel: item.escritorioNome ? item.nome : null,
    tipoProfissional: item.profissao,
    ehEscritorio: Boolean(item.escritorioNome),
    photo: item.avatarUrl ?? null,
    slugPublico: item.slugPublico,
    profession: (item.profissao === "advocacia"
      ? "advogado"
      : item.profissao === "contabilidade"
        ? "contador"
        : item.profissao === "colaborador"
          ? "assistente"
          : "tecnico") as Professional["profession"],
    specialty: item.especialidades[0] ?? item.areasAtuacao[0] ?? "Atendimento profissional",
    location: `${item.cidade}, ${item.estado}`,
    rating: (item.avaliacaoMedia ?? 0) / 10,
    reviewCount: item.totalAvaliacoes,
    education: [item.formacao, item.instituicaoEnsino].filter(Boolean).join(" - ") || "Formação não informada",
    experience: `${item.experiencia ?? 0} anos`,
    hourlyRate: (item.valorHoraCentavos ?? 0) / 100,
    isAvailable: item.disponivel,
    specialties: item.especialidades,
    about: item.apresentacao,
    certifications: item.certificacoes,
    registroVerificado: item.registroVerificado,
    perfilAdvocacia: item.perfilAdvocacia,
    modeloContratacao: item.modeloContratacao,
  };
}

/**
 * O recorte que a vitrine aplica no navegador com os filtros iniciais
 * (nota mínima 0, valor/hora até R$ 1.000, qualquer disponibilidade).
 */
export function passaNosFiltrosIniciaisDaVitrine(profissional: Professional): boolean {
  return profissional.rating >= 0 && profissional.hourlyRate <= 1000;
}
