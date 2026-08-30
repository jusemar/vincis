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
  Target,
  UsersRound,
  Megaphone,
  CalendarClock,
  BadgeDollarSign,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { recursosPermitidos, ROTA_ADMIN } from "../constants/recursos";

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
  /**
   * A sessão é do Gestor da Plataforma.
   *
   * Vem do perfil autenticado, resolvido pelo `AdminShell` — não da rota
   * aberta. É o mesmo valor que decide o menu mobile, para que um item nunca
   * apareça num e falte no outro.
   */
  ehGestor?: boolean;
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
  // Oportunidade é a etapa anterior à contratação: entra como destino próprio,
  // vizinho de Atendimentos, e nunca dentro deles.
  { id: "oportunidades", label: "Oportunidades", icon: Target },
  { id: "financial", label: "Financeiro", icon: DollarSign },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "profile", label: "Meu Perfil", icon: User },
  { id: "achievements", label: "Conquistas", icon: Award },
];

/**
 * Ícone de cada recurso administrativo que é rota própria.
 *
 * A lista de recursos e a regra de quem os vê ficam no registro central
 * (`constants/recursos`); aqui mora só o desenho. Recurso novo sem ícone cai
 * num padrão em vez de sumir do menu.
 */
const ICONE_DO_RECURSO: Record<string, LucideIcon> = {
  usuarios: Users,
  comunicados: Megaphone,
  consultorias: CalendarClock,
  precificacao: BadgeDollarSign,
};

export default function AdminSidebar({
  isCollapsed,
  onToggle,
  nomeUsuario,
  reputacao,
  ehGestor = false,
}: SidebarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Fora da raiz do painel a pessoa está numa tela de Gestão: nenhum item de
  // `?pagina=` pode ficar aceso, ou "Dashboard" marcaria presença onde não está.
  const noPainel = pathname === ROTA_ADMIN;
  const currentPage = noPainel ? searchParams.get("pagina") || "dashboard" : "";
  // Uma só lista, filtrada pela autorização real — e não pela tela em que a
  // pessoa está. O menu mobile lê exatamente esta função.
  const recursos = recursosPermitidos({ ehGestor });

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
        {ehGestor ? (
          <>
            <Link href={ROTA_ADMIN} style={{ textDecoration: "none" }}>
              <motion.button
                className={`nav-btn ${noPainel ? "active" : ""}`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onToggle}
              >
                <LayoutDashboard size={18} className="nav-icon" />
                <span className="nav-label">Início</span>
              </motion.button>
            </Link>
            {recursos.map((recurso) => {
              const Icon = ICONE_DO_RECURSO[recurso.id] ?? LayoutDashboard;
              const isActive =
                pathname === recurso.rota ||
                pathname.startsWith(`${recurso.rota}/`);
              return (
                <Link
                  key={recurso.id}
                  href={recurso.rota}
                  style={{ textDecoration: "none" }}
                >
                  <motion.button
                    className={`nav-btn ${isActive ? "active" : ""}`}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onToggle}
                  >
                    <Icon size={18} className="nav-icon" />
                    <span className="nav-label">{recurso.rotulo}</span>
                  </motion.button>
                </Link>
              );
            })}
          </>
        ) : (
          navItems.map((item) => {
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
            })
        )}
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
          {/* Reputação é coisa de quem presta serviço: na Gestão não há nota a
              exibir, e um "★ — · 0 avaliações" ali seria um dado inventado. */}
          {ehGestor ? (
            <p style={{ fontSize: 10, color: "hsl(var(--primary))" }}>
              Gestão da plataforma
            </p>
          ) : (
            <p style={{ fontSize: 10, color: "hsl(var(--primary))" }}>
              ★{' '}
              {reputacao?.media != null
                ? reputacao.media.toFixed(1)
                : '—'}{' '}
              · {reputacao?.total ?? 0} avaliações
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
