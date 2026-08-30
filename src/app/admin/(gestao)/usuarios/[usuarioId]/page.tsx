import { notFound } from 'next/navigation'
import { PerfilProfissionalGestao } from '@/features/usuarios/components/gestao/PerfilProfissionalGestao'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { obterPerfilProfissionalGestao } from '@/features/usuarios/queries/obter-perfil-profissional-gestao'

export default async function PerfilProfissionalGestaoPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  await exigirGestorDaPlataforma()
  const dados = await obterPerfilProfissionalGestao((await params).usuarioId)
  if (!dados) notFound()
  return <PerfilProfissionalGestao dados={dados}/>
}
