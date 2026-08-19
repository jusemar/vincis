import { notFound, redirect } from 'next/navigation'
import { PerfilProfissionalGestao } from '@/features/usuarios/components/gestao/PerfilProfissionalGestao'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { obterPerfilProfissionalGestao } from '@/features/usuarios/queries/obter-perfil-profissional-gestao'

export default async function PerfilProfissionalGestaoPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  if (!await validarGestorVincis()) redirect('/?entrar=1')
  const dados = await obterPerfilProfissionalGestao((await params).usuarioId)
  if (!dados) notFound()
  return <PerfilProfissionalGestao dados={dados}/>
}
