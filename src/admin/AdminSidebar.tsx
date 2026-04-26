import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Package,
  Ticket,
  Calendar,
  DollarSign,
  Star,
  User,
  Settings,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Award,
  MessageSquare,
  Video,
  Phone,
  Mail,
  Crown,
  Flame,
  Sparkles,
  Rocket,
  Trophy,
  Target,
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'services', label: 'Serviços', icon: Package },
  { id: 'tickets', label: 'Mensagens', icon: Ticket, badge: 3 },
  { id: 'appointments', label: 'Agenda', icon: Calendar },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'reviews', label: 'Avaliações', icon: Star },
  { id: 'profile', label: 'Meu Perfil', icon: User },
  { id: 'achievements', label: 'Conquistas', icon: Award },
];

export default function AdminSidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const currentPage = location.pathname.split('/admin/')[1] || 'dashboard';

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 260 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="h-screen bg-card border-r flex flex-col relative"
      >
        <div className="p-4 border-b">
          <motion.div
            className="flex items-center gap-3"
            animate={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow">
              <span className="font-bold text-xl text-on-gradient">V</span>
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-bold text-lg"
                >
                  Vincis
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                to={`/admin/${item.id}`}
                className="relative block"
              >
                <motion.div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm font-medium truncate"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto h-5 min-w-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {item.badge}
                    </span>
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t mt-auto">
          <Link to="/">
            <motion.div
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm font-medium"
                  >
                    Voltar ao Site
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </Link>
        </div>

        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border flex items-center justify-center shadow-md hover:scale-110 transition-transform"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </motion.aside>
    </>
  );
}