"use client";

import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Ticket,
  Calendar,
  DollarSign,
  Star,
  User,
  Award,
  Settings,
  Headphones,
  UsersRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  nomeUsuario: string;
  /**
   * Reputação real do prestador, para o rodapé.
   *
   * Antes o rodapé trazia "★ 4.8 · 124 avaliações" escrito à mão. O formato
   * continua o mesmo — nota, ponto médio e quantidade —, mas os dois números
   * agora vêm da mesma agregação que o card público usa. Ausente (carregamento
   * ou perfil sem reputação) cai no traço, nunca num número inventado.
   */
  reputacao?: { media: number | null; total: number };
}

/**
 * Navegação do painel.
 *
 * `Serviços` saiu daqui: o catálogo do prestador passou a viver em
 * `Meu Perfil → Serviços`, e o trabalho contratado é executado em
 * `Atendimentos`. A rota `?pagina=services` continua existindo — só deixou de
 * ser um destino do menu operacional.
 */
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "team", label: "Equipe", icon: UsersRound },
  { id: "tickets", label: "Mensagens", icon: Ticket, badge: 3 },
  { id: "appointments", label: "Agenda", icon: Calendar },
  { id: "atendimentos", label: "Atendimentos", icon: Headphones },
  { id: "financial", label: "Financeiro", icon: DollarSign },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "profile", label: "Meu Perfil", icon: User },
  { id: "achievements", label: "Conquistas", icon: Award },
];

export default function AdminSidebar({
  isCollapsed,
  onToggle,
  nomeUsuario,
  reputacao,
}: SidebarProps) {
  const searchParams = useSearchParams();
  const currentPage = searchParams.get("pagina") || "dashboard";

  return (
    <aside className={`sidebar ${isCollapsed ? "" : "expanded"}`}>
      {/* Logo */}
      <div className="logo-wrap">
        <div className="logo-mark">V</div>
        <span className="logo-text">Vincis</span>
      </div>

      {/* Nav Items */}
      <nav
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.id === "dashboard" ? "/admin" : `/admin?pagina=${item.id}`}
              style={{ textDecoration: "none" }}
            >
              <motion.button
                className={`nav-btn ${isActive ? "active" : ""}`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onToggle}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      marginLeft: "auto",
                      height: 20,
                      minWidth: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      background: "hsl(var(--primary))",
                      color: "hsl(var(--primary-foreground))",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "0 6px",
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </motion.button>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <button className="nav-btn" onClick={() => {}}>
        <Settings size={18} className="nav-icon" />
        <span className="nav-label">Configurações</span>
      </button>

      {/* Footer: Avatar + Nome */}
      <div className="sidebar-footer">
        <div className="sidebar-avatar">
          {nomeUsuario
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte[0])
            .join("")
            .toUpperCase()}
        </div>
        <div className="nav-label" style={{ opacity: 1, width: "auto" }}>
          <p style={{ fontSize: 12, fontWeight: 600 }}>{nomeUsuario}</p>
          <p style={{ fontSize: 10, color: "hsl(var(--primary))" }}>
            ★{' '}
            {reputacao?.media != null
              ? reputacao.media.toFixed(1)
              : '—'}{' '}
            · {reputacao?.total ?? 0} avaliações
          </p>
        </div>
      </div>
    </aside>
  );
}
