import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const currentPage = location.pathname.split('/admin/')[1] || 'dashboard';

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
    <div className="admin-dashboard flex h-screen bg-background overflow-hidden">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader />

        <main className="flex-1 overflow-y-auto p-6">
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