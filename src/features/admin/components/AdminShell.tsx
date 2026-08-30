"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/features/usuarios";
import { ehGestorPlataforma } from "@/features/usuarios/lib/gestor-plataforma";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { MobileAdminNavigation } from "./MobileAdminNavigation";

/**
 * Moldura única da área administrativa.
 *
 * Existe porque a Gestão da plataforma deixou de ser uma aplicação à parte: as
 * telas que vinham de `/gestao` passaram a viver dentro de `/admin` e precisam
 * da mesma barra lateral, do mesmo cabeçalho e da mesma navegação mobile que o
 * painel já usava. Em vez de repetir esse desenho, o painel e as telas de
 * Gestão passam pelo mesmo componente — não há uma segunda identidade visual.
 */
export function AdminShell({
  children,
  reputacao,
}: {
  children: React.ReactNode;
  /** Reputação do prestador, quando houver: alimenta o rodapé da barra. */
  reputacao?: { media: number | null; total: number };
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();
  const { theme } = useTheme();
  const { estaAutenticado, estaCarregando, usuario } = useAuth();
  // Quem vê os recursos exclusivos é decidido pelo perfil da sessão — a mesma
  // regra que o middleware e as guardas de servidor aplicam —, nunca pela URL
  // aberta. Esconder menu não autoriza nada; o que este valor faz é impedir que
  // a barra ofereça uma porta que o servidor vai fechar.
  const ehGestor = ehGestorPlataforma(usuario);

  useEffect(() => {
    if (!estaCarregando && !estaAutenticado) {
      router.replace("/");
    }
  }, [estaAutenticado, estaCarregando, router]);

  if (estaCarregando || !estaAutenticado) {
    return null;
  }

  return (
    <div
      className="admin-dashboard flex h-dvh bg-background overflow-hidden"
      data-theme={theme}
    >
      <div className="hidden lg:contents">
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((recolhida) => !recolhida)}
          nomeUsuario={usuario?.nome ?? "Profissional"}
          reputacao={reputacao}
          ehGestor={ehGestor}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader ocultarPerfil={ehGestor} />

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <MobileAdminNavigation ehGestor={ehGestor} />
    </div>
  );
}

export default AdminShell;
