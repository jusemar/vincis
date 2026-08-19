import { z } from "zod";
import { REGIMES_TRIBUTARIOS } from "./perfil-profissional";

/**
 * Cadastro do Colaborador.
 *
 * Deliberadamente NÃO possui registro profissional (CRC/OAB), comprovante de
 * habilitação nem categoria regulamentada: o Colaborador não é contador nem
 * advogado e não deve ser obrigado a se declarar como tal.
 *
 * Também não possui `modalidadeAtuacao`: o Colaborador não abre escritório.
 * Estar ou não em uma equipe é consequência do vínculo em `empresa_membros`,
 * não uma escolha de cadastro.
 *
 * Endereço completo é opcional — só cidade e estado são exigidos, porque é o
 * mínimo que a plataforma usa para localizar o prestador. Nada é preenchido
 * por padrão: campo não informado fica vazio, nunca inventado.
 */
export const PerfilColaboradorSchema = z.object({
  nomeAtuacao: z
    .string()
    .trim()
    .min(3, "Informe como você quer ser identificado.")
    .max(255, "O nome de atuação deve ter no máximo 255 caracteres."),
  areasAtuacao: z
    .string()
    .trim()
    .min(3, "Informe pelo menos uma área de atuação.")
    .max(500, "As áreas de atuação devem ter no máximo 500 caracteres."),
  apresentacao: z
    .string()
    .trim()
    .min(30, "A apresentação deve ter pelo menos 30 caracteres.")
    .max(1000, "A apresentação deve ter no máximo 1000 caracteres."),
  cidade: z
    .string()
    .trim()
    .min(2, "Informe a cidade.")
    .max(120, "A cidade deve ter no máximo 120 caracteres."),
  estado: z
    .string()
    .trim()
    .length(2, "Informe o estado com 2 letras.")
    .transform((valor) => valor.toUpperCase()),
  cep: z
    .string()
    .trim()
    .regex(/^(\d{8})?$/, "Informe um CEP válido com 8 números ou deixe vazio.")
    .optional()
    .default(""),
  logradouro: z.string().trim().max(255).optional().default(""),
  numero: z.string().trim().max(30).optional().default(""),
  complemento: z.string().trim().max(120).optional().default(""),
  bairro: z.string().trim().max(120).optional().default(""),
  tempoExperiencia: z.coerce
    .number()
    .int("Informe uma quantidade inteira de anos.")
    .min(0, "O tempo de experiência não pode ser negativo.")
    .max(100, "O tempo de experiência deve ser de no máximo 100 anos."),
  formacao: z.string().trim().max(255).optional().default(""),
  instituicaoEnsino: z.string().trim().max(255).optional().default(""),
  especialidades: z.string().trim().max(1000).optional().default(""),
  certificacoes: z.string().trim().max(1000).optional().default(""),
  valorHora: z.coerce.number().min(0).max(100000).optional().default(0),
  disponivelAtendimento: z.boolean().optional().default(true),
  regimesAtendidos: z.array(z.enum(REGIMES_TRIBUTARIOS)).default([]),
  telefoneContato: z
    .string()
    .trim()
    .min(10, "Informe um telefone com DDD.")
    .max(20, "Informe um telefone válido."),
  emailProfissional: z.string().email("Informe um e-mail de contato válido."),
});

export type PerfilColaboradorDTO = z.input<typeof PerfilColaboradorSchema>;
