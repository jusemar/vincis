import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Check, 
  X, 
  Sparkles, 
  Zap, 
  Building2,
  Scale,
  ArrowRight,
  HelpCircle,
  Crown
} from 'lucide-react';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Ideal para MEI e autônomos',
    icon: Zap,
    price: 199,
    period: '/mês',
    color: 'blue',
    features: [
      { text: 'Abertura de empresa', included: true },
      { text: 'Emissão de notas fiscais', included: true },
      { text: 'Cálculo de impostos', included: true },
      { text: 'Obrigações acessórias', included: true },
      { text: 'Folha de pagamento', included: false },
      { text: 'Relatórios mensais', included: false },
      { text: 'Suporte prioritário', included: false },
    ],
    cta: 'Começar Grátis',
    popular: false,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'Para empresas em crescimento',
    icon: Building2,
    price: 399,
    period: '/mês',
    color: 'amber',
    features: [
      { text: 'Tudo do Starter', included: true },
      { text: 'Folha de pagamento', included: true },
      { text: 'Relatórios mensais', included: true },
      { text: 'Análise financeira', included: true },
      { text: 'Planejamento tributário', included: false },
      { text: 'Consultoria especializada', included: false },
      { text: 'Suporte 24/7', included: false },
    ],
    cta: 'Escolher Business',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Solução completa para grandes empresas',
    icon: Crown,
    price: 799,
    period: '/mês',
    color: 'purple',
    features: [
      { text: 'Tudo do Business', included: true },
      { text: 'Planejamento tributário', included: true },
      { text: 'Consultoria especializada', included: true },
      { text: 'Suporte 24/7', included: true },
      { text: 'Gerente dedicado', included: true },
      { text: 'API de integração', included: true },
      { text: 'SLA garantido', included: true },
    ],
    cta: 'Falar com Vendas',
    popular: false,
  },
];

const legalPlans = [
  {
    id: 'legal-basic',
    name: 'Legal Basic',
    price: 199,
    period: '/mês',
    features: [
      '2 consultas mensais',
      'Análise de contratos',
      'Notificações extrajudiciais',
      'Suporte por chat',
    ],
  },
  {
    id: 'legal-pro',
    name: 'Legal Pro',
    price: 299,
    period: '/mês',
    popular: true,
    features: [
      'Consultas ilimitadas',
      'Elaboração de contratos',
      'Notificações extrajudiciais',
      'Suporte prioritário',
      'Advogado designado',
    ],
  },
];

const PricingCard = ({ plan, index }: { plan: typeof plans[0]; index: number }) => {
  const Icon = plan.icon;
  const isPopular = plan.popular;

  const colorClasses: Record<string, { icon: string; border: string; bg: string }> = {
    blue: { 
      icon: 'text-blue-400', 
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/10'
    },
    amber: { 
      icon: 'text-amber-400', 
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10'
    },
    purple: { 
      icon: 'text-purple-400', 
      border: 'border-purple-500/30',
      bg: 'bg-purple-500/10'
    },
  };

  const colors = colorClasses[plan.color];

  return (
    <motion.div
      className={`relative ${isPopular ? 'lg:-mt-4 lg:mb-4' : ''}`}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
    >
      {isPopular && (
        <motion.div
          className="absolute -top-4 left-1/2 -translate-x-1/2 z-20"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="px-4 py-1 bg-gradient-gold text-primary-foreground text-sm font-bold rounded-full shadow-glow">
            Mais Popular
          </div>
        </motion.div>
      )}

      <motion.div
        className={`h-full glass-card rounded-3xl p-8 border ${
          isPopular ? 'border-primary/50 shadow-glow' : colors.border
        } transition-all duration-500`}
        whileHover={{ y: -10, scale: 1.02 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-14 h-14 rounded-2xl ${colors.bg} flex items-center justify-center border ${colors.border}`}>
            <Icon className={`w-7 h-7 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline gap-1">
            <span className="text-muted-foreground">R$</span>
            <span className="text-5xl font-bold text-foreground">{plan.price}</span>
            <span className="text-muted-foreground">{plan.period}</span>
          </div>
        </div>

        <ul className="space-y-4 mb-8">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              {feature.included ? (
                <div className={`w-5 h-5 rounded-full ${colors.bg} flex items-center justify-center`}>
                  <Check className={`w-3 h-3 ${colors.icon}`} />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
              <span className={feature.included ? 'text-muted-foreground' : 'text-muted-foreground/50'}>
                {feature.text}
              </span>
            </li>
          ))}
        </ul>

        <motion.button
          className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
            isPopular
              ? 'bg-gradient-gold text-primary-foreground shadow-glow'
              : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {plan.cta}
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
};

const LegalPlanCard = ({ plan, index }: { plan: typeof legalPlans[0]; index: number }) => {
  return (
    <motion.div
      className={`relative ${plan.popular ? 'lg:scale-105' : ''}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full">
          Recomendado
        </div>
      )}
      
      <div className={`glass-card rounded-2xl p-6 border ${plan.popular ? 'border-emerald-500/30' : 'border-border'}`}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-bold text-foreground">{plan.name}</h4>
          <Scale className="w-5 h-5 text-emerald-400" />
        </div>
        
        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-muted-foreground">R$</span>
          <span className="text-3xl font-bold text-foreground">{plan.price}</span>
          <span className="text-muted-foreground">{plan.period}</span>
        </div>

        <ul className="space-y-2 mb-6">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-emerald-400" />
              {feature}
            </li>
          ))}
        </ul>

        <button className={`w-full py-3 rounded-lg font-medium text-sm transition-colors ${
          plan.popular 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}>
          Escolher Plano
        </button>
      </div>
    </motion.div>
  );
};

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-background py-20">
      {/* Background */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -left-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="text-center mb-16">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Planos e Preços</span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Escolha seu{' '}
            <span className="text-gradient-gold">Plano Ideal</span>
          </motion.h1>

          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Planos flexíveis que crescem com seu negócio. 
            Todos incluem acesso à plataforma e suporte.
          </motion.p>

          {/* Billing Toggle */}
          <motion.div
            className="inline-flex items-center gap-4 p-1.5 rounded-full glass"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Anual
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                billingCycle === 'yearly' ? 'bg-background text-primary' : 'bg-primary/20 text-primary'
              }`}>
                -20%
              </span>
            </button>
          </motion.div>
        </div>

        {/* Contabilidade Plans */}
        <div className="mb-20">
          <motion.h2
            className="text-2xl font-bold text-foreground text-center mb-10 flex items-center justify-center gap-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Building2 className="w-6 h-6 text-primary" />
            Planos de Contabilidade
          </motion.h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <PricingCard 
                key={plan.id} 
                plan={{...plan, price: billingCycle === 'yearly' ? Math.round(plan.price * 0.8) : plan.price}} 
                index={index} 
              />
            ))}
          </div>
        </div>

        {/* Legal Plans */}
        <div className="mb-20">
          <motion.h2
            className="text-2xl font-bold text-foreground text-center mb-10 flex items-center justify-center gap-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Scale className="w-6 h-6 text-emerald-400" />
            Planos de Assistência Jurídica
          </motion.h2>
          
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {legalPlans.map((plan, index) => (
              <LegalPlanCard 
                key={plan.id} 
                plan={{...plan, price: billingCycle === 'yearly' ? Math.round(plan.price * 0.8) : plan.price}} 
                index={index} 
              />
            ))}
          </div>
        </div>

        {/* Combo Banner */}
        <motion.div
          className="relative overflow-hidden"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="glass-card rounded-3xl p-8 md:p-12 border border-gradient-to-r from-primary/30 to-emerald-500/30">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-emerald-500/5" />
            
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 to-emerald-500/20 border border-primary/30 mb-4">
                  <Crown className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">Combo Exclusivo</span>
                </div>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  Pacote Empresarial Completo
                </h3>
                <p className="text-muted-foreground max-w-lg">
                  Contabilidade Business + Assistência Jurídica Pro. 
                  Tudo que sua empresa precisa em um só lugar.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="text-center sm:text-right">
                  <div className="flex items-center gap-2 justify-center sm:justify-end mb-1">
                    <span className="text-muted-foreground line-through">R$ {billingCycle === 'yearly' ? '558' : '698'}/mês</span>
                    <span className="text-green-400 text-sm font-medium">-35%</span>
                  </div>
                  <div className="flex items-baseline gap-1 justify-center sm:justify-end">
                    <span className="text-muted-foreground">R$</span>
                    <span className="text-5xl font-bold text-gradient-gold">
                      {billingCycle === 'yearly' ? '446' : '498'}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                </div>
                <motion.button
                  className="px-8 py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl btn-shine shadow-glow whitespace-nowrap"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Contratar Combo
                  <ArrowRight className="inline-block w-5 h-5 ml-2" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* FAQ Link */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <button className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span>Tem dúvidas? Fale com nosso time</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}