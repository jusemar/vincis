import { redirect } from 'next/navigation'
import AdminDashboard from '@/features/admin/components/AdminDashboard'
import { mapearAtendimentoParaCard } from '@/features/admin/lib/atendimentos-reais'
import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { obterResumoDoPainel } from '@/features/atendimentos/queries/painel-do-prestador'
import { listarComunicadosDoMural } from '@/features/comunicados/queries/listar-comunicados'
import { emitirAvisosDePrazo } from '@/features/notificacoes/lib/avisos-de-prazo'
import { contarClientesAtivosProfissional } from '@/features/clientes/queries/listar-clientes'
import { garantirEscritorioProfissional } from '@/features/empresas/lib/garantir-escritorio-profissional'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'

export default async function AdminRoute() {
  const usuario = await obterSessaoServidor()

  if (!usuario) redirect('/')
  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || acesso.destino !== '/admin') redirect(acesso?.destino ?? '/')

  await garantirEscritorioProfissional(usuario.id)
  // Prazo é o único aviso que ninguém dispara: quem o dispara é o relógio.
  // Sem agendador na infraestrutura, a abertura do painel é o gatilho — e a
  // função não repete aviso já dado nas últimas 24 horas.
  await emitirAvisosDePrazo(usuario.id)
  const clientesAtivos = await contarClientesAtivosProfissional(usuario.id)

  // Os Atendimentos reais são carregados e formatados aqui, no servidor: o
  // quadro recebe cards prontos e não precisa saber que o banco existe.
  const atendimentos = await listarAtendimentosDoPrestador(usuario.id)
  const atendimentosReais = atendimentos.map((atendimento) =>
    mapearAtendimentoParaCard(atendimento, usuario.id),
  )

  // Números do painel e mural institucional. Carregados aqui, junto do resto:
  // o Dashboard é um componente de cliente e buscar de lá faria a tela piscar.
  //
  // O mural respeita a audiência do perfil — um comunicado dirigido a Clientes
  // não chega ao Dashboard de quem presta serviço. O recorte é do SQL.
  const [resumoDoPainel, comunicados] = await Promise.all([
    obterResumoDoPainel(usuario.id),
    listarComunicadosDoMural(acesso.perfil),
  ])

  return (
    <AdminDashboard
      clientesAtivos={clientesAtivos}
      atendimentosReais={atendimentosReais}
      resumoDoPainel={resumoDoPainel}
      comunicados={comunicados}
    />
  )
}
