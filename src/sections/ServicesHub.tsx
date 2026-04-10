import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Calculator, 
  Scale, 
  Briefcase, 
  Shield, 
  Users,
  Zap,
  Building2,
  FileText,
  TrendingUp,
  Landmark,
  HeadphonesIcon,
  type LucideIcon
} from 'lucide-react';

interface Service {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  color: string;
  position: { top: string; left?: string; right?: string };
}

const services: Service[] = [
  {
    id: 'contabilidade',
    icon: Calculator,
    title: 'Contabilidade',
    subtitle: 'MEI ao Lucro Real',
    color: 'blue',
    position: { top: '5%', left: '15%' },
  },
  {
    id: 'fiscal',
    icon: FileText,
    title: 'Consultoria Fiscal',
    subtitle: 'Planejamento Tributário',
    color: 'cyan',
    position: { top: '25%', left: '5%' },
  },
  {
    id: 'rh',
    icon: Users,
    title: 'Gestão de RH',
    subtitle: 'Folha e Departamento',
    color: 'purple',
    position: { top: '50%', left: '0%' },
  },
  {
    id: 'abertura',
    icon: Building2,
    title: 'Abertura de Empresa',
    subtitle: 'CNPJ e Alvarás',
    color: 'emerald',
    position: { top: '75%', left: '5%' },
  },
  {
    id: 'suporte',
    icon: HeadphonesIcon,
    title: 'Suporte Contábil',
    subtitle: 'Atendimento 24/7',
    color: 'teal',
    position: { top: '95%', left: '15%' },
  },
  {
    id: 'juridico',
    icon: Scale,
    title: 'Assistência Jurídica',
    subtitle: 'Consultas e Contratos',
    color: 'amber',
    position: { top: '5%', right: '15%' },
  },
  {
    id: 'trabalhista',
    icon: Briefcase,
    title: 'Direito Trabalhista',
    subtitle: 'Defesa e Consultoria',
    color: 'orange',
    position: { top: '25%', right: '5%' },
  },
  {
    id: 'tributario',
    icon: Landmark,
    title: 'Direito Tributário',
    subtitle: 'Contencioso e Consultivo',
    color: 'rose',
    position: { top: '50%', right: '0%' },
  },
  {
    id: 'empresarial',
    icon: TrendingUp,
    title: 'Direito Empresarial',
    subtitle: 'Societário e Contratos',
    color: 'indigo',
    position: { top: '75%', right: '5%' },
  },
  {
    id: 'civel',
    icon: Shield,
    title: 'Direito Civil',
    subtitle: 'Proteção Patrimonial',
    color: 'pink',
    position: { top: '95%', right: '15%' },
  },
];

interface ColorClass {
  bg: string;
  text: string;
  border: string;
  hex: string;
}

const colorClasses: Record<string, ColorClass> = {
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3B82F6' },
  cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', hex: '#06B6D4' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#A855F7' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#10B981' },
  teal: { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', hex: '#14B8A6' },
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', hex: '#EAB308' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hex: '#F97316' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', hex: '#F43F5E' },
  indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', hex: '#6366F1' },
  pink: { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', hex: '#EC4899' },
};

// Central Hub (Client)
const CentralHub = () => {
  return (
    <motion.div
      className="relative flex flex-col items-center justify-center z-20"
      initial={{ opacity: 0, scale: 0.5 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      {/* Outer rotating rings */}
      <motion.div
        className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full border border-dashed border-primary/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />
      
      <motion.div
        className="absolute w-48 h-48 md:w-60 md:h-60 rounded-full border border-border/50"
        animate={{ rotate: -360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />

      {/* Glow background */}
      <motion.div 
        className="absolute w-32 h-32 md:w-40 md:h-40 bg-primary/30 rounded-full blur-3xl"
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Pulse rings */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-primary/20"
          style={{ width: 120 + i * 40, height: 120 + i * 40 }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Main hub */}
      <motion.div
        className="relative w-28 h-28 md:w-36 md:h-36 rounded-full glass border-2 border-primary/40 flex items-center justify-center"
        animate={{
          boxShadow: [
            '0 0 40px hsl(var(--primary) / 0.3)',
            '0 0 80px hsl(var(--primary) / 0.5)',
            '0 0 40px hsl(var(--primary) / 0.3)',
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Inner circle with icon */}
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
          <Zap className="w-8 h-8 md:w-10 md:h-10 text-primary-foreground" />
        </div>
      </motion.div>

      {/* Label */}
      <motion.div 
        className="absolute -bottom-12 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <span className="text-foreground font-bold text-lg block">Você</span>
        <span className="text-primary text-sm">No Centro de Tudo</span>
      </motion.div>
    </motion.div>
  );
};

// Service Card Component
const ServiceCard = ({ 
  service, 
  index
}: { 
  service: Service; 
  index: number;
}) => {
  const Icon = service.icon;
  const colors = colorClasses[service.color];

  return (
    <motion.div
      className="absolute z-10"
      style={service.position}
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <motion.div
        className={`glass-card rounded-xl md:rounded-2xl p-3 md:p-4 border ${colors.border} cursor-pointer group relative`}
        whileHover={{ scale: 1.08, y: -5 }}
        transition={{ duration: 0.3 }}
      >
        {/* Glow effect on hover */}
        <div className={`absolute inset-0 rounded-xl md:rounded-2xl ${colors.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
        
        <div className="relative z-10 flex items-center gap-2 md:gap-3">
          {/* Icon */}
          <motion.div
            className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl ${colors.bg} flex items-center justify-center border ${colors.border} flex-shrink-0`}
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.5 }}
          >
            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${colors.text}`} />
          </motion.div>
          
          {/* Text */}
          <div className="hidden sm:block">
            <h4 className="text-foreground font-semibold text-xs md:text-sm">{service.title}</h4>
            <p className="text-muted-foreground text-[10px] md:text-xs">{service.subtitle}</p>
          </div>
        </div>

        {/* Pulse indicator */}
        <motion.div
          className={`absolute -top-1 -right-1 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${colors.bg} ${colors.border} border`}
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.2,
          }}
        />
      </motion.div>
    </motion.div>
  );
};

// Connection Lines SVG
const ConnectionLines = ({ servicesList }: { servicesList: Service[] }) => {
  const ref = useRef<SVGSVGElement>(null);
  const isInView = useInView(ref, { once: true });

  // Calculate positions for lines (from card to center)
  const getLinePath = (index: number, total: number) => {
    const isLeft = index < total / 2;
    const normalizedIndex = isLeft ? index : index - total / 2;
    const sideCount = total / 2;
    
    // Calculate angle for this service
    const startAngle = isLeft ? 200 : -20;
    const angleRange = 140;
    const angle = startAngle + (normalizedIndex / (sideCount - 1)) * angleRange;
    const rad = (angle * Math.PI) / 180;
    
    // Start point (outer circle)
    const startRadius = 42;
    const x1 = 50 + startRadius * Math.cos(rad);
    const y1 = 50 + startRadius * Math.sin(rad);
    
    // End point (center)
    const x2 = 50;
    const y2 = 50;
    
    return { x1, y1, x2, y2 };
  };

  return (
    <svg 
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        {/* Glow filter */}
        <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Gradient for lines */}
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary) / 0.5)" />
          <stop offset="50%" stopColor="hsl(210 100% 60% / 0.3)" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0.5)" />
        </linearGradient>
      </defs>

      {/* Base connection lines */}
      {servicesList.map((service, index) => {
        const { x1, y1, x2, y2 } = getLinePath(index, servicesList.length);
        const colors = colorClasses[service.color];
        
        return (
          <g key={`line-${service.id}`}>
            {/* Background line */}
            <line
              x1={`${x1}%`}
              y1={`${y1}%`}
              x2={`${x2}%`}
              y2={`${y2}%`}
              stroke="hsl(var(--border))"
              strokeWidth="0.3"
            />
            
            {/* Colored line */}
            <line
              x1={`${x1}%`}
              y1={`${y1}%`}
              x2={`${x2}%`}
              y2={`${y2}%`}
              stroke={colors.hex}
              strokeWidth="0.2"
              strokeOpacity="0.4"
              filter="url(#lineGlow)"
            />
          </g>
        );
      })}

      {/* Animated light beams */}
      {servicesList.map((service, index) => {
        const { x1, y1, x2, y2 } = getLinePath(index, servicesList.length);
        const colors = colorClasses[service.color];
        
        return (
          <motion.circle
            key={`beam-${service.id}`}
            r="0.8"
            fill={colors.hex}
            filter="url(#lineGlow)"
            initial={{ opacity: 0 }}
            animate={isInView ? {
              opacity: [0, 1, 1, 0],
              cx: [`${x1}%`, `${x2}%`],
              cy: [`${y1}%`, `${y2}%`],
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: index * 0.3,
              ease: "easeInOut",
              times: [0, 0.2, 0.8, 1],
            }}
          />
        );
      })}

      {/* Pulse dots along lines */}
      {servicesList.map((service, index) => {
        const { x1, y1, x2, y2 } = getLinePath(index, servicesList.length);
        const colors = colorClasses[service.color];
        
        return [0.3, 0.6].map((pos, i) => (
          <motion.circle
            key={`dot-${service.id}-${i}`}
            r="0.4"
            fill={colors.hex}
            cx={`${x1 + (x2 - x1) * pos}%`}
            cy={`${y1 + (y2 - y1) * pos}%`}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: index * 0.2 + i * 0.5,
              ease: "easeInOut",
            }}
          />
        ));
      })}
    </svg>
  );
};

export default function ServicesHub() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section 
      ref={sectionRef}
      className="relative py-20 md:py-32 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Radial gradient from center */}
      <div className="absolute inset-0 bg-radial" />
      
      {/* Side glows */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Nossos Serviços</span>
          </motion.div>

          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Tudo Conectado a{' '}
            <span className="text-gradient-gold">Você</span>
          </motion.h2>

          <motion.p
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Nossa plataforma conecta você a todos os serviços que seu negócio precisa, 
            em um só lugar, com suporte contínuo.
          </motion.p>
        </div>

        {/* Services Hub - Circular Layout */}
        <div className="relative h-[500px] md:h-[600px] lg:h-[700px]">
          {/* Connection Lines */}
          <ConnectionLines servicesList={services} />

          {/* Central Hub */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <CentralHub />
          </div>

          {/* Service Cards positioned around */}
          <div className="absolute inset-0">
            {services.map((service, index) => (
              <ServiceCard 
                key={service.id} 
                service={service} 
                index={index}
              />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-8 md:mt-12 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <p className="text-muted-foreground mb-4 md:mb-6 text-sm md:text-base">
            Todos os serviços integrados em uma única plataforma
          </p>
          <motion.button
            className="px-6 md:px-8 py-3 md:py-4 bg-gradient-gold text-primary-foreground font-bold rounded-xl btn-shine shadow-glow text-sm md:text-base"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Explorar Todos os Serviços
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}
