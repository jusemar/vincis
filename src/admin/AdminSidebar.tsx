import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Package,
  Ticket,
  Calendar,
  DollarSign,
  Star,
  User,
  LogOut,
  Award,
  Settings,
  Headphones,
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'services', label: 'Serviços', icon: Package },
  { id: 'tickets', label: 'Mensagens', icon: Ticket, badge: 3 },
  { id: 'appointments', label: 'Agenda', icon: Calendar },
  { id: 'atendimentos', label: 'Atendimentos', icon: Headphones },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'reviews', label: 'Avaliações', icon: Star },
  { id: 'profile', label: 'Meu Perfil', icon: User },
  { id: 'achievements', label: 'Conquistas', icon: Award },
];

export default function AdminSidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const currentPage = location.pathname.split('/admin/')[1] || 'dashboard';

  return (
    <aside className={`sidebar ${isCollapsed ? '' : 'expanded'}`}>
      {/* Logo */}
      <div className="logo-wrap">
        <div className="logo-mark">V</div>
        <span className="logo-text">Vincis</span>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const Icon = item.icon;
          return (
            <Link key={item.id} to={`/admin/${item.id}`} style={{ textDecoration: 'none' }}>
              <motion.button
                className={`nav-btn ${isActive ? 'active' : ''}`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onToggle}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
                {item.badge && (
                  <span style={{
                    marginLeft: 'auto',
                    height: 20,
                    minWidth: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '999px',
                    background: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '0 6px'
                  }}>
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
        <div className="sidebar-avatar">AS</div>
        <div className="nav-label" style={{ opacity: 1, width: 'auto' }}>
          <p style={{ fontSize: 12, fontWeight: 600 }}>Ana Silva</p>
          <p style={{ fontSize: 10, color: 'hsl(var(--primary))' }}>★ 4.8 · 124 avaliações</p>
        </div>
      </div>
    </aside>
  );
}