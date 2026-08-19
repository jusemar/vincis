import {
  listarAvaliacoesRecebidas,
  obterDistribuicaoDeNotas,
  obterReputacaoDoPrestador,
} from './reputacao'
import type { DistribuicaoDeNotas, ReputacaoDoPrestador } from '../types/avaliacao'

/** Uma avaliação recebida, como o painel do prestador a exibe. */
export type AvaliacaoRecebidaDTO = {
  id: string
  nota: number
  comentario: string | null
  autor: string
  criadoEm: string
  protocolo: string
  atendimentoTitulo: string
}

export type PainelDeAvaliacoesDTO = {
  reputacao: ReputacaoDoPrestador
  distribuicao: DistribuicaoDeNotas[]
  recebidas: AvaliacaoRecebidaDTO[]
}

/**
 * Tudo o que a tela de Avaliações do painel mostra, numa carga só.
 *
 * Média, quantidade, distribuição e a lista de comentários vêm das **mesmas**
 * funções que alimentam o card público e o perfil público. Antes esta tela
 * tinha um `reviewStats` e um `mockReviews` escritos à mão no componente; a
 * partir daqui não há um segundo cálculo de reputação em lugar nenhum do
 * produto.
 *
 * Carregado no servidor, junto do resto de `/admin`: buscar do navegador faria
 * a tela piscar entre o vazio e o número.
 */
export async function obterPainelDeAvaliacoes(
  prestadorId: string,
): Promise<PainelDeAvaliacoesDTO> {
  const [reputacao, distribuicao, recebidas] = await Promise.all([
    obterReputacaoDoPrestador(prestadorId),
    obterDistribuicaoDeNotas(prestadorId),
    listarAvaliacoesRecebidas(prestadorId),
  ])
  return { reputacao, distribuicao, recebidas }
}
