import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrecificacaoGestaoPage } from '@/features/precificacao/components/gestao/PrecificacaoGestaoPage'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'

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
export default async function PrecificacaoRoute() {
  const gestor = await exigirGestorDaPlataforma()

  return (
    <PrecificacaoGestaoPage
      gestorNome={gestor.nome}
      tabela={await obterTabelaPrecificacao()}
    />
  )
}
