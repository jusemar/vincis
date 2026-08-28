import { redirect } from 'next/navigation'
import { GestaoConsultoriasPage } from '@/features/consultorias/components/gestao/GestaoConsultoriasPage'
import {
  listarConsultoriasGestao,
  listarPrestadoresComConsultoria,
  obterIndicadoresConsultorias,
} from '@/features/consultorias/queries/gestao-consultorias'
import { BuscaConsultoriasGestaoSchema } from '@/features/consultorias/schemas/gestao-consultorias'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'

/**
 * Acompanhamento das Consultorias Agendadas pela Gestão da Vincis.
 *
 * A guarda é `validarGestorVincis` — a mesma da tela de usuários e da de
 * comunicados. Não há uma segunda regra de permissão nesta etapa: quem não
 * passa por ela é devolvido à raiz antes de qualquer consulta acontecer.
 */
export default async function GestaoConsultoriasRoute() {
  const gestor = await validarGestorVincis()
  if (!gestor) redirect('/')

  const filtros = BuscaConsultoriasGestaoSchema.parse({})
  const [inicial, indicadores, prestadores] = await Promise.all([
    listarConsultoriasGestao(filtros),
    obterIndicadoresConsultorias(),
    listarPrestadoresComConsultoria(),
  ])

  return (
    <GestaoConsultoriasPage
      gestorNome={gestor.nome}
      indicadores={indicadores}
      inicial={inicial}
      prestadores={prestadores}
    />
  )
}
