import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Download,
  CreditCard,
  Wallet,
  Calendar,
  Check,
  Clock,
  FileText,
  PiggyBank,
  Receipt,
} from 'lucide-react';

const mockTransactions = [
  { id: 1, date: '15/04/2024', client: 'João Silva', service: 'Plano Contábil', value: 399, status: 'paid', method: 'pix' },
  { id: 2, date: '14/04/2024', client: 'Ana Souza', service: 'Declaração IRPF', value: 350, status: 'pending', method: 'credit' },
  { id: 3, date: '13/04/2024', client: 'TechStart ME', service: 'Consultoria Fiscal', value: 550, status: 'paid', method: 'transfer' },
  { id: 4, date: '12/04/2024', client: 'Carlos Oliveira', service: 'Cálculo de Rescisão', value: 200, status: 'paid', method: 'pix' },
  { id: 5, date: '10/04/2024', client: 'Maria Santos', service: 'Plano Empresarial', value: 599, status: 'paid', method: 'transfer' },
  { id: 6, date: '08/04/2024', client: 'João Silva', service: 'Plano Contábil', value: 399, status: 'paid', method: 'pix' },
];

const revenueByMonth = [
  { month: 'Jan', value: 4500 },
  { month: 'Fev', value: 5200 },
  { month: 'Mar', value: 4800 },
  { month: 'Abr', value: 6100 },
  { month: 'Mai', value: 7500 },
  { month: 'Jun', value: 8750 },
];

export default function FinancialPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('this-month');
  const [filterStatus, setFilterStatus] = useState('all');

  const stats = {
    totalRevenue: 8750,
    paidRepasses: 7500,
    pendingPayments: 1250,
    planRevenue: 5200,
    serviceRevenue: 2450,
    growth: 18,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-500/10 text-green-600">
            <Check className="w-3 h-3" /> Pago
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-600">
            <Clock className="w-3 h-3" /> Pendente
          </span>
        );
      default:
        return null;
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'pix':
        return <span className="text-lg">💠</span>;
      case 'credit':
        return <CreditCard className="w-4 h-4" />;
      case 'transfer':
        return <span className="text-lg">🏦</span>;
      default:
        return null;
    }
  };

  const maxRevenue = Math.max(...revenueByMonth.map(r => r.value));

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Financeiro</h2>
          <p className="text-muted-foreground">Acompanhe suas receitas e pagamentos.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="h-11 px-4 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="this-month">Este Mês</option>
            <option value="last-month">Mês Passado</option>
            <option value="last-3-months">Últimos 3 Meses</option>
            <option value="this-year">Este Ano</option>
          </select>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar
          </motion.button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Receita Total</p>
              <h3 className="text-2xl font-bold mt-1">{formatCurrency(stats.totalRevenue)}</h3>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-500 font-medium">+{stats.growth}%</span>
                <span className="text-xs text-muted-foreground">vs mês passado</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-green-500" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Repasses Pagos</p>
              <h3 className="text-2xl font-bold mt-1">{formatCurrency(stats.paidRepasses)}</h3>
              <p className="text-xs text-muted-foreground mt-2">Já depositados</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Check className="w-6 h-6 text-primary" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">A Receber</p>
              <h3 className="text-2xl font-bold mt-1 text-primary">{formatCurrency(stats.pendingPayments)}</h3>
              <p className="text-xs text-muted-foreground mt-2">Pendente</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-500" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card border rounded-xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Meta do Mês</p>
              <h3 className="text-2xl font-bold mt-1">73%</h3>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div className="bg-primary rounded-full h-2" style={{ width: '73%' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">R$ 3.250 restantes</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <PiggyBank className="w-6 h-6 text-purple-500" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2 bg-card border rounded-xl"
        >
          <div className="p-5 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Receita por Mês</h3>
              <p className="text-sm text-muted-foreground">Últimos 6 meses</p>
            </div>
          </div>
          <div className="p-5">
            <div className="h-64 flex items-end justify-between gap-4">
              {revenueByMonth.map((data, index) => (
                <motion.div
                  key={data.month}
                  initial={{ height: 0 }}
                  animate={{ height: '100%' }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <div className="w-full flex flex-col items-center justify-end h-full">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(data.value / maxRevenue) * 80}%` }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      className="w-full bg-gradient-to-t from-primary to-primary/60 rounded-t-lg relative group cursor-pointer"
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {formatCurrency(data.value)}
                      </div>
                    </motion.div>
                  </div>
                  <span className="text-xs text-muted-foreground">{data.month}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-card border rounded-xl"
        >
          <div className="p-5 border-b">
            <h3 className="font-semibold">Receita por Categoria</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">Planos Fixos</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(stats.planRevenue)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stats.planRevenue / stats.totalRevenue) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="bg-blue-500 rounded-full h-2"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">Serviços Avulsos</span>
                </div>
                <span className="text-sm font-medium">{formatCurrency(stats.serviceRevenue)}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stats.serviceRevenue / stats.totalRevenue) * 100}%` }}
                  transition={{ duration: 1, delay: 0.6 }}
                  className="bg-amber-500 rounded-full h-2"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-card border rounded-xl overflow-hidden"
      >
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-4">
          <h3 className="font-semibold">Transações Recentes</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
              {['all', 'paid', 'pending'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                    filterStatus === status
                      ? 'bg-background shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {status === 'all' ? 'Todos' : status === 'paid' ? 'Pagos' : 'Pendentes'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-4 font-medium">Data</th>
                <th className="text-left p-4 font-medium">Cliente</th>
                <th className="text-left p-4 font-medium">Serviço</th>
                <th className="text-left p-4 font-medium">Forma</th>
                <th className="text-left p-4 font-medium">Valor</th>
                <th className="text-left p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockTransactions.map((transaction, index) => (
                <motion.tr
                  key={transaction.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{transaction.date}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-medium">{transaction.client}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-muted-foreground">{transaction.service}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {getMethodIcon(transaction.method)}
                      <span className="text-sm text-muted-foreground capitalize">
                        {transaction.method === 'pix' ? 'PIX' : transaction.method === 'credit' ? 'Cartão' : 'Transferência'}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-sm font-semibold text-primary">{formatCurrency(transaction.value)}</span>
                  </td>
                  <td className="p-4">{getStatusBadge(transaction.status)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}