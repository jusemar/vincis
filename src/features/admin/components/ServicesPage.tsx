'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  Upload,
  Eye,
  FileText,
} from 'lucide-react';
import { listarContratacoesDoPrestador } from '@/features/servicos/actions/contratacoes';
import { listarMeusServicos } from '@/features/servicos/actions/catalogo';

interface Service {
  id: string;
  service: string;
  client: string;
  value: number | null;
  /** Rótulo já formatado: preserva "Sob orçamento" e "R$ 180,00/h". */
  valueLabel: string;
  deadline: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled' | 'awaiting-quote';
  category: 'accounting' | 'legal' | 'consulting';
  description: string;
  createdAt: string;
  attachments: number;
}

/** Rótulo do valor preservando as formas já usadas na interface. */
function rotularValor(modeloPreco: string, valorCentavos: number | null): string {
  if (modeloPreco === 'sob_orcamento' || valorCentavos === null) return 'Sob orçamento';
  const valor = valorCentavos / 100;
  const formatado = valor.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
  });
  if (modeloPreco === 'por_hora') return `R$ ${formatado}/h`;
  if (modeloPreco === 'a_partir_de') return `A partir de R$ ${formatado}`;
  return `R$ ${formatado}`;
}

/** Status do banco → chave usada pelo visual já existente. */
const STATUS_VISUAL: Record<string, Service['status']> = {
  pendente: 'pending',
  em_andamento: 'in-progress',
  concluido: 'completed',
  cancelado: 'cancelled',
  aguardando_orcamento: 'awaiting-quote',
};

const CATEGORIA_VISUAL: Record<string, Service['category']> = {
  contabil: 'accounting',
  juridico: 'legal',
  consultoria: 'consulting',
};

export default function ServicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-progress' | 'completed'>('all');
  const [filterCategory] = useState<'all' | 'accounting' | 'legal'>('all');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [totalCatalogo, setTotalCatalogo] = useState(0);

  // Os dados da tabela deixam de ser mockados: vêm das contratações reais
  // recebidas por este prestador.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const [contratacoes, catalogo] = await Promise.all([
        listarContratacoesDoPrestador(),
        listarMeusServicos(),
      ]);
      if (!ativo) return;
      if (contratacoes.sucesso && contratacoes.dados) {
        setServices(
          contratacoes.dados.map((item) => ({
            id: item.id,
            service: item.nomeServico,
            client: item.clienteNome,
            value: item.valorCentavos === null ? null : item.valorCentavos / 100,
            valueLabel: rotularValor(item.modeloPreco, item.valorCentavos),
            deadline: item.prazoEstimadoDias
              ? `${item.prazoEstimadoDias} dias`
              : '—',
            status: STATUS_VISUAL[item.status] ?? 'pending',
            category: CATEGORIA_VISUAL[item.categoria] ?? 'accounting',
            description: item.nomeServico,
            createdAt: new Intl.DateTimeFormat('pt-BR').format(
              new Date(item.criadoEm),
            ),
            attachments: 0,
          })),
        );
      }
      if (catalogo.sucesso && catalogo.dados) setTotalCatalogo(catalogo.dados.length);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // Mesmos quatro cartões de resumo, agora contando dados reais.
  const stats = useMemo(
    () => [
      { label: 'Total de Serviços', value: String(totalCatalogo), icon: Package, color: 'text-blue-500' },
      { label: 'Pendentes', value: String(services.filter((s) => s.status === 'pending' || s.status === 'awaiting-quote').length), icon: Clock, color: 'text-yellow-500' },
      { label: 'Em Andamento', value: String(services.filter((s) => s.status === 'in-progress').length), icon: AlertCircle, color: 'text-orange-500' },
      { label: 'Concluídos (Mês)', value: String(services.filter((s) => s.status === 'completed').length), icon: CheckCircle, color: 'text-green-500' },
    ],
    [services, totalCatalogo],
  );

  const filteredServices = services.filter((service) => {
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
      case 'awaiting-quote':
        // Único estado novo, exigido por serviços sob orçamento. Reaproveita o
        // mesmo formato de badge dos demais.
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="w-3 h-3" />
            Aguardando orçamento
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
                    <span className="font-semibold text-primary">{service.valueLabel}</span>
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
              className="bg-card rounded-2xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto"
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
                    <p className="text-2xl font-bold text-primary">{selectedService.valueLabel}</p>
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