import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Activity,
  Ticket,
  Calendar,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Rocket,
  Sparkles,
  Zap,
  Crown,
  CheckCircle,
} from 'lucide-react';

const metrics = [
  {
    title: 'Clientes Ativos',
    value: 24,
    change: '+12%',
    trend: 'up',
    icon: Users,
    color: 'badge-info',
    iconColor: 'text-info',
  },
  {
    title: 'Atendimentos Mês',
    value: 18,
    change: '+4',
    trend: 'up',
    icon: Activity,
    color: 'badge-success',
    iconColor: 'text-success',
  },
  {
    title: 'Ganhos do Mês',
    value: 8750,
    prefix: 'R$',
    change: '+18%',
    trend: 'up',
    icon: DollarSign,
    color: 'bg-warning/20',
    iconColor: 'text-warning',
  },
  {
    title: 'Meta Mensal',
    value: 73,
    suffix: '%',
    change: 'R$ 3.250 restantes',
    trend: 'neutral',
    icon: Target,
    color: 'bg-purple-500/20',
    iconColor: 'text-purple-500',
  },
];

const recentActivity = [
  {
    id: 1,
    type: 'ticket',
    icon: '💬',
    title: 'Novo ticket de João Silva',
    description: 'Tenho uma dúvida sobre o cálculo do IR',
    time: '2 horas atrás',
    color: 'badge-info',
    iconColor: 'text-info',
  },
  {
    id: 2,
    type: 'appointment',
    icon: '📅',
    title: 'Agendamento confirmado',
    description: 'Reunião com Maria Santos amanhã às 10h',
    time: '5 horas atrás',
    color: 'badge-success',
    iconColor: 'text-success',
  },
  {
    id: 3,
    type: 'payment',
    icon: '💰',
    title: 'Pagamento recebido',
    description: 'Carlos Oliveira - R$ 299',
    time: '1 dia atrás',
    color: 'bg-warning/20',
    iconColor: 'text-warning',
  },
  {
    id: 4,
    type: 'review',
    icon: '⭐',
    title: 'Nova avaliação 5 estrelas',
    description: '"Atendimento incrível!"',
    time: '1 dia atrás',
    color: 'bg-yellow-500/20',
    iconColor: 'text-yellow-500',
  },
];

const quickStats = [
  { label: 'Avaliação Média', value: '4.8', icon: Star, color: 'text-warning' },
  { label: 'Total de Avaliações', value: '124', icon: Crown, color: 'text-warning' },
  { label: 'Tickets Abertos', value: '3', icon: Ticket, color: 'text-destructive' },
  { label: 'Agendamentos Hoje', value: '2', icon: Calendar, color: 'text-info' },
];

const chartData = [
  { month: 'Jan', revenue: 4500 },
  { month: 'Fev', revenue: 5200 },
  { month: 'Mar', revenue: 4800 },
  { month: 'Abr', revenue: 6100 },
  { month: 'Mai', revenue: 7500 },
  { month: 'Jun', revenue: 8750 },
];

const AnimatedNumber = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => (
  <motion.span
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: 'easeOut' }}
  >
    {prefix}
    {value.toLocaleString()}
    {suffix}
  </motion.span>
);

export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold mb-1">Olá, Ana! 👋</h2>
        <p className="text-muted-foreground">
          Veja o resumo da sua atividade e mantenha o controle do seu negócio.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-gradient-to-r from-amber-500/10 via-primary/10 to-amber-500/10 rounded-xl p-5 border border-primary/20"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-gold flex items-center justify-center shadow-glow">
              <Rocket className="h-7 w-7 text-on-gradient" />
            </div>
            <div>
              <p className="font-semibold text-lg">
                Faltam <span className="text-primary font-bold">R$ 3.250</span> para bater sua meta mensal!
              </p>
              <p className="text-sm text-muted-foreground">
                Você está a apenas 2 serviços de atingir seu objetivo. Que tal oferecer um serviço avulso hoje?
              </p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
          >
            Ver Oportunidades
          </motion.button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <motion.div
              key={metric.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.05 }}
              whileHover={{ y: -4 }}
              className="bg-card border rounded-xl p-5 hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{metric.title}</p>
                  <h3 className="text-2xl font-bold">
                    <AnimatedNumber value={metric.value} prefix={metric.prefix} suffix={metric.suffix} />
                  </h3>
                  <div className="flex items-center gap-1">
                    {metric.trend === 'up' ? (
                      <ArrowUpRight className="w-4 h-4 text-success" />
                    ) : metric.trend === 'down' ? (
                      <ArrowDownRight className="w-4 h-4 text-destructive" />
                    ) : null}
                    <span className={`text-xs font-medium ${metric.trend === 'up' ? 'text-green-500' : metric.trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {metric.change}
                    </span>
                  </div>
                </div>
                <div className={`h-12 w-12 rounded-xl ${metric.color} flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${metric.iconColor}`} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border rounded-xl p-5">
            <div className="mb-4">
              <h3 className="font-semibold">Receita Mensal</h3>
            </div>
            <div className="h-64 flex items-end justify-between gap-2">
              {chartData.map((data, index) => (
                <motion.div
                  key={data.month}
                  initial={{ height: 0 }}
                  animate={{ height: '100%' }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                  className="flex-1 flex flex-col items-center gap-2"
                >
                  <div className="w-full h-full rounded-t-lg relative group">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(data.revenue / 10000) * 100}%` }}
                      transition={{ duration: 0.8, delay: index * 0.1 }}
                      className="w-full bg-amber-500 absolute bottom-0 rounded-t-lg"
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
                        R$ {data.revenue.toLocaleString()}
                      </div>
                    </motion.div>
                  </div>
                  <span className="text-xs text-muted-foreground">{data.month}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.05 }}
                  className="bg-card border rounded-xl p-4 text-center"
                >
                  <Icon className={`w-6 h-6 mx-auto mb-2 ${stat.color}`} />
                  <h4 className="text-xl font-bold">{stat.value}</h4>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border rounded-xl">
            <div className="p-5 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Atividade Recente
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                  className="flex items-start gap-3 group"
                >
                  <div className={`h-10 w-10 rounded-xl ${activity.color} flex items-center justify-center text-lg flex-shrink-0`}>
                    {activity.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">{activity.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-primary/10 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">Dica do Dia</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Clientes valorizam respostas rápidas! Você responde tickets em média <span className="text-primary font-bold">2.3 horas</span> - 30% acima da média!
            </p>
            <div className="flex items-center gap-2 mt-3 text-xs text-green-500">
              <Crown className="w-4 h-4" />
              <span>Top 5 profissionais este mês</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}