import { z } from "zod";

export const BuscaUsuariosGestaoSchema = z.object({
  busca: z.string().trim().max(100).default(""),
  perfil: z.string().trim().max(50).default("todos"),
  profissao: z.string().trim().max(30).default("todos"),
  modalidade: z.enum(["todos", "individual", "escritorio"]).default("todos"),
  status: z.string().trim().max(30).default("todos"),
  statusProfissional: z.string().trim().max(30).default("todos"),
  emailVerificado: z.enum(["todos", "sim", "nao"]).default("todos"),
  /** Método pelo qual a identidade da conta foi comprovada. */
  verificacao: z
    .enum(["todos", "nao_verificada", "email", "whatsapp"])
    .default("todos"),
  empresa: z.string().trim().max(120).default(""),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(50).default(10),
});
export const UsuarioGestaoIdSchema = z.string().uuid();
