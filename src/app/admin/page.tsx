import { redirect } from 'next/navigation'
import AdminDashboard from '@/features/admin/components/AdminDashboard'
import { mapearAtendimentoParaCard } from '@/features/admin/lib/atendimentos-reais'
import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { listarConsultoriasDoPrestador } from '@/features/consultorias/queries/agendamentos'
import { obterResumoDoPainel } from '@/features/atendimentos/queries/painel-do-prestador'
import { obterPainelDeAvaliacoes } from '@/features/avaliacoes/queries/painel-de-avaliacoes'
import { listarComunicadosDoMural } from '@/features/comunicados/queries/listar-comunicados'
import { contarDisponiveisPorOrigem } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
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
  // Abrir o painel deixou de emitir aviso de prazo.
  //
  // Prazo é o único aviso que ninguém dispara — quem o dispara é o relógio —, e
  // enquanto não havia agendador a renderização desta página fazia esse papel.
  // Isso tinha dois defeitos: quem não abrisse o painel não era cobrado, e abrir
  // o painel gravava linhas no banco, o que uma renderização não deveria fazer.
  // Agora quem varre é `/api/cron/processar-prazos`, de hora em hora.
  const clientesAtivos = await contarClientesAtivosProfissional(usuario.id)

  // Os Atendimentos reais são carregados e formatados aqui, no servidor: o
  // quadro recebe cards prontos e não precisa saber que o banco existe.
  const atendimentos = await listarAtendimentosDoPrestador(usuario.id)
  const atendimentosReais = atendimentos.map((atendimento) =>
    mapearAtendimentoParaCard(atendimento, usuario.id),
  )

  // A Agenda deixou de ser uma tela de exemplo: estas são as consultorias que
  // este Profissional vendeu. O recorte é do SQL (`prestador_id = sessão`), de
  // modo que a agenda de outro Profissional não chega ao navegador.
  const consultorias = await listarConsultoriasDoPrestador(usuario.id)

  // Números do painel e mural institucional. Carregados aqui, junto do resto:
  // o Dashboard é um componente de cliente e buscar de lá faria a tela piscar.
  //
  // O mural respeita a audiência do perfil — um comunicado dirigido a Clientes
  // não chega ao Dashboard de quem presta serviço. O recorte é do SQL.
  //
  // As avaliações reais entram na mesma carga: média, quantidade, distribuição
  // e comentários recebidos. Um dado só alimenta a tela de Avaliações, o rodapé
  // da barra lateral e os dois indicadores de reputação do Dashboard.
  //
  // As Oportunidades entram só como número: o destaque do Dashboard precisa
  // saber quantas esperam resposta, e a lista em si é carregada pela própria
  // tela de Oportunidades quando a pessoa vai até lá. O recorte por origem
  // acompanha porque o destaque diz coisas diferentes quando o Cliente escolheu
  // este Profissional no perfil dele.
  const [resumoDoPainel, comunicados, painelDeAvaliacoes, oportunidades] =
    await Promise.all([
      obterResumoDoPainel(usuario.id),
      listarComunicadosDoMural(acesso.perfil),
      obterPainelDeAvaliacoes(usuario.id),
      contarDisponiveisPorOrigem(usuario.id),
    ])

  return (
    <AdminDashboard
      clientesAtivos={clientesAtivos}
      atendimentosReais={atendimentosReais}
      consultorias={consultorias.futuras}
      resumoDoPainel={resumoDoPainel}
      comunicados={comunicados}
      painelDeAvaliacoes={painelDeAvaliacoes}
      oportunidadesDisponiveis={oportunidades.total}
      solicitacoesDiretas={oportunidades.diretas}
    />
  )
}
