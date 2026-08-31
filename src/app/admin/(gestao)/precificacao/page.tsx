import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrecificacaoGestaoPage } from '@/features/precificacao/components/gestao/PrecificacaoGestaoPage'
import { PrecificacaoIndisponivel } from '@/features/precificacao/components/gestao/PrecificacaoIndisponivel'
import {
  EVENTOS_PRECIFICACAO,
  registrarFalha,
} from '@/features/precificacao/lib/registro'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'

/**
 * Precificação dos planos da Vincis.
 *
 * Porta fechada por perfil, como as demais telas do grupo `(gestao)`: o layout
 * já barra quem não é Gestor, esta página confere de novo e as actions
 * conferem uma terceira vez — porque uma rota protegida não protege quem chama
 * a action direto.
 *
 * A tabela é lida aqui, no servidor, e entregue inteira à tela. É a mesma
 * leitura que `/precos` faz: o Gestor edita exatamente a configuração que o
 * cliente vai encontrar do outro lado.
 */

/**
 * A leitura é conferida aqui, e não deixada para a fronteira de erro.
 *
 * A área administrativa fica atrás de dois portões de cliente — sessão e
 * contexto da empresa — que mostram um aviso de espera no lugar do conteúdo até
 * resolverem. Um Componente de Servidor que estoura lá dentro nunca chega a ser
 * montado, e a fronteira de erro que o cobriria também não: o Gestor ficava
 * olhando "Preparando seu espaço de trabalho..." para sempre. Tratar aqui é o
 * mesmo desenho de `/precos`, e é o que transforma a falha numa tela que
 * explica o que houve.
 */
async function carregarTabela(): Promise<TabelaPrecificacao | null> {
  try {
    return await obterTabelaPrecificacao()
  } catch (erro) {
    registrarFalha(
      EVENTOS_PRECIFICACAO.carregar,
      { rota: '/admin/precificacao' },
      erro,
    )
    return null
  }
}

export default async function PrecificacaoRoute() {
  const gestor = await exigirGestorDaPlataforma()
  const tabela = await carregarTabela()

  if (!tabela) return <PrecificacaoIndisponivel />

  return <PrecificacaoGestaoPage gestorNome={gestor.nome} tabela={tabela} />
}
