import { z } from "zod";

export const PesquisaProfissionaisSchema = z.object({
  /**
   * Tipo de prestador procurado.
   *
   * O padrão é `profissional` justamente porque a vitrine pública
   * (`/profissionais`) apresenta profissionais regulamentados — um Colaborador
   * nunca deve aparecer ali como contador ou advogado. Quem precisa dos dois
   * (a montagem de equipe do escritório) pede explicitamente `todos`.
   */
  tipoPrestador: z
    .enum(["profissional", "colaborador", "todos"])
    .optional()
    .default("profissional"),
  busca: z.string().trim().max(100).optional().default(""),
  profissao: z.string().trim().max(30).optional().default("todos"),
  estado: z.string().trim().max(2).optional().default(""),
  cidade: z.string().trim().max(120).optional().default(""),
  formacao: z.string().trim().max(100).optional().default(""),
  especialidade: z.string().trim().max(100).optional().default(""),
  modalidade: z
    .enum(["todos", "individual", "escritorio"])
    .optional()
    .default("todos"),
  experienciaMinima: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(0),
  pagina: z.coerce.number().int().min(1).optional().default(1),
  porPagina: z.coerce.number().int().min(1).max(30).optional().default(9),
});

export type PesquisaProfissionaisDTO = z.input<
  typeof PesquisaProfissionaisSchema
>;
