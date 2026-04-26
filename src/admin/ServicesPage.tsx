import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  Edit,
  Trash2,
  Download,
  Upload,
  Eye,
  FileText,
  MessageSquare,
} from 'lucide-react';

interface Service {
  id: number;
  service: string;
  client: string;
  clientId: number;
  value: number;
  deadline: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  category: 'accounting' | 'legal' | 'consulting';
  description: string;
  createdAt: string;
  completedAt?: string;
  attachments: number;
}

const mockServices: Service[] = [
  {
    id: 1,
    service: 'Declaração IRPF',
    client: 'Ana Souza',
    clientId: 4,
    value: 350,
    deadline: '20/04/2024',
    status: 'pending',
    category: 'accounting',
    description: 'Declaração de imposto de renda pessoa física referente ao ano de 2023.',
    createdAt: '15/04/2024',
    attachments: 2,
  },
  {
    id: 2,
    service: 'Consultoria Fiscal',
    client: 'TechStart ME',
    clientId: 5,
    value: 550,
    deadline: '25/04/2024',
    status: 'in-progress',
    category: 'accounting',
    description: 'Análise fiscal completa e planejamento tributário para otimização de impostos.',
    createdAt: '10/04/2024',
    attachments: 5,
  },
  {
    id: 3,
    service: 'Contrato Social',
    client: 'Nova Empresa',
    clientId: 0,
    value: 450,
    deadline: '30/04/2024',
    status: 'pending',
    category: 'legal',
    description: 'Elaboração de contrato social para nova empresa.',
    createdAt: '14/04/2024',
    attachments: 0,
  },
  {
    id: 4,
    service: 'Elaboração de Contrato',
    client: 'João Silva',
    clientId: 1,
    value: 380,
    deadline: '18/04/2024',
    status: 'completed',
    category: 'legal',
    description: 'Contrato de prestação de serviços personalizado.',
    createdAt: '05/04/2024',
    completedAt: '14/04/2024',
    attachments: 3,
  },
  {
    id: 5,
    service: 'Cálculo de Rescisão',
    client: 'Carlos Oliveira',
    clientId: 3,
    value: 200,
    deadline: '16/04/2024',
    status: 'completed',
    category: 'accounting',
    description: 'Cálculo de rescisão contratual com todos os direitos trabalhistas.',
    createdAt: '08/04/2024',
    completedAt: '12/04/2024',
    attachments: 1,
  },
];

const stats = [
  { label: 'Total de Serviços', value: '12', icon: Package, color: 'text-blue-500' },
  { label: 'Pendentes', value: '3', icon: Clock, color: 'text-yellow-500' },
  { label: 'Em Andamento', value: '4', icon: AlertCircle, color: 'text-orange-500' },
  { label: 'Concluídos (Mês)', value: '8', icon: CheckCircle, color: 'text-green-500' },
];

export default function ServicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'accounting' | 'legal'>('all');
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const filteredServices = mockServices.filter((service) => {
    const matchesSearch =
      service.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.client.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || service.status === filterStatus;
    const matchesCategory = filterCategory === 'all' || service.category === filterCategory;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusBadge = (status: Service['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Pendente
          </span>
        );
      case 'in-progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <AlertCircle className="w-3 h-3" />
            Em Andamento
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Concluído
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            Cancelado
          </span>
        );
    }
  };

  const getCategoryBadge = (category: Service['category']) => {
    switch (category) {
      case 'accounting':
        return <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">Contábil</span>;
      case 'legal':
        return <span className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400">Jurídico</span>;
      case 'consulting':
        return <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400">Consultoria</span>;
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
          <h2 className="text-2xl font-bold">Serviços</h2>
          <p className="text-muted-foreground">Gerencie seus serviços avulsos.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Serviço
        </motion.button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="bg-card border rounded-xl p-4"
            >
              <Icon className={`w-5 h-5 mb-2 ${stat.color}`} />
              <h4 className="text-2xl font-bold">{stat.value}</h4>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-4 flex-wrap"
      >
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar serviços ou clientes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
          {(['all', 'pending', 'in-progress', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 text-sm rounded-md transition-all ${
                filterStatus === status
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status === 'all' ? 'Todos' : status === 'pending' ? 'Pendentes' : status === 'in-progress' ? 'Em Andamento' : 'Concluídos'}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-card border rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Serviço</th>
                <th className="text-left p-4 font-medium">Cliente</th>
                <th className="text-left p-4 font-medium">Valor</th>
                <th className="text-left p-4 font-medium">Prazo</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service, index) => (
                <motion.tr
                  key={service.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedService(service)}
                >
                  <td className="p-4">
                    <div>
                      <p className="font-medium">{service.service}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getCategoryBadge(service.category)}
                        {service.attachments > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="w-3 h-3" />
                            {service.attachments}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">{service.client}</td>
                  <td className="p-4">
                    <span className="font-semibold text-primary">R$ {service.value}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {service.deadline}
                    </div>
                  </td>
                  <td className="p-4">{getStatusBadge(service.status)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {service.status === 'completed' ? (
                        <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors text-sm">
                          <Eye className="w-4 h-4" />
                          Ver
                        </button>
                      ) : (
                        <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Entregar
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedService(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{selectedService.service}</h3>
                  <p className="text-muted-foreground">{selectedService.client}</p>
                </div>
                {getStatusBadge(selectedService.status)}
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">Descrição</h4>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                    {selectedService.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Valor do Serviço</p>
                    <p className="text-2xl font-bold text-primary">R$ {selectedService.value}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Prazo de Entrega</p>
                    <p className="text-lg font-bold">{selectedService.deadline}</p>
                  </div>
                </div>

                {selectedService.status !== 'completed' && (
                  <div>
                    <h4 className="font-semibold mb-3">Entregar Serviço</h4>
                    <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center">
                      <Upload className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Arraste arquivos aqui ou clique para enviar
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOC, XLS até 10MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t flex justify-end gap-3">
                <button
                  onClick={() => setSelectedService(null)}
                  className="px-5 py-2.5 rounded-lg border hover:bg-muted transition-colors"
                >
                  Fechar
                </button>
                {selectedService.status !== 'completed' && (
                  <button className="px-5 py-2.5 rounded-lg bg-gradient-gold text-on-gradient font-semibold shadow-glow hover:shadow-glow-lg transition-all">
                    Marcar como Concluído
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}