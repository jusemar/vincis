import { motion } from 'framer-motion';
import {
  Trophy,
  Medal,
  Crown,
  Zap,
  Target,
  Star,
  Rocket,
  Flame,
  Gift,
  TrendingUp,
  Check,
  Lock,
} from 'lucide-react';

const achievements = [
  {
    id: 1,
    title: 'Resposta Rápida',
    description: 'Responda 10 tickets em menos de 1 hora',
    icon: Zap,
    color: 'from-yellow-500/20 to-orange-500/20',
    iconColor: 'text-yellow-500',
    progress: 70,
    target: 10,
    current: 7,
    reward: 50,
    unlocked: false,
  },
  {
    id: 2,
    title: 'Meta do Mês',
    description: 'Atingir R$ 12.000 em serviços',
    icon: Target,
    color: 'from-blue-500/20 to-purple-500/20',
    iconColor: 'text-blue-500',
    progress: 73,
    target: 12000,
    current: 8750,
    reward: 100,
    unlocked: false,
  },
  {
    id: 3,
    title: 'Avaliação Perfeita',
    description: 'Receba 20 avaliações com 5 estrelas',
    icon: Star,
    color: 'from-amber-500/20 to-yellow-500/20',
    iconColor: 'text-amber-500',
    progress: 90,
    target: 20,
    current: 18,
    reward: 75,
    unlocked: false,
  },
  {
    id: 4,
    title: 'Primeiro Cliente',
    description: 'Atenda seu primeiro cliente',
    icon: Trophy,
    color: 'from-green-500/20 to-emerald-500/20',
    iconColor: 'text-green-500',
    progress: 100,
    target: 1,
    current: 1,
    reward: 25,
    unlocked: true,
  },
  {
    id: 5,
    title: 'Veterano',
    description: 'Atenda 50 clientes',
    icon: Medal,
    color: 'from-purple-500/20 to-pink-500/20',
    iconColor: 'text-purple-500',
    progress: 48,
    target: 50,
    current: 24,
    reward: 150,
    unlocked: false,
  },
  {
    id: 6,
    title: 'Super Profissional',
    description: 'Complete 100 serviços',
    icon: Crown,
    color: 'from-amber-500/20 to-amber-600/20',
    iconColor: 'text-amber-500',
    progress: 65,
    target: 100,
    current: 65,
    reward: 200,
    unlocked: false,
  },
  {
    id: 7,
    title: 'Estrela em Alta',
    description: 'Mantenha 4.8+ de média por 30 dias',
    icon: Rocket,
    color: 'from-red-500/20 to-orange-500/20',
    iconColor: 'text-red-500',
    progress: 60,
    target: 30,
    current: 18,
    reward: 125,
    unlocked: false,
  },
  {
    id: 8,
    title: 'Em Chamas',
    description: 'Complete 10 serviços em uma semana',
    icon: Flame,
    color: 'from-orange-500/20 to-red-500/20',
    iconColor: 'text-orange-500',
    progress: 100,
    target: 10,
    current: 12,
    reward: 100,
    unlocked: true,
  },
];

const completedAchievements = achievements.filter(a => a.unlocked);
const inProgressAchievements = achievements.filter(a => !a.unlocked);
const totalRewards = achievements.reduce((acc, a) => acc + (a.unlocked ? a.reward : 0), 0);

export default function AchievementsPage() {
  const formatValue = (value: number) => {
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(1)}k`;
    }
    return `R$ ${value}`;
  };

  const formatProgress = (current: number, target: number) => {
    if (target >= 1000) {
      return `R$ ${current.toLocaleString()} / R$ ${target.toLocaleString()}`;
    }
    return `${current} / ${target}`;
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Conquistas</h2>
          <p className="text-muted-foreground">Acompanhe seu progresso e desbloqueie recompensas.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-gold rounded-xl px-5 py-3 flex items-center gap-3">
            <Gift className="w-5 h-5 text-on-gradient" />
            <div>
              <p className="text-xs opacity-70">Total conquistado</p>
              <p className="text-lg font-bold text-on-gradient">{formatValue(totalRewards)}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border rounded-xl p-5 flex items-center gap-4"
        >
          <div className="h-14 w-14 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Trophy className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{completedAchievements.length}</p>
            <p className="text-sm text-muted-foreground">Conquistas desbloqueadas</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border rounded-xl p-5 flex items-center gap-4"
        >
          <div className="h-14 w-14 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="w-7 h-7 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold">{inProgressAchievements.length}</p>
            <p className="text-sm text-muted-foreground">Em andamento</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-amber-500/10 to-primary/10 border border-amber-500/20 rounded-xl p-5 flex items-center gap-4"
        >
          <div className="h-14 w-14 rounded-xl bg-gradient-gold flex items-center justify-center shadow-glow">
            <Crown className="w-7 h-7 text-on-gradient" />
          </div>
          <div>
            <p className="text-sm font-medium">Você está no</p>
            <p className="text-2xl font-bold text-primary">Top 5</p>
            <p className="text-xs text-muted-foreground">deste mês</p>
          </div>
        </motion.div>
      </div>

      {completedAchievements.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            Conquistas Desbloqueadas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedAchievements.map((achievement, index) => {
              const Icon = achievement.icon;
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className={`bg-gradient-to-br ${achievement.color} border border-green-500/20 rounded-xl p-5 relative overflow-hidden`}
                >
                  <div className="absolute top-2 right-2">
                    <span className="text-xl">✓</span>
                  </div>
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${achievement.color} flex items-center justify-center mb-3`}>
                    <Icon className={`w-6 h-6 ${achievement.iconColor}`} />
                  </div>
                  <h4 className="font-semibold">{achievement.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{achievement.description}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-green-500/20">
                    <span className="text-xs text-green-500 font-medium">Conquistado</span>
                    <span className="text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded-full">
                      +{achievement.reward} pontos
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Em Progresso
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inProgressAchievements.map((achievement, index) => {
            const Icon = achievement.icon;
            return (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="bg-card border rounded-xl p-5 hover:shadow-lg transition-all"
              >
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${achievement.color} flex items-center justify-center mb-3`}>
                  <Icon className={`w-6 h-6 ${achievement.iconColor}`} />
                </div>
                <h4 className="font-semibold">{achievement.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{achievement.description}</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium">{formatProgress(achievement.current, achievement.target)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${achievement.progress}%` }}
                      transition={{ duration: 1, delay: 0.2 + index * 0.05 }}
                      className={`h-full rounded-full ${achievement.iconColor.replace('text-', 'bg-')}`}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-xs text-muted-foreground">Recompensa</span>
                  <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
                    +{achievement.reward} pontos
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-muted/50 rounded-xl p-6 border border-dashed"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h4 className="font-semibold">Mais conquistas estão por vir!</h4>
            <p className="text-sm text-muted-foreground">Continue atendendo clientes para desbloquear novas conquistas.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}