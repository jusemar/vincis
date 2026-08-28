import { z } from "zod";

/**
 * Whitelists dos três blocos ordenáveis do perfil (Casos de sucesso,
 * Experiência, FAQ).
 *
 * Cada schema valida a LISTA inteira que o modo edição envia de uma vez —
 * mesmo padrão de "substituir tudo em transação" já usado por
 * `salvarDisponibilidades` na consultoria. `id` é opcional e só existe para
 * itens que já vieram do banco; itens novos (criados no rascunho local) não
 * têm `id` e a action os insere do zero.
 */

export const CasoSucessoSchema = z.object({
  id: z.string().uuid().optional(),
  tipo: z.string().trim().min(1, "Informe o tipo do caso.").max(60),
  titulo: z.string().trim().min(1, "Informe o título do caso.").max(160),
  descricao: z.string().trim().min(1, "Informe a descrição do caso.").max(600),
});
export const CasosSucessoListaSchema = z.array(CasoSucessoSchema).max(20);

export const ExperienciaSchema = z.object({
  id: z.string().uuid().optional(),
  periodo: z.string().trim().min(1, "Informe o período.").max(60),
  titulo: z.string().trim().min(1, "Informe o título.").max(160),
  descricao: z.string().trim().min(1, "Informe a descrição.").max(600),
});
export const ExperienciasListaSchema = z.array(ExperienciaSchema).max(20);

export const PerguntaFrequenteSchema = z.object({
  id: z.string().uuid().optional(),
  pergunta: z.string().trim().min(1, "Informe a pergunta.").max(300),
  resposta: z.string().trim().min(1, "Informe a resposta.").max(1000),
});
export const PerguntasFrequentesListaSchema = z.array(PerguntaFrequenteSchema).max(30);
