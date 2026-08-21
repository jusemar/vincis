"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/features/usuarios";
import AdminSidebar from "./AdminSidebar";
import { MobileAdminNavigation } from "./MobileAdminNavigation";
import AdminHeader from "./AdminHeader";
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
import type { Protocol } from "../types/atendimentos";
import type { ResumoDoPainelDTO } from "@/features/atendimentos/queries/painel-do-prestador";
import type { ComunicadoDTO } from "@/features/comunicados/types/comunicado";
import type { PainelDeAvaliacoesDTO } from "@/features/avaliacoes/queries/painel-de-avaliacoes";

export default function AdminDashboard({
  clientesAtivos,
  atendimentosReais = [],
  resumoDoPainel,
  comunicados = [],
  painelDeAvaliacoes,
  oportunidadesDisponiveis = 0,
}: {
  clientesAtivos: number
  /**
   * Oportunidades abertas e compatíveis que ainda não receberam proposta deste
   * prestador. Alimenta só o destaque do Dashboard — a lista em si é carregada
   * pela própria tela de Oportunidades.
   */
  oportunidadesDisponiveis?: number
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
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = searchParams.get("pagina") || "dashboard";
  const { theme } = useTheme();
  const { estaAutenticado, estaCarregando, usuario } = useAuth();

  useEffect(() => {
    if (!estaCarregando && !estaAutenticado) {
      router.replace("/");
    }
  }, [estaAutenticado, estaCarregando, router]);

  if (estaCarregando || !estaAutenticado) {
    return null;
  }

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

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
          />
        );
      case "clients":
        return <ClientsPage />;
      case "services":
        return <ServicesPage />;
      case "tickets":
        return <TicketsPage />;
      case "appointments":
        return <AppointmentsPage />;
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
          />
        );
    }
  };

  return (
    <div
      className="admin-dashboard flex h-dvh bg-background overflow-hidden"
      data-theme={theme}
    >
      <div className="hidden lg:contents">
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={toggleSidebar}
          nomeUsuario={usuario?.nome ?? "Profissional"}
          reputacao={reputacao}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader />

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
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
        </main>
      </div>
      <MobileAdminNavigation />
    </div>
  );
}
