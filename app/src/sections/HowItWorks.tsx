import { useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { 
  Search, 
  UserCheck, 
  FileCheck, 
  MessageCircle,
  Sparkles,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';

const steps = [
  {
    id: 1,
    icon: Search,
    title: 'Encontre',
    description: 'Busque por serviço ou especialidade. Filtre por localização, avaliações e preço.',
    color: 'blue',
    details: [
      'Navegue por categoria',
      'Compare profissionais',
      'Veja avaliações reais',
    ],
  },
  {
    id: 2,
    icon: UserCheck,
    title: 'Escolha',
    description: 'Selecione o profissional ideal para sua necessidade ou deixe que indiquemos o melhor.',
    color: 'amber',
    details: [
      'Perfil completo verificado',
      'Portfólio de trabalhos',
      'Contato direto',
    ],
  },
  {
    id: 3,
    icon: FileCheck,
    title: 'Contrate',
    description: 'Formalize o contrato pela plataforma com segurança e transparência.',
    color: 'purple',
    details: [
      'Contrato digital',
      'Termos claros',
      'Garantia de serviço',
    ],
  },
  {
    id: 4,
    icon: MessageCircle,
    title: 'Acompanhe',
    description: 'Monitore o progresso do serviço através da nossa plataforma integrada.',
    color: 'emerald',
    details: [
      'Chat integrado',
      'Notificações em tempo real',
      'Compartilhamento de arquivos',
    ],
  },
  {
    id: 5,
    icon: CheckCircle2,
    title: 'Avalie',
    description: 'Receba o serviço concluído e avalie sua experiência para ajudar outros clientes.',
    color: 'pink',
    details: [
      'Confirmação de entrega',
      'Sistema de avaliação',
      'Suporte pós-serviço',
    ],
  },
];

const StepCard = ({ step, index, isActive, onClick }: { 
  step: typeof steps[0]; 
  index: number; 
  isActive: boolean;
  onClick: () => void;
}) => {
  const Icon = step.icon;
  
  const colorClasses: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    blue: { 
      bg: 'bg-blue-500/20', 
      text: 'text-blue-400', 
      border: 'border-blue-500/30',
      glow: 'shadow-blue-500/20'
    },
    amber: { 
      bg: 'bg-amber-500/20', 
      text: 'text-amber-400', 
      border: 'border-amber-500/30',
      glow: 'shadow-amber-500/20'
    },
    purple: { 
      bg: 'bg-purple-500/20', 
      text: 'text-purple-400', 
      border: 'border-purple-500/30',
      glow: 'shadow-purple-500/20'
    },
    emerald: { 
      bg: 'bg-emerald-500/20', 
      text: 'text-emerald-400', 
      border: 'border-emerald-500/30',
      glow: 'shadow-emerald-500/20'
    },
    pink: { 
      bg: 'bg-pink-500/20', 
      text: 'text-pink-400', 
      border: 'border-pink-500/30',
      glow: 'shadow-pink-500/20'
    },
  };

  const colors = colorClasses[step.color];

  return (
    <motion.div
      className={`relative cursor-pointer group ${isActive ? 'z-10' : 'z-0'}`}
      initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      onClick={onClick}
    >
      <motion.div
        className={`relative glass-card rounded-2xl p-6 border transition-all duration-500 ${
          isActive ? `${colors.border} ${colors.glow}` : 'border-border/50 hover:border-border'
        }`}
        animate={{
          scale: isActive ? 1.02 : 1,
          y: isActive ? -5 : 0,
        }}
        whileHover={{ scale: 1.01 }}
      >
        {/* Step Number */}
        <div className={`absolute -top-3 -left-3 w-8 h-8 rounded-full ${colors.bg} ${colors.text} flex items-center justify-center font-bold text-sm border ${colors.border}`}>
          {step.id}
        </div>

        <div className="flex items-start gap-4">
          {/* Icon */}
          <motion.div
            className={`w-14 h-14 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0 border ${colors.border}`}
            animate={isActive ? { rotate: [0, -10, 10, 0] } : {}}
            transition={{ duration: 0.5 }}
          >
            <Icon className={`w-7 h-7 ${colors.text}`} />
          </motion.div>

          {/* Content */}
          <div className="flex-1">
            <h3 className={`text-xl font-bold mb-2 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.title}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              {step.description}
            </p>

            {/* Details - shown when active */}
            <motion.div
              initial={false}
              animate={{
                height: isActive ? 'auto' : 0,
                opacity: isActive ? 1 : 0,
              }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <ul className="space-y-2 pt-2 border-t border-border">
                {step.details.map((detail, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className={`w-4 h-4 ${colors.text}`} />
                    {detail}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Arrow indicator */}
          <motion.div
            animate={{ x: isActive ? 5 : 0 }}
            className={`${isActive ? colors.text : 'text-muted'}`}
          >
            <ArrowRight className="w-5 h-5" />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });

  const lineProgress = useTransform(scrollYProgress, [0.2, 0.8], [0, 100]);

  return (
    <section 
      id="how-it-works" 
      ref={sectionRef}
      className="relative py-32 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Decorative gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Processo Simples</span>
          </motion.div>

          <motion.h2
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Como Funciona a{' '}
            <span className="text-gradient-gold">Vincis</span>
          </motion.h2>

          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Em apenas 5 passos simples, você encontra, contrata e recebe 
            serviços profissionais de qualidade.
          </motion.p>
        </div>

        {/* Steps Grid */}
        <div className="relative">
          {/* Progress Line - Desktop only */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2">
            <motion.div
              className="absolute top-0 left-0 w-full bg-border"
              style={{ height: '100%' }}
            />
            <motion.div
              className="absolute top-0 left-0 w-full bg-gradient-to-b from-primary to-primary/50"
              style={{ height: lineProgress.get() + '%' }}
            />
          </div>

          {/* Steps */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`${index % 2 === 0 ? 'lg:pr-16' : 'lg:pl-16 lg:col-start-2'}`}
              >
                <StepCard
                  step={step}
                  index={index}
                  isActive={activeStep === index}
                  onClick={() => setActiveStep(index)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          className="mt-20 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <motion.button
            className="px-10 py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl btn-shine shadow-glow inline-flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Começar Agora
            <ArrowRight className="w-5 h-5" />
          </motion.button>
          <p className="mt-4 text-muted-foreground text-sm">
            Cadastro gratuito. Sem compromisso.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
