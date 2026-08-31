'use client'

import { useEffect } from 'react'
import { PrecoIndisponivel } from '@/features/precos/components/PrecoIndisponivel'

/**
 * A segunda porta da vitrine de preços.
 *
 * A primeira é o `try` da rota, que cobre a leitura da configuração. Esta
 * cobre o que acontece **depois**: se o cálculo estourar durante a renderização
 * — uma resposta que o motor não sabe precificar, um estado que ninguém
 * previu —, o React devolve esta tela em vez de uma página quebrada.
 *
 * O resultado visto é o mesmo dos dois lados, e é essa a intenção: quem chegou
 * procurando preço encontra um caminho comercial, nunca um erro técnico nem um
 * número em que não se pode confiar.
 */
export default function ErroDaVitrineDePrecos({ error }: { error: Error }) {
  useEffect(() => {
    // O detalhe fica no console do navegador e no relatório do servidor; a
    // tela não expõe nada.
    console.error('[PRECIFICACAO_CALCULO_FALHOU]', {
      rota: '/precos',
      erro: `${error.name}: ${error.message}`,
    })
  }, [error])

  return <PrecoIndisponivel />
}
