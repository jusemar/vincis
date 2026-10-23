import type { ResultadoCms } from '../nucleo/types'

/**
 * Chama uma Server Action do CMS a partir da interface sem deixar a falha de
 * transporte escapar.
 *
 * A action devolve `ResultadoCms` para tudo o que ela decide (sem permissão,
 * dado inválido, conflito). O que ela não decide — rede caída, requisição
 * abortada por uma navegação, erro inesperado no servidor — chega como promessa
 * rejeitada (`TypeError: Failed to fetch`). Sem isto, a rejeição sumia num
 * `startTransition` sem aviso nenhum para o Gestor.
 */
export const MENSAGEM_FALHA_TRANSPORTE_CMS =
  'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'

export async function chamarAcaoCms<T>(
  acao: () => Promise<ResultadoCms<T>>,
): Promise<ResultadoCms<T>> {
  try {
    return await acao()
  } catch (erro) {
    console.error('[CMS_ACAO_FALHOU]', erro instanceof Error ? erro.message : erro)
    return { sucesso: false, mensagem: MENSAGEM_FALHA_TRANSPORTE_CMS }
  }
}
