'use server'

import { PesquisaProfissionaisSchema } from '../schemas/pesquisa-profissionais'
import { pesquisarProfissionaisReais } from '../queries/pesquisar-profissionais'

export async function pesquisarProfissionaisPublicos(entrada: unknown) {
  const validacao = PesquisaProfissionaisSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Filtros inválidos.' }
  return { sucesso: true as const, dados: await pesquisarProfissionaisReais(validacao.data) }
}
