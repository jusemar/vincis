import { GestaoInicio } from '@/features/admin/components/GestaoInicio'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrazoOportunidadeCard } from '@/features/configuracoes/components/PrazoOportunidadeCard'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { contarCadastrosProfissionaisPendentes } from '@/features/usuarios/queries/contar-cadastros-profissionais-pendentes'

/**
 * A casa da Gestão da Plataforma.
 *
 * Ela existe porque o Gestor deixou de ser uma persona à parte: ele entra em
 * `/admin` e encontra o painel do próprio escritório, como qualquer
 * Profissional. Os assuntos da plataforma — cadastros esperando análise, prazo
 * das oportunidades, atalhos para os recursos exclusivos — ficariam sem
 * endereço se dependessem daquela tela inicial.
 *
 * O conteúdo é o mesmo de antes; o que mudou foi deixar de ser a única coisa
 * que o Gestor via ao entrar.
 */
export default async function PlataformaRoute() {
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
