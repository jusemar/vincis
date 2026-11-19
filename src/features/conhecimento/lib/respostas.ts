import { z } from 'zod'
import { ErroEditorial } from './edicao-artigo'

export type RespostaAcao<T extends object = object> =
  | ({ sucesso: true; mensagem: string } & T)
  | { sucesso: false; mensagem: string; problemas?: string[] }

export const SEM_PERMISSAO = { sucesso: false as const, mensagem: 'Você não tem permissão para esta ação.' }

/** Erro conhecido vira mensagem; erro inesperado vai para o log e vira mensagem genérica. */
export function respostaDeErro(erro: unknown, contexto: string): { sucesso: false; mensagem: string; problemas?: string[] } {
  if (erro instanceof ErroEditorial) return { sucesso: false, mensagem: erro.message, problemas: erro.problemas }
  if (erro instanceof z.ZodError)
    return { sucesso: false, mensagem: 'Dados inválidos.', problemas: erro.issues.map((issue) => issue.message) }
  // Corrida pela mesma URL entre a conferência e a gravação: o índice único decide.
  const codigo = (erro as { code?: string; cause?: { code?: string } } | null)
  if (codigo?.code === '23505' || codigo?.cause?.code === '23505')
    return { sucesso: false, mensagem: 'Esta URL amigável acabou de ser usada por outro artigo. Escolha outra.' }
  console.error(`[CONHECIMENTO_FALHA] ${contexto}`, erro)
  return { sucesso: false, mensagem: 'Não foi possível concluir agora. Tente novamente.' }
}
