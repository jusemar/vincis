"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/features/usuarios";
import { AdminShell } from "./AdminShell";
import DashboardHome from "./DashboardHome";
import ClientsPage from "./ClientsPage";
import ServicesPage from "./ServicesPage";
import TicketsPage from "./TicketsPage";
import AppointmentsPage from "./AppointmentsPage";
import FinancialPage from "./FinancialPage";
import ReviewsPage from "./ReviewsPage";
import ProfilePage from "./ProfilePage";
import AchievementsPage from "./AchievementsPage";
import AtendimentosPage from "./AtendimentosPage";
import EquipeEscritorioPage from "@/features/empresas/components/EquipeEscritorioPage";
import OportunidadesPage from "@/features/oportunidades/components/prestador/OportunidadesPage";
import type { ConsultoriaDoPrestadorDTO2 } from "@/features/consultorias/types/agendamento";
import type { Protocol } from "../types/atendimentos";
import type { ResumoDoPainelDTO } from "@/features/atendimentos/queries/painel-do-prestador";
import type { ComunicadoDTO } from "@/features/comunicados/types/comunicado";
import type { PainelDeAvaliacoesDTO } from "@/features/avaliacoes/queries/painel-de-avaliacoes";

export default function AdminDashboard({
  clientesAtivos,
  atendimentosReais = [],
  consultorias = [],
  resumoDoPainel,
  comunicados = [],
  painelDeAvaliacoes,
  oportunidadesDisponiveis = 0,
  solicitacoesDiretas = 0,
}: {
  clientesAtivos: number
  /**
   * Oportunidades abertas e compatíveis que ainda não receberam proposta deste
   * prestador. Alimenta só o destaque do Dashboard — a lista em si é carregada
   * pela própria tela de Oportunidades.
   */
  oportunidadesDisponiveis?: number
  /**
   * Quantas das pendentes foram dirigidas a este Profissional pelo perfil dele.
   *
   * Subconjunto de `oportunidadesDisponiveis`, não uma segunda fila: o destaque
   * continua sendo um só, e este número apenas muda o que ele diz.
   */
  solicitacoesDiretas?: number
  /**
   * Avaliações reais recebidas pelo prestador.
   *
   * Carregado no servidor junto do resto e distribuído para os três pontos do
   * painel que falam de reputação — a tela de Avaliações, o rodapé da barra
   * lateral e os dois indicadores do Dashboard. Um dado só, três leituras: é o
   * que impede o painel de discordar de si mesmo.
   */
  painelDeAvaliacoes?: PainelDeAvaliacoesDTO
  /** Indicadores reais do Dashboard. Os cards mockados continuam ao lado. */
  resumoDoPainel?: ResumoDoPainelDTO
  /** Mural institucional da Vincis, já filtrado pela audiência do perfil. */
  comunicados?: ComunicadoDTO[]
  /**
   * Atendimentos reais do prestador, carregados no servidor.
   *
   * Vêm prontos de `/admin` porque o quadro é um componente de cliente: buscar
   * daqui exigiria um fetch no navegador e faria a tela piscar.
   */
  atendimentosReais?: Protocol[]
  /** Consultorias agendadas deste Profissional, da mais próxima em diante. */
  consultorias?: ConsultoriaDoPrestadorDTO2[]
}) {
  const searchParams = useSearchParams();
  const currentPage = searchParams.get("pagina") || "dashboard";
  const { usuario } = useAuth();

  /** Média e quantidade, no formato enxuto que o rodapé e o card consomem. */
  const reputacao = painelDeAvaliacoes
    ? {
        media: painelDeAvaliacoes.reputacao.media,
        total: painelDeAvaliacoes.reputacao.total,
      }
    : undefined;

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <DashboardHome
            clientesAtivos={clientesAtivos}
            nomeUsuario={usuario?.nome ?? "Profissional"}
            resumo={resumoDoPainel}
            comunicados={comunicados}
            reputacao={reputacao}
            oportunidadesDisponiveis={oportunidadesDisponiveis}
            solicitacoesDiretas={solicitacoesDiretas}
          />
        );
      case "clients":
        return <ClientsPage />;
      case "services":
        return <ServicesPage />;
      case "tickets":
        return <TicketsPage />;
      case "appointments":
        return <AppointmentsPage consultorias={consultorias} />;
      case "atendimentos":
        return (
          <AtendimentosPage
            atendimentosReais={atendimentosReais}
            usuarioId={usuario?.id}
          />
        );
      case "oportunidades":
        return <OportunidadesPage />;
      case "financial":
        return <FinancialPage />;
      case "reviews":
        return <ReviewsPage painel={painelDeAvaliacoes} />;
      case "profile":
        return <ProfilePage />;
      case "team":
        return <EquipeEscritorioPage />;
      case "achievements":
        return <AchievementsPage />;
      default:
        return (
          <DashboardHome
            clientesAtivos={clientesAtivos}
            nomeUsuario={usuario?.nome ?? "Profissional"}
            resumo={resumoDoPainel}
            comunicados={comunicados}
            reputacao={reputacao}
            oportunidadesDisponiveis={oportunidadesDisponiveis}
            solicitacoesDiretas={solicitacoesDiretas}
          />
        );
    }
  };

  return (
    <AdminShell reputacao={reputacao}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>
    </AdminShell>
  );
}
