import { redirect } from 'next/navigation'
import { GestaoVincisInicial } from '@/features/gestao-vincis/components/GestaoVincisInicial'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { PrazoOportunidadeCard } from '@/features/configuracoes/components/PrazoOportunidadeCard'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { contarCadastrosProfissionaisPendentes } from '@/features/usuarios/queries/contar-cadastros-profissionais-pendentes'

export default async function GestaoVincisRoute() {
  const usuario = await obterSessaoServidor()

  if (!usuario) redirect('/')
  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || acesso.destino !== '/gestao') redirect(acesso?.destino ?? '/')

  return (
    <GestaoVincisInicial
      nome={usuario.nome}
      cadastrosPendentes={await contarCadastrosProfissionaisPendentes()}
      configuracoes={
        // Regras da plataforma que a Gestão define. Entra como slot para não
        // mexer no desenho já aprovado da tela inicial.
        <PrazoOportunidadeCard horas={await obterPrazoOportunidadeHoras()} />
      }
    />
  )
}
