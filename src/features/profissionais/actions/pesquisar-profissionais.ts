'use server'

import { PesquisaProfissionaisSchema } from '../schemas/pesquisa-profissionais'
import { pesquisarProfissionaisReais } from '../queries/pesquisar-profissionais'

export async function pesquisarProfissionaisPublicos(entrada: unknown) {
  const validacao = PesquisaProfissionaisSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Filtros inválidos.' }
  // A vitrine pública nunca escolhe o tipo de prestador: sempre `publico`.
  // Assim colaboradores internos de escritório não aparecem para quem pede
  // `todos` ou `colaborador` à mão — essa lista é da montagem de equipe.
  return {
    sucesso: true as const,
    dados: await pesquisarProfissionaisReais({ ...validacao.data, tipoPrestador: 'publico' }),
  }
}
