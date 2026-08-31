'use client'

import { useEffect } from 'react'
import { PrecificacaoIndisponivel } from '@/features/precificacao/components/gestao/PrecificacaoIndisponivel'

/**
 * O que a Central Vincis mostra quando um módulo não consegue carregar.
 *
 * ## Por que ela existe
 *
 * A Precificação lê a configuração comercial no servidor e **falha alto** de
 * propósito: uma grade incoerente lança em vez de virar um preço que ninguém
 * consegue explicar. Sem esta porta, esse "alto" chegava ao Gestor como a tela
 * de carregamento do painel que nunca terminava — o mesmo sintoma de uma rede
 * lenta, sem dizer o que houve nem o que fazer.
 *
 * ## O que ela diz, e o que não diz
 *
 * Diz que a configuração não pôde ser lida e oferece os dois caminhos que
 * existem: tentar de novo e voltar para a Central. Não mostra a mensagem do
 * erro, o nome de tabela, consulta nem pilha — quem administra preço precisa
 * saber que não pode confiar na tela, não precisa do detalhe interno. O detalhe
 * fica no relatório do servidor, onde o registro da Precificação já o guarda.
 */
export default function ErroDaCentralVincis({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[PRECIFICACAO_CARREGAR]', {
      area: 'central_vincis',
      erro: `${error.name}: ${error.message}`,
    })
  }, [error])

  return <PrecificacaoIndisponivel aoTentarDeNovo={reset} />
}
