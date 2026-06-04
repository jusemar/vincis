import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Mail,
  Phone,
  Video,
  MessageSquare,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Client {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  plan: string;
  planValue: number;
  status: 'active' | 'pending' | 'inactive';
  lastContact: string;
  lastTicket: string;
  nextAppointment: string;
  totalServices: number;
  totalSpent: number;
  area: 'accounting' | 'legal' | 'both';
  avatar: string;
  notes: string;
}

const mockClients: Client[] = [
  {
    id: 1,
    name: 'João Silva',
    email: 'joao.silva@email.com',
    phone: '(11) 99999-1234',
    company: 'Silva ME',
    plan: 'Plano Premium',
    planValue: 399,
    status: 'active',
    lastContact: '14/04/2024',
    lastTicket: '10/04',
    nextAppointment: '15/04 às 14h',
    totalServices: 15,
    totalSpent: 5985,
    area: 'accounting',
    avatar: 'JS',
    notes: 'Cliente antigo, prefere contato por e-mail.',
  },
  {
    id: 2,
    name: 'Maria Santos',
    email: 'maria.santos@empresa.com',
    phone: '(11) 98888-5678',
    company: 'Santos LTDA',
    plan: 'Plano Empresarial',
    planValue: 599,
    status: 'active',
    lastContact: '13/04/2024',
    lastTicket: '08/04',
    nextAppointment: '16/04 às 10h',
    totalServices: 22,
    totalSpent: 13178,
    area: 'legal',
    avatar: 'MS',
    notes: 'Prefere reuniões por videochamada.',
  },
  {
    id: 3,
    name: 'Carlos Oliveira',
    email: 'carlos@oliveirafilhos.com',
    phone: '(11) 97777-9012',
    company: 'Oliveira & Filhos',
    plan: 'Plano Básico',
    planValue: 299,
    status: 'active',
    lastContact: '12/04/2024',
    lastTicket: '05/04',
    nextAppointment: '-',
    totalServices: 8,
    totalSpent: 2392,
    area: 'both',
    avatar: 'CO',
    notes: 'Empresa em expansão, pode upgrade.',
  },
  {
    id: 4,
    name: 'Ana Souza',
    email: 'ana@souza.adv.br',
    phone: '(11) 96666-3456',
    company: 'Souza Advocacia',
    plan: 'Plano Premium',
    planValue: 399,
    status: 'active',
    lastContact: '11/04/2024',
    lastTicket: '02/04',
    nextAppointment: '20/04 às 15h',
    totalServices: 12,
    totalSpent: 4788,
    area: 'accounting',
    avatar: 'AS',
    notes: '',
  },
  {
    id: 5,
    name: 'TechStart ME',
    email: 'contato@techstart.com.br',
    phone: '(11) 95555-7890',
    company: 'TechStart ME',
    plan: 'Plano Básico',
    planValue: 299,
    status: 'pending',
    lastContact: '10/04/2024',
    lastTicket: '-',
    nextAppointment: '-',
    totalServices: 3,
    totalSpent: 897,
    area: 'accounting',
    avatar: 'TS',
    notes: 'Novo cliente, necessidade de declaração IR.',
  },
];

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [, setShowAddModal] = useState(false);

  const filteredClients = mockClients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || client.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: Client['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium badge-success">
            <CheckCircle className="w-3 h-3" />
            Ativo
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium badge-warning">
            <Clock className="w-3 h-3" />
            Pendente
          </span>
        );
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
            <AlertCircle className="w-3 h-3" />
            Inativo
          </span>
        );
    }
  };

  const getAreaBadge = (area: Client['area']) => {
    switch (area) {
      case 'accounting': return <span className="px-2 py-0.5 rounded text-xs badge-info">Contábil</span>;
      case 'legal': return <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-500">Jurídico</span>;
      case 'both': return <span className="px-2 py-0.5 rounded text-xs badge-warning">Ambos</span>;
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
          <h2 className="text-2xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">Gerencie seus clientes e contatos.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-4 flex-wrap"
      >
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, empresa ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
          {(['all', 'active', 'pending', 'inactive'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                filterStatus === status
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === 'all' ? 'Todos' : status === 'active' ? 'Ativos' : status === 'pending' ? 'Pendentes' : 'Inativos'}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {filteredClients.map((client, index) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            whileHover={{ y: -4 }}
            className="bg-card border rounded-xl p-5 hover:shadow-lg transition-all cursor-pointer"
            onClick={() => setSelectedClient(client)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center">
                  <span className="text-on-gradient font-bold">{client.avatar}</span>
                </div>
                <div>
                  <h3 className="font-semibold">{client.name}</h3>
                  <p className="text-sm text-muted-foreground">{client.company}</p>
                </div>
              </div>
              {getStatusBadge(client.status)}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4" />
                <span className="truncate">{client.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{client.phone}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                {getAreaBadge(client.area)}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Plano:</span>
                <span className="font-semibold text-primary">R$ {client.planValue}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {selectedClient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedClient(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center">
                    <span className="text-on-gradient font-bold text-xl">{selectedClient.avatar}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{selectedClient.name}</h3>
                    <p className="text-muted-foreground">{selectedClient.company}</p>
                    {getStatusBadge(selectedClient.status)}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h4 className="font-semibold mb-3">Informações de Contato</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <p className="text-sm">{selectedClient.email}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="text-sm">{selectedClient.phone}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Plano e Serviços</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">Plano Atual</p>
                      <p className="text-lg font-bold text-primary">{selectedClient.plan}</p>
                      <p className="text-sm">R$ {selectedClient.planValue}/mês</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">Total Gasto</p>
                      <p className="text-lg font-bold">R$ {selectedClient.totalSpent.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">{selectedClient.totalServices} serviços</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Ações Rápidas</h4>
                  <div className="flex flex-wrap gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                      <MessageSquare className="w-4 h-4" />
                      Enviar Mensagem
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors">
                      <Video className="w-4 h-4" />
                      Iniciar Videochamada
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors">
                      <Calendar className="w-4 h-4" />
                      Agendar Reunião
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors">
                      <FileText className="w-4 h-4" />
                      Ver Contrato
                    </button>
                  </div>
                </div>

                {selectedClient.notes && (
                  <div>
                    <h4 className="font-semibold mb-3">Observações</h4>
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                      {selectedClient.notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t flex justify-end gap-3">
                <button
                  onClick={() => setSelectedClient(null)}
                  className="px-5 py-2.5 rounded-lg border hover:bg-muted transition-colors"
                >
                  Fechar
                </button>
                <button className="px-5 py-2.5 rounded-lg bg-gradient-gold text-on-gradient font-semibold shadow-glow hover:shadow-glow-lg transition-all">
                  Editar Cliente
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}