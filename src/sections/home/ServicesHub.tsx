import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Calculator, Scale, Briefcase, Shield, Users,
  Building2, FileText, TrendingUp, Landmark, type LucideIcon
} from 'lucide-react';

// ============================================
// CONFIGURAÇÕES DE POSICIONAMENTO
// ============================================
const centerX = 475; 
const centerY = 350; 

// >>> ALTERE AQUI PARA AUMENTAR A DISTÂNCIA:
const radius = 320; // Aumentei de 290 para 320. Quanto maior, mais longe do centro.

const getPosition = (angleDeg: number) => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleRad),
    y: centerY + radius * Math.sin(angleRad)
  };
};

const services = [
  { id: 'contabilidade', icon: Calculator, title: 'Contabilidade', subtitle: 'MEI ao Lucro Real', color: 'blue', angle: 0 },
  { id: 'fiscal', icon: FileText, title: 'Consultoria Fiscal', subtitle: 'Planejamento Tributário', color: 'cyan', angle: 45 },
  { id: 'rh', icon: Users, title: 'Gestão de RH', subtitle: 'Folha e Departamento', color: 'purple', angle: 90 },
  { id: 'abertura', icon: Building2, title: 'Abertura de Empresa', subtitle: 'CNPJ e Alvarás', color: 'emerald', angle: 135 },
  { id: 'juridico', icon: Scale, title: 'Assistência Jurídica', subtitle: 'Consultas e Contratos', color: 'amber', angle: 180 },
  { id: 'trabalhista', icon: Briefcase, title: 'Direito Trabalhista', subtitle: 'Defesa e Consultoria', color: 'orange', angle: 225 },
  { id: 'tributario', icon: Landmark, title: 'Direito Tributário', subtitle: 'Contencioso e Consultivo', color: 'rose', angle: 270 },
  { id: 'empresarial', icon: TrendingUp, title: 'Direito Empresarial', subtitle: 'Societário e Contratos', color: 'indigo', angle: 315 },
];

const colorClasses: Record<string, any> = {
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3B82F6' },
  cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', hex: '#06B6D4' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#A855F7' },
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#10B981' },
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', hex: '#EAB308' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hex: '#F97316' },
  rose: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', hex: '#F43F5E' },
  indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', hex: '#6366F1' },
};

export default function ServicesHub() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true });

  return (
    <section className="relative py-20 bg-background overflow-hidden">
      <div className="relative z-10 max-w-7xl mx-auto px-4">
        
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-bold text-foreground">
            Tudo Conectado ao <span className="text-gradient-gold">Seu Negócio</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Nossa plataforma conecta você a todos os serviços que seu negócio precisa.
          </p>
        </div>

        <div ref={containerRef} className="relative flex justify-center items-center">
          
          <svg width="950" height="700" viewBox="0 0 950 700" className="mx-auto overflow-visible">
            {/* Linhas de Conexão com Animação de Fluxo */}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              return (
                <motion.line 
                  key={idx} x1={centerX} y1={centerY} x2={pos.x} y2={pos.y}
                  stroke={colors.hex} strokeWidth="1.5" strokeDasharray="8 6" opacity="0.4"
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: -100 }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                />
              );
            })}

            {/* CARD CENTRAL "SEU NEGÓCIO" */}
            <foreignObject x={centerX - 150} y={centerY - 150} width="300" height="300" className="overflow-visible">
              <div className="w-full h-full flex flex-col items-center justify-center relative">
                
                {/* Anéis de Pulso */}
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border border-primary/20"
                    style={{ width: 120 + i * 40, height: 120 + i * 40 }}
                    animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                  />
                ))}

                {/* Hub Principal */}
                <motion.div
                  className="relative w-28 h-28 md:w-36 md:h-36 rounded-full glass border-2 border-primary/40 flex flex-col items-center justify-center bg-background z-20"
                  animate={{ boxShadow: ['0 0 20px hsl(var(--primary)/0.2)', '0 0 50px hsl(var(--primary)/0.4)', '0 0 20px hsl(var(--primary)/0.2)'] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow mb-1">
                    <Building2 className="text-primary-foreground w-8 h-8 md:w-10 md:h-10" />
                  </div>
                </motion.div>
                
                {/* Label Única */}
                <div className="absolute bottom-10 z-30 text-center">
                   <span className="text-foreground font-bold text-lg block leading-none">Seu Negócio</span>
                </div>
              </div>
            </foreignObject>

            {/* Cards Periféricos */}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              const Icon = service.icon;

              return (
                <foreignObject key={service.id} x={pos.x - 100} y={pos.y - 40} width="200" height="80" className="overflow-visible">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center gap-3 p-3 glass-card rounded-xl border ${colors.border} bg-background/90 shadow-lg group hover:scale-105 transition-transform`}
                  >
                    <div className={`p-2 rounded-lg ${colors.bg} ${colors.text} flex-shrink-0`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-foreground font-bold text-xs md:text-sm truncate">{service.title}</h4>
                      <p className="text-muted-foreground text-[10px] truncate">{service.subtitle}</p>
                    </div>
                  </motion.div>
                </foreignObject>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}