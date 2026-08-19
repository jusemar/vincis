import { redirect } from 'next/navigation'
import { GestaoVincisInicial } from '@/features/gestao-vincis/components/GestaoVincisInicial'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { contarCadastrosProfissionaisPendentes } from '@/features/usuarios/queries/contar-cadastros-profissionais-pendentes'

export default async function GestaoVincisRoute() {
  const usuario = await obterSessaoServidor()

  if (!usuario) redirect('/')
  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || acesso.destino !== '/gestao') redirect(acesso?.destino ?? '/')

  return <GestaoVincisInicial nome={usuario.nome} cadastrosPendentes={await contarCadastrosProfissionaisPendentes()} />
}
