import { z } from "zod";

export const FUNCOES_EQUIPE = [
  "administrador",
  "profissional",
  "colaborador",
] as const;

export const PesquisaProfissionalSchema = z.object({
  empresaId: z.string().uuid("Escritório inválido."),
  busca: z
    .string()
    .trim()
    .max(100, "A busca deve ter no máximo 100 caracteres."),
  profissao: z.string().optional().default("todos"),
  estado: z.string().max(2).optional().default(""),
  cidade: z.string().max(120).optional().default(""),
  formacao: z.string().max(100).optional().default(""),
  especialidade: z.string().max(100).optional().default(""),
  modalidade: z
    .enum(["todos", "individual", "escritorio"])
    .optional()
    .default("todos"),
  // A montagem de equipe precisa enxergar os dois tipos de prestador, porque o
  // escritório convida Profissionais e Colaboradores.
  tipoPrestador: z
    .enum(["profissional", "colaborador", "todos"])
    .optional()
    .default("todos"),
  experienciaMinima: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .default(0),
});

export const EnviarConviteSchema = z.object({
  empresaId: z.string().uuid("Escritório inválido."),
  destinatarioId: z.string().uuid("Profissional inválido."),
  funcao: z.enum(FUNCOES_EQUIPE, { error: "Selecione uma função válida." }),
});

export const ResponderConviteSchema = z.object({
  conviteId: z.string().uuid("Convite inválido."),
  resposta: z.enum(["aceitar", "recusar"], { error: "Resposta inválida." }),
});

export const RemoverMembroSchema = z.object({
  empresaId: z.string().uuid("Escritório inválido."),
  usuarioId: z.string().uuid("Membro inválido."),
});

/**
 * `proprietario` fica fora de `FUNCOES_EQUIPE` de propósito: ninguém é
 * convidado nem promovido a proprietário, o papel nasce com o escritório.
 */
export const AlterarPapelMembroSchema = z.object({
  empresaId: z.string().uuid("Escritório inválido."),
  usuarioId: z.string().uuid("Membro inválido."),
  funcao: z.enum(FUNCOES_EQUIPE, { error: "Selecione uma função válida." }),
});

export type FuncaoEquipe = (typeof FUNCOES_EQUIPE)[number];
