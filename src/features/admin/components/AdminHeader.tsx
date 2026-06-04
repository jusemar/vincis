import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Search,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import ThemeToggle from '@/components/shared/ThemeToggle';

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: 'ticket' | 'payment' | 'appointment' | 'review';
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: 1, title: 'Novo ticket', message: 'João Silva enviou uma mensagem', time: '2 min', type: 'ticket', read: false },
  { id: 2, title: 'Pagamento confirmado', message: 'Maria Santos efetuou o pagamento', time: '1h', type: 'payment', read: false },
  { id: 3, title: 'Agendamento', message: 'Reunião amanhã às 10h', time: '3h', type: 'appointment', read: true },
  { id: 4, title: 'Nova avaliação', message: 'Você recebeu 5 estrelas!', time: '1 dia', type: 'review', read: true },
];

export default function AdminHeader() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const unreadCount = mockNotifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'ticket': return '💬';
      case 'payment': return '💰';
      case 'appointment': return '📅';
      case 'review': return '⭐';
    }
  };

  return (
    <header className="h-16 border-b bg-card/50 backdrop-blur-md flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar clientes, serviços..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 h-10 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <div className="relative">
          <motion.button
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
                {unreadCount}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-12 w-80 bg-card border rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Notificações</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {mockNotifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        className={`p-4 border-b hover:bg-accent/50 cursor-pointer transition-colors ${
                          !notif.read ? 'bg-primary/5' : ''
                        }`}
                        whileHover={{ x: 4 }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{getNotificationIcon(notif.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{notif.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                          </div>
                          {!notif.read && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="p-3 border-t">
                    <button className="w-full text-sm text-primary hover:underline">
                      Ver todas as notificações
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <motion.button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center">
              <span className="font-bold text-sm text-on-gradient">AS</span>
            </div>
            <div className="text-left hidden md:block">
              <p className="text-sm font-medium">Ana Silva</p>
              <p className="text-xs text-muted-foreground">Contadora</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.button>

          <AnimatePresence>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-12 w-56 bg-card border rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b">
                    <p className="text-sm font-medium">Ana Silva</p>
                    <p className="text-xs text-muted-foreground">ana.silva@email.com</p>
                  </div>
                  <div className="p-2">
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors">
                      <User className="w-4 h-4" />
                      Meu Perfil
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors">
                      <Settings className="w-4 h-4" />
                      Configurações
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-accent transition-colors text-destructive">
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}