import { useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Calculator, 
  Scale, 
  Check, 
  ArrowRight,
  Building2,
  Briefcase,
  Gavel
} from 'lucide-react';

interface ModelCard {
  id: string;
  icon: any;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  price: string;
  priceLabel: string;
  color: string;
  gradient: string;
}

const models: ModelCard[] = [
  {
    id: 'contabilidade',
    icon: Calculator,
    title: 'Planos de Contabilidade',
    subtitle: 'White Label',
    description: 'Serviços contábeis completos com parceiros especializados trabalhando sob sua marca.',
    features: [
      'Abertura de empresa',
      'Emissão de notas fiscais',
      'Cálculo e envio de impostos',
      'Folha de pagamento',
      'Obrigações acessórias',
    ],
    price: 'R$ 199',
    priceLabel: '/mês',
    color: 'blue',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'avulsos',
    icon: Briefcase,
    title: 'Serviços Avulsos',
    subtitle: 'Marketplace',
    description: 'Contrate serviços pontuais de contadores e técnicos especializados conforme sua necessidade.',
    features: [
      'Consultoria fiscal específica',
      'Análise de RH',
      'Declaração de Imposto de Renda',
      'Serviços de abertura',
      'Escolha seu profissional',
    ],
    price: 'A partir R$ 99',
    priceLabel: '/serviço',
    color: 'amber',
    gradient: 'from-amber-500/20 to-yellow-500/20',
  },
  {
    id: 'advogados',
    icon: Scale,
    title: 'Diretório de Advogados',
    subtitle: 'Divulgação',
    description: 'Encontre advogados verificados por especialidade e entre em contato diretamente.',
    features: [
      'Advogados verificados OAB',
      'Busca por especialidade',
      'Contato direto',
      'Avaliações de clientes',
      '100% gratuito',
    ],
    price: 'Grátis',
    priceLabel: '',
    color: 'purple',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'juridico',
    icon: Gavel,
    title: 'Assistência Jurídica',
    subtitle: 'Convênio',
    description: 'Plano de assistência jurídica completo, similar a um plano de saúde para seu negócio.',
    features: [
      'Consultas ilimitadas',
      'Elaboração de contratos',
      'Notificações extrajudiciais',
      'Advogado designado',
      'Sem custos adicionais',
    ],
    price: 'R$ 299',
    priceLabel: '/mês',
    color: 'emerald',
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
];

const ModelCardComponent = ({ model, index }: { model: ModelCard; index: number }) => {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = model.icon;

  const colorClasses: Record<string, { icon: string; glow: string; border: string }> = {
    blue: { icon: 'text-blue-400', glow: 'shadow-blue-500/20', border: 'border-blue-500/30' },
    amber: { icon: 'text-amber-400', glow: 'shadow-amber-500/20', border: 'border-amber-500/30' },
    purple: { icon: 'text-purple-400', glow: 'shadow-purple-500/20', border: 'border-purple-500/30' },
    emerald: { icon: 'text-emerald-400', glow: 'shadow-emerald-500/20', border: 'border-emerald-500/30' },
  };

  const colors = colorClasses[model.color];

  return (
    <motion.div
      className="relative group"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className={`relative h-full glass-card rounded-3xl p-8 border transition-all duration-500 ${colors.border} ${isHovered ? colors.glow : ''}`}
        style={{
          boxShadow: isHovered ? `0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(255,255,255,0.05)` : undefined,
        }}
        whileHover={{ y: -10, scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        {/* Background gradient on hover */}
        <motion.div
          className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${model.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Icon */}
          <motion.div
            className={`w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6 border border-border`}
            animate={{ rotate: isHovered ? [0, -10, 10, 0] : 0 }}
            transition={{ duration: 0.5 }}
          >
            <Icon className={`w-8 h-8 ${colors.icon}`} />
          </motion.div>

          {/* Subtitle badge */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-${model.color}-500/10 border border-${model.color}-500/20 mb-3`}>
            <span className={`w-1.5 h-1.5 rounded-full bg-${model.color}-400`} />
            <span className={`text-xs font-medium text-${model.color}-400`}>{model.subtitle}</span>
          </div>

          {/* Title */}
          <h3 className="text-2xl font-bold text-foreground mb-3">{model.title}</h3>

          {/* Description */}
          <p className="text-muted-foreground mb-6 leading-relaxed">{model.description}</p>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {model.features.map((feature, i) => (
              <motion.li
                key={i}
                className="flex items-center gap-3 text-sm text-muted-foreground"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 + i * 0.1 }}
              >
                <div className={`w-5 h-5 rounded-full bg-${model.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                  <Check className={`w-3 h-3 ${colors.icon}`} />
                </div>
                {feature}
              </motion.li>
            ))}
          </ul>

          {/* Price */}
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-3xl font-bold text-foreground">{model.price}</span>
            <span className="text-muted-foreground">{model.priceLabel}</span>
          </div>

          {/* CTA Button */}
          <motion.button
            className={`w-full py-3 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
              model.color === 'amber'
                ? 'bg-gradient-gold text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Saiba Mais
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Decorative corner */}
        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${model.gradient} rounded-tr-3xl rounded-bl-full opacity-20 pointer-events-none`} />
      </motion.div>
    </motion.div>
  );
};

export default function Models() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section 
      id="models" 
      ref={sectionRef}
      className="relative py-32 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Nossos Serviços</span>
          </motion.div>

          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Quatro Formas de{' '}
            <span className="text-gradient-gold">Crescer</span>
          </motion.h2>

          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Escolha o modelo que melhor se adapta às necessidades do seu negócio. 
            Todos com profissionais verificados e qualidade garantida.
          </motion.p>
        </div>

        {/* Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {models.map((model, index) => (
            <ModelCardComponent key={model.id} model={model} index={index} />
          ))}
        </div>

        {/* Cross-sell Banner */}
        <motion.div
          className="mt-16 relative overflow-hidden"
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <div className="glass-card rounded-3xl p-8 md:p-12 border border-primary/20">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-blue-500/5" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-primary">Oferta Especial</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                  Pacote Empresarial Completo
                </h3>
                <p className="text-muted-foreground">
                  Contabilidade + Assistência Jurídica com{' '}
                  <span className="text-primary font-semibold">R$ 200 de desconto</span>
                </p>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground line-through">R$ 498/mês</div>
                  <div className="text-4xl font-bold text-gradient-gold">R$ 298/mês</div>
                </div>
                <motion.button
                  className="px-8 py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl btn-shine shadow-glow"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Contratar Pacote
                  <ArrowRight className="inline-block w-5 h-5 ml-2" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
