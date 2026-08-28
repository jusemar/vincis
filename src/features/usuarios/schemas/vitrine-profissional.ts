import { z } from "zod";
import { REGIMES_TRIBUTARIOS } from "./perfil-profissional";

/**
 * Whitelist da edição inline do perfil público (vitrine).
 *
 * Deliberadamente menor que `PerfilProfissionalSchema`: aqui não existe
 * `tipoProfissional`, `numeroRegistro`, `telefoneContato` nem qualquer campo
 * do cadastro regulamentado — só o que aparece na página pública e pertence ao
 * próprio profissional editar sem reabrir análise. Qualquer chave fora deste
 * schema é descartada pelo `safeParse`, nunca chega perto do `update`.
 */

const listaDeStrings = (maxItens: number, maxCadaItem: number) =>
  z
    .array(z.string().trim().min(1).max(maxCadaItem))
    .max(maxItens)
    .default([]);

const anoAtual = new Date().getFullYear();

export const VitrineProfissionalSchema = z.object({
  apresentacao: z
    .string()
    .trim()
    .min(30, "A apresentação deve ter pelo menos 30 caracteres.")
    .max(1000, "A apresentação deve ter no máximo 1000 caracteres."),
  especialidades: listaDeStrings(30, 80),
  certificacoes: listaDeStrings(30, 120),
  formacao: z.string().trim().max(255).optional().default(""),
  instituicaoEnsino: z.string().trim().max(255).optional().default(""),
  anoFormacao: z.preprocess(
    (valor) => (valor === "" || valor === undefined ? null : valor),
    z
      .union([
        z.null(),
        z.coerce
          .number()
          .int("Informe um ano válido.")
          .min(1900, "Informe um ano válido.")
          .max(anoAtual, "O ano não pode estar no futuro."),
      ])
      .default(null),
  ),
  areasAtuacao: listaDeStrings(30, 80),
  cidade: z.string().trim().max(120).optional().default(""),
  estado: z
    .string()
    .trim()
    .transform((valor) => valor.toUpperCase())
    .refine((valor) => valor === "" || valor.length === 2, {
      message: "Informe o estado com 2 letras.",
    })
    .optional()
    .default(""),
  disponivelAtendimento: z.boolean().default(true),
  regimesAtendidos: z.array(z.enum(REGIMES_TRIBUTARIOS)).max(10).default([]),
  /**
   * Conteúdo do bloco "Sobre". O kicker ("Sobre o Contador/Advogado/...") não
   * é gravado — deriva de `tipoProfissional` na apresentação, um campo
   * protegido que esta whitelist nem aceita.
   */
  sobreTitulo: z.string().trim().max(160).optional().default(""),
  sobreTexto: z.string().trim().max(2000).optional().default(""),
});

export type VitrineProfissionalDTO = z.input<typeof VitrineProfissionalSchema>;
