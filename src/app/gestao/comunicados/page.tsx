import { redirect } from 'next/navigation'
import { ComunicadosGestaoPage } from '@/features/comunicados/components/gestao/ComunicadosGestaoPage'
import { listarComunicadosDaGestao } from '@/features/comunicados/queries/listar-comunicados'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'

/**
 * Área de comunicados institucionais.
 *
 * Porta fechada por perfil: só o Gestor da Vincis chega aqui. Profissional,
 * Colaborador e Cliente são redirecionados antes de a página existir — e as
 * actions repetem a conferência, porque uma rota protegida não protege quem
 * chama a action direto.
 */
export default async function ComunicadosRoute() {
  const gestor = await validarGestorVincis()
  if (!gestor) redirect('/')

  return (
    <ComunicadosGestaoPage
      gestorNome={gestor.nome}
      comunicados={await listarComunicadosDaGestao()}
    />
  )
}
