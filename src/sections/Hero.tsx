import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import { ArrowRight, Shield, Users, Zap, Award } from 'lucide-react';

// 3D Floating Card Component
const FloatingCard = ({ 
  children, 
  className, 
  delay = 0,
  x = 0,
  y = 0
}: { 
  children: React.ReactNode; 
  className?: string;
  delay?: number;
  x?: number;
  y?: number;
}) => {
  return (
    <motion.div
      className={`absolute ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        y: [0, -15, 0],
      }}
      transition={{
        opacity: { duration: 0.8, delay },
        scale: { duration: 0.8, delay },
        y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: delay + 1 }
      }}
      style={{ x, y }}
      whileHover={{ scale: 1.05, rotateY: 5, rotateX: -5 }}
    >
      {children}
    </motion.div>
  );
};

// Animated Background Orbs
const BackgroundOrbs = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Large gradient orb */}
      <motion.div
        className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] rounded-full"
        style={{
          background: 'radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      
      {/* Secondary orb */}
      <motion.div
        className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, hsl(210 100% 60% / 0.1) 0%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-primary/30 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -100, 0],
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 5 + Math.random() * 5,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// 3D Tilt Card for stats
const TiltCard = ({ icon: Icon, value, label }: { icon: any, value: string, label: string }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useTransform(y, [-100, 100], [10, -10]);
  const rotateY = useTransform(x, [-100, 100], [-10, 10]);
  
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      className="glass-card rounded-2xl p-6 cursor-pointer"
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </div>
    </motion.div>
  );
};

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section 
      id="hero" 
      ref={containerRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero"
    >
      {/* Background Effects */}
      <BackgroundOrbs />
      <div className="absolute inset-0 bg-grid opacity-50" />
      
      {/* Content */}
      <motion.div 
        className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32"
        style={{ y, opacity }}
      >
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Column - Text */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-sm text-muted-foreground">Plataforma líder em serviços profissionais</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-foreground leading-tight mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Seuuuu Negócio{' '}
              <span className="text-gradient-gold">Protegidoss</span>
              <br />
              e Organizado
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-xl mx-auto lg:mx-0"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              Conectamos você aos melhores <span className="text-primary font-medium">contadores</span>,{' '}
              <span className="text-primary font-medium">advogados</span> e{' '}
              <span className="text-primary font-medium">técnicos especialistas</span>. 
              Tudo em uma única plataforma.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <motion.button
                className="group px-8 py-4 text-base font-semibold text-primary-foreground bg-gradient-gold rounded-xl btn-shine shadow-glow hover:shadow-glow-lg transition-all flex items-center justify-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Explorar Serviços
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.button
                className="px-8 py-4 text-base font-semibold text-foreground border border-border rounded-xl hover:bg-muted transition-colors flex items-center justify-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-primary border-b-4 border-b-transparent ml-1" />
                </div>
                Ver Demonstração
              </motion.button>
            </motion.div>

            {/* Stats */}
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-4 gap-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              <TiltCard icon={Users} value="10K+" label="Clientes" />
              <TiltCard icon={Award} value="500+" label="Profissionais" />
              <TiltCard icon={Shield} value="99%" label="Satisfação" />
              <TiltCard icon={Zap} value="24h" label="Suporte" />
            </motion.div>
          </div>

          {/* Right Column - 3D Visual */}
          <div className="relative hidden lg:block h-[600px]">
            {/* Central glowing orb */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64"
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 30,
                repeat: Infinity,
                ease: "linear"
              }}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/30 to-blue-500/30 blur-3xl" />
            </motion.div>

            {/* Floating Cards */}
            <FloatingCard 
              className="top-10 right-10" 
              delay={0.3}
              x={50}
              y={-80}
            >
              <div className="glass-card rounded-2xl p-5 w-64">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Award className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Contabilidade</div>
                    <div className="text-xs text-muted-foreground">Plano Mensal</div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-gradient-gold">R$ 199/mês</div>
              </div>
            </FloatingCard>

            <FloatingCard 
              className="top-1/3 left-0" 
              delay={0.5}
              x={-30}
              y={20}
            >
              <div className="glass-card rounded-2xl p-5 w-56">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Assistência Jurídica</div>
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                      Disponível 24/7
                    </div>
                  </div>
                </div>
              </div>
            </FloatingCard>

            <FloatingCard 
              className="bottom-20 right-5" 
              delay={0.7}
              x={80}
              y={100}
            >
              <div className="glass-card rounded-2xl p-4 w-48">
                <div className="flex -space-x-2 mb-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div 
                      key={i}
                      className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 border-2 border-background"
                    />
                  ))}
                  <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs text-foreground font-medium">
                    +99
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">Profissionais verificados</div>
              </div>
            </FloatingCard>

            <FloatingCard 
              className="bottom-10 left-10" 
              delay={0.9}
              x={-20}
              y={150}
            >
              <div className="glass-card rounded-xl p-4 w-52">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Economia mensal</span>
                  <span className="text-xs text-green-400">+35%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-gold rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: '75%' }}
                    transition={{ duration: 1.5, delay: 1.5 }}
                  />
                </div>
              </div>
            </FloatingCard>

            {/* Connection lines SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary) / 0.3)" />
                  <stop offset="100%" stopColor="hsl(210 100% 60% / 0.3)" />
                </linearGradient>
              </defs>
              <motion.path
                d="M 200 150 Q 300 200 350 300"
                stroke="url(#lineGradient)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="5,5"
                animate={{
                  strokeDashoffset: [0, -20],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear"
                }}
              />
              <motion.path
                d="M 150 350 Q 250 300 320 250"
                stroke="url(#lineGradient)"
                strokeWidth="1"
                fill="none"
                strokeDasharray="5,5"
                animate={{
                  strokeDashoffset: [0, -20],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear",
                  delay: 0.5
                }}
              />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
