import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Video,
  MapPin,
  User,
} from 'lucide-react';

interface Appointment {
  id: number;
  title: string;
  client: string;
  clientId: number;
  date: string;
  time: string;
  duration: number;
  type: 'video' | 'phone' | 'in-person';
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  link?: string;
  location?: string;
  notes: string;
}

const mockAppointments: Appointment[] = [
  {
    id: 1,
    title: 'Consultoria Fiscal',
    client: 'João Silva',
    clientId: 1,
    date: '2024-04-15',
    time: '14:00',
    duration: 60,
    type: 'video',
    status: 'confirmed',
    link: 'https://meet.google.com/abc-def-ghi',
    notes: 'Revisar declaração de IRPF',
  },
  {
    id: 2,
    title: 'Reunião Fiscal',
    client: 'Maria Santos',
    clientId: 2,
    date: '2024-04-16',
    time: '10:00',
    duration: 90,
    type: 'video',
    status: 'scheduled',
    link: 'https://meet.google.com/jkl-mno-pqr',
    notes: 'Planejamento tributário trimestral',
  },
  {
    id: 3,
    title: 'Atendimento Presencial',
    client: 'Carlos Oliveira',
    clientId: 3,
    date: '2024-04-17',
    time: '15:30',
    duration: 45,
    type: 'in-person',
    status: 'confirmed',
    location: 'Escritório - Sala 302',
    notes: 'Assinatura de documentos',
  },
  {
    id: 4,
    title: 'Consulta Jurídica',
    client: 'Ana Souza',
    clientId: 4,
    date: '2024-04-20',
    time: '09:00',
    duration: 60,
    type: 'video',
    status: 'scheduled',
    link: 'https://meet.google.com/xyz-uvw-rst',
    notes: 'Análise de contrato',
  },
  {
    id: 5,
    title: 'Ligação de Follow-up',
    client: 'TechStart ME',
    clientId: 5,
    date: '2024-04-18',
    time: '11:00',
    duration: 30,
    type: 'phone',
    status: 'scheduled',
    notes: 'Verificar documentos recebidos',
  },
];


const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function AppointmentsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [, setShowNewModal] = useState(false);

  const month = currentDate.getMonth();
  const year = currentDate.getFullYear();

  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const getAppointmentsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockAppointments.filter(apt => apt.date === dateStr);
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getTypeIcon = (type: Appointment['type']) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'phone': return <Clock className="w-4 h-4" />;
      case 'in-person': return <MapPin className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: Appointment['status']) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">Agendado</span>;
      case 'confirmed':
        return <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-600 dark:text-green-400">Confirmado</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">Concluído</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-600 dark:text-red-400">Cancelado</span>;
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Agenda</h2>
          <p className="text-muted-foreground">Gerencie seus agendamentos.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Agendamento
        </motion.button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card border rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold">{monthNames[month]} {year}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={nextMonth}
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] rounded-lg" />
            ))}
            {Array.from({ length: daysInCurrentMonth }).map((_, i) => {
              const day = i + 1;
              const appointments = getAppointmentsForDate(day);
              const isSelected = selectedDate === day;

              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[80px] rounded-lg p-2 cursor-pointer transition-all ${
                    isToday(day)
                      ? 'bg-primary/10 border-2 border-primary'
                      : isSelected
                      ? 'bg-primary/5 border border-primary'
                      : 'border border-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className={`text-sm font-medium ${isToday(day) ? 'text-primary' : ''}`}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {appointments.slice(0, 2).map((apt) => (
                      <div
                        key={apt.id}
                        className={`text-xs p-1 rounded truncate ${
                          apt.type === 'video'
                            ? 'bg-blue-500/10 text-blue-600'
                            : apt.type === 'phone'
                            ? 'bg-purple-500/10 text-purple-600'
                            : 'bg-green-500/10 text-green-600'
                        }`}
                      >
                        {apt.time} {apt.client.split(' ')[0]}
                      </div>
                    ))}
                    {appointments.length > 2 && (
                      <div className="text-xs text-muted-foreground">
                        +{appointments.length - 2} mais
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card border rounded-xl"
        >
          <div className="p-5 border-b">
            <h3 className="font-semibold">
              {selectedDate
                ? `${selectedDate} de ${monthNames[month]}`
                : `Hoje - ${today.getDate()} de ${monthNames[today.getMonth()]}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedDate
                ? getAppointmentsForDate(selectedDate).length
                : getAppointmentsForDate(today.getDate()).length} agendamentos
            </p>
          </div>
          <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {(selectedDate ? getAppointmentsForDate(selectedDate) : getAppointmentsForDate(today.getDate())).length > 0 ? (
              (selectedDate ? getAppointmentsForDate(selectedDate) : getAppointmentsForDate(today.getDate())).map((apt, index) => (
                <motion.div
                  key={apt.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => setSelectedAppointment(apt)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(apt.type)}
                      <span className="font-medium text-sm">{apt.title}</span>
                    </div>
                    {getStatusBadge(apt.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Clock className="w-4 h-4" />
                    {apt.time} - {apt.duration}min
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    {apt.client}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Nenhum agendamento neste dia</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedAppointment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedAppointment(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{selectedAppointment.title}</h3>
                  <p className="text-muted-foreground">{selectedAppointment.client}</p>
                </div>
                {getStatusBadge(selectedAppointment.status)}
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data</p>
                    <p className="font-medium">{selectedAppointment.date.split('-').reverse().join('/')}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Horário</p>
                    <p className="font-medium">{selectedAppointment.time} - {selectedAppointment.duration}min</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {getTypeIcon(selectedAppointment.type)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo</p>
                    <p className="font-medium">
                      {selectedAppointment.type === 'video' ? 'Videochamada' : selectedAppointment.type === 'phone' ? 'Ligação' : 'Presencial'}
                    </p>
                  </div>
                </div>

                {selectedAppointment.link && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Video className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Link da Reunião</p>
                      <a href={selectedAppointment.link} target="_blank" className="text-sm text-primary hover:underline">
                        Abrir reunião
                      </a>
                    </div>
                  </div>
                )}

                {selectedAppointment.location && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Local</p>
                      <p className="font-medium">{selectedAppointment.location}</p>
                    </div>
                  </div>
                )}

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="text-sm mt-1">{selectedAppointment.notes}</p>
                </div>
              </div>

              <div className="p-6 border-t flex justify-end gap-3">
                <button
                  onClick={() => setSelectedAppointment(null)}
                  className="px-5 py-2.5 rounded-lg border hover:bg-muted transition-colors"
                >
                  Fechar
                </button>
                {selectedAppointment.status !== 'completed' && selectedAppointment.status !== 'cancelled' && (
                  <>
                    {selectedAppointment.link && (
                      <a
                        href={selectedAppointment.link}
                        target="_blank"
                        className="px-5 py-2.5 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors flex items-center gap-2"
                      >
                        <Video className="w-5 h-5" />
                        Entrar na Reunião
                      </a>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}