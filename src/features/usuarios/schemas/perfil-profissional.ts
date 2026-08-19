import { z } from "zod";

export const CATEGORIAS_PROFISSIONAIS = [
  "contabilidade",
  "especialista_fiscal",
  "advocacia",
] as const;
export const REGIMES_TRIBUTARIOS = [
  "mei",
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
] as const;

const camposPerfilProfissional = z
  .object({
    tipoProfissional: z.enum(CATEGORIAS_PROFISSIONAIS),
    numeroRegistro: z
      .string()
      .trim()
      .max(50, "O registro deve ter no máximo 50 caracteres.")
      .optional()
      .default(""),
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
    nomeAtuacao: z.string().trim().max(255).optional().default(""),
    modalidadeAtuacao: z.enum(["individual", "escritorio"]),
    cep: z.string().regex(/^\d{8}$/, "Informe um CEP válido com 8 números."),
    logradouro: z
      .string()
      .trim()
      .min(2, "Informe o logradouro.")
      .max(255, "O logradouro deve ter no máximo 255 caracteres."),
    numero: z
      .string()
      .trim()
      .min(1, "Informe o número.")
      .max(30, "O número deve ter no máximo 30 caracteres."),
    complemento: z.string().trim().max(120).optional().default(""),
    bairro: z
      .string()
      .trim()
      .min(2, "Informe o bairro.")
      .max(120, "O bairro deve ter no máximo 120 caracteres."),
    cidade: z
      .string()
      .trim()
      .min(2, "Informe a cidade.")
      .max(120, "A cidade deve ter no máximo 120 caracteres."),
    estado: z
      .string()
      .trim()
      .length(2, "Informe o estado com 2 letras.")
      .transform((v) => v.toUpperCase()),
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
    emailProfissional: z
      .string()
      .email("Informe um e-mail profissional válido."),
  })


/** Regras que dependem de mais de um campo. Valem nos dois schemas. */
function refinarPerfil(
  dados: z.infer<typeof camposPerfilProfissional>,
  contexto: z.RefinementCtx,
) {
    const regulamentado = dados.tipoProfissional !== "especialista_fiscal";
    if (regulamentado && dados.numeroRegistro.length < 3)
      contexto.addIssue({
        code: "custom",
        path: ["numeroRegistro"],
        message: "Informe o registro profissional.",
      });
    if (
      dados.modalidadeAtuacao === "escritorio" &&
      dados.nomeAtuacao.length < 3
    )
      contexto.addIssue({
        code: "custom",
        path: ["nomeAtuacao"],
        message: "Informe o nome do escritório.",
      });
}

export const PerfilProfissionalSchema =
  camposPerfilProfissional.superRefine(refinarPerfil);

/**
 * Campos que a interface bloqueia depois que o cadastro é aprovado.
 *
 * Endereço e tempo de experiência passam a ser imutáveis: são dados que a
 * análise conferiu.
 */
export const CAMPOS_BLOQUEADOS_APOS_APROVACAO = [
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "tempoExperiencia",
] as const

/**
 * Schema usado quando o cadastro já está aprovado.
 *
 * Os campos bloqueados deixam de ser validados porque o usuário não consegue
 * corrigi-los pela tela — um cadastro antigo com CEP vazio travava qualquer
 * alteração de qualquer outra aba (o formulário falhava em `cep`, mas o campo
 * estava desabilitado). O servidor ignora o que vier nesses campos e mantém o
 * valor já gravado, então relaxar a validação aqui não abre brecha alguma.
 *
 * Para quem ainda não foi aprovado, a validação de endereço segue estrita.
 */
export const PerfilProfissionalAprovadoSchema = camposPerfilProfissional
  .extend({
    // Mesmos tipos do schema estrito, sem as restrições de formato: assim o
    // formulário continua tipado igual e só a exigência cai.
    cep: z.string(),
    logradouro: z.string(),
    numero: z.string(),
    complemento: z.string(),
    bairro: z.string(),
    cidade: z.string(),
    estado: z.string(),
    tempoExperiencia: z.coerce.number(),
  })
  // As demais regras cruzadas continuam valendo — só o endereço é relaxado.
  .superRefine(refinarPerfil);

export type PerfilProfissionalDTO = z.input<typeof PerfilProfissionalSchema>;
