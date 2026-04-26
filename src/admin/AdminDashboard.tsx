import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { Menu, X } from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import DashboardHome from './DashboardHome';
import ClientsPage from './ClientsPage';
import ServicesPage from './ServicesPage';
import TicketsPage from './TicketsPage';
import AppointmentsPage from './AppointmentsPage';
import FinancialPage from './FinancialPage';
import ReviewsPage from './ReviewsPage';
import ProfilePage from './ProfilePage';
import AchievementsPage from './AchievementsPage';

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  clients: 'Clientes',
  services: 'Serviços',
  tickets: 'Mensagens',
  appointments: 'Agenda',
  financial: 'Financeiro',
  reviews: 'Avaliações',
  profile: 'Meu Perfil',
  achievements: 'Conquistas',
};

export default function AdminDashboard() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = location.pathname.split('/admin/')[1] || 'dashboard';
  const { theme } = useTheme();

  const handleMenuClick = () => {
    if (window.innerWidth < 769) {
      setSidebarOpen(!sidebarOpen);
    } else {
      setIsSidebarCollapsed(!isSidebarCollapsed);
    }
  };

  const handleOverlayClick = () => {
    setSidebarOpen(false);
  };

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardHome />;
      case 'clients':
        return <ClientsPage />;
      case 'services':
        return <ServicesPage />;
      case 'tickets':
        return <TicketsPage />;
      case 'appointments':
        return <AppointmentsPage />;
      case 'financial':
        return <FinancialPage />;
      case 'reviews':
        return <ReviewsPage />;
      case 'profile':
        return <ProfilePage />;
      case 'achievements':
        return <AchievementsPage />;
      default:
        return <DashboardHome />;
    }
  };

  return (
    <div className={`admin-dashboard flex h-screen bg-background overflow-hidden ${theme === 'dark' ? 'admin-dark' : ''}`}>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleOverlayClick}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed lg:relative lg:translate-x-0 z-50 transition-transform duration-300 lg:transition-none`}>
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={handleMenuClick}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="lg:hidden flex items-center px-4 py-3 border-b bg-card">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-accent"
          >
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        <AdminHeader />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
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
    </div>
  );
}