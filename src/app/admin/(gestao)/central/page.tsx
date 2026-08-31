import { GestaoInicio } from '@/features/admin/components/GestaoInicio'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrazoOportunidadeCard } from '@/features/configuracoes/components/PrazoOportunidadeCard'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { contarCadastrosProfissionaisPendentes } from '@/features/usuarios/queries/contar-cadastros-profissionais-pendentes'

/**
 * A Visão geral da Central Vincis, e a porta dela.
 *
 * A Central existe porque o Gestor deixou de ser uma persona à parte: ele
 * entra em `/admin` e encontra o painel do próprio escritório, como qualquer
 * Profissional. Os assuntos da plataforma — cadastros esperando análise, prazo
 * das oportunidades, atalhos para os módulos — vivem aqui, um nível abaixo da
 * barra lateral, que agora carrega um item só em vez de cinco.
 */
export default async function CentralVincisRoute() {
  const gestor = await exigirGestorDaPlataforma()

  return (
    <GestaoInicio
      nome={gestor.nome}
      cadastrosPendentes={await contarCadastrosProfissionaisPendentes()}
      configuracoes={
        <PrazoOportunidadeCard horas={await obterPrazoOportunidadeHoras()} />
      }
    />
  )
}
