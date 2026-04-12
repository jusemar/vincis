import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Shield } from 'lucide-react';

const ServicesHub: React.FC = () => {
  // ============================================
  // 1. CONFIGURAÇÕES
  // ============================================
  const centerX = 440;
  const centerY = 340;
  const radius = 290;

  // Cores dos cards (baseadas no seu arquivo)
  const colorClasses: Record<string, { bg: string; text: string; border: string; hex: string }> = {
    blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hex: '#3B82F6' },
    cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', hex: '#06B6D4' },
    purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#A855F7' },
    emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#10B981' },
    amber: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', hex: '#F59E0B' },
    orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hex: '#F97316' },
    rose: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', hex: '#F43F5E' },
    indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', hex: '#6366F1' },
  };

  const services = [
    { nome1: 'Consulta', nome2: 'Fiscal', angle: 0, color: 'blue', icon: '📊' },
    { nome1: 'Consultas', nome2: 'Móvel', angle: 45, color: 'cyan', icon: '📱' },
    { nome1: 'Abertas de', nome2: 'Empresas', angle: 90, color: 'emerald', icon: '🏢' },
    { nome1: 'Seguinte', nome2: 'Contador', angle: 135, color: 'purple', icon: '👨‍💼' },
    { nome1: 'Asistencia', nome2: 'de Bebé', angle: 180, color: 'amber', icon: '👶' },
    { nome1: 'Desko', nome2: 'Tributário', angle: 225, color: 'orange', icon: '⚖️' },
    { nome1: 'Direito', nome2: 'Empresarial', angle: 270, color: 'indigo', icon: '🏛️' },
    { nome1: 'Todos', nome2: 'os serviços', angle: 315, color: 'rose', icon: '🌟' },
  ];

  const getPosition = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleRad),
      y: centerY + radius * Math.sin(angleRad)
    };
  };

  return (
    <section className="relative py-20 md:py-32 overflow-hidden bg-gradient-to-br from-slate-900 via-navy-900 to-slate-900">
      {/* Fundo com efeitos */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-radial" />
      
      {/* Glows laterais */}
      <div className="absolute top-1/2 -translate-y-1/2 -left-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 -translate-y-1/2 -right-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* CABEÇALHO */}
        <div className="text-center mb-12 md:mb-16">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-slate-400">Nossos Serviços</span>
          </motion.div>

          <motion.h2
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Tudo Conectado a{' '}
            <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              Você
            </span>
          </motion.h2>

          <motion.p
            className="text-lg text-slate-400 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Nossa plataforma conecta você a todos os serviços que seu negócio precisa,
            em um só lugar, com suporte contínuo.
          </motion.p>
        </div>

        {/* SVG PRINCIPAL */}
        <div className="relative flex justify-center items-center">
          <svg width="900" height="650" viewBox="0 0 900 650" className="mx-auto">
            
            <defs>
              {/* Gradiente central */}
              <radialGradient id="centerGradient">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.8" />
              </radialGradient>

              {/* Filtro de brilho */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>

              <filter id="lineGlow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* ========================================
                LINHAS DE CONEXÃO
            ==========================================*/}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              return (
                <g key={`line-group-${idx}`}>
                  {/* Linha base */}
                  <line
                    x1={centerX} y1={centerY}
                    x2={pos.x} y2={pos.y}
                    stroke="#334155"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity="0.5"
                  />
                  {/* Linha colorida com glow */}
                  <line
                    x1={centerX} y1={centerY}
                    x2={pos.x} y2={pos.y}
                    stroke={colors.hex}
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    opacity="0.6"
                    filter="url(#lineGlow)"
                  />
                </g>
              );
            })}

            {/* ========================================
                PARTÍCULAS ANIMADAS NAS LINHAS
            ==========================================*/}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              return (
                <motion.circle
                  key={`particle-${idx}`}
                  r="4"
                  fill={colors.hex}
                  filter="url(#lineGlow)"
                  animate={{
                    cx: [centerX, pos.x],
                    cy: [centerY, pos.y],
                    opacity: [0, 1, 0]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: idx * 0.15,
                    ease: "linear"
                  }}
                />
              );
            })}

            {/* ========================================
                CÍRCULOS PULSANTES NAS PONTAS
            ==========================================*/}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              return (
                <motion.circle
                  key={`pulse-${idx}`}
                  cx={pos.x} cy={pos.y}
                  r="6"
                  fill={colors.hex}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.8, 0.2, 0.8] }}
                  transition={{ duration: 2, delay: idx * 0.15, repeat: Infinity }}
                />
              );
            })}

            {/* ========================================
                CARD CENTRAL (VOCÊ) - COM ANIMAÇÕES
            ==========================================*/}
            
            {/* Fundo para esconder as linhas */}
            <circle cx={centerX} cy={centerY} r="75" fill="#0f172a" />
            
            {/* Anel giratório externo */}
            <motion.circle
              cx={centerX} cy={centerY} r="90"
              fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 12"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: `${centerX}px ${centerY}px` }}
            />
            
            {/* Anel giratório interno (sentido oposto) */}
            <motion.circle
              cx={centerX} cy={centerY} r="78"
              fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 10"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: `${centerX}px ${centerY}px` }}
            />
            
            {/* Efeito de pulsação de luz (glow) */}
            <motion.circle
              cx={centerX} cy={centerY} r="70"
              fill="#f59e0b"
              opacity="0.15"
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.15, 0.05, 0.15]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            
            <motion.circle
              cx={centerX} cy={centerY} r="85"
              fill="#f59e0b"
              opacity="0.08"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.08, 0.02, 0.08]
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />
            
            {/* Círculo principal com gradiente */}
            <motion.circle
              cx={centerX} cy={centerY} r="60"
              fill="url(#centerGradient)" filter="url(#glow)"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
            />
            
            {/* Ícone central (Zap) */}
            <foreignObject x={centerX - 20} y={centerY - 20} width="40" height="40">
              <div className="w-10 h-10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
            </foreignObject>
            
            {/* Texto "Você" abaixo do ícone */}
            <text
              x={centerX}
              y={centerY + 30}
              textAnchor="middle"
              fill="#fff"
              fontWeight="bold"
              fontSize="14"
              fontFamily="sans-serif"
              letterSpacing="2"
            >
              VOCÊ
            </text>
            
            {/* Subtítulo */}
            <text
              x={centerX}
              y={centerY + 44}
              textAnchor="middle"
              fill="#f59e0b"
              fontSize="9"
              fontFamily="sans-serif"
              opacity="0.8"
            >
              No Centro de Tudo
            </text>

            {/* ========================================
                CARDS DOS SERVIÇOS (COM VISUAL DO SEU ARQUIVO)
            ==========================================*/}
            {services.map((service, idx) => {
              const pos = getPosition(service.angle);
              const colors = colorClasses[service.color];
              return (
                <g key={`card-${idx}`}>
                  {/* Card com efeito glass */}
                  <motion.rect
                    x={pos.x - 70}
                    y={pos.y - 32}
                    width="140"
                    height="64"
                    rx="12"
                    fill="rgba(30, 41, 59, 0.9)"
                    stroke={colors.hex}
                    strokeWidth="1.5"
                    strokeOpacity="0.4"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 + idx * 0.05 }}
                    whileHover={{ 
                      scale: 1.05, 
                      strokeWidth: 2,
                      strokeOpacity: 1,
                      fill: "rgba(30, 41, 59, 0.95)"
                    }}
                  />
                  
                  {/* Fundo de hover com cor do card */}
                  <motion.rect
                    x={pos.x - 70}
                    y={pos.y - 32}
                    width="140"
                    height="64"
                    rx="12"
                    fill={colors.hex}
                    fillOpacity="0"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 0.1 }}
                    transition={{ duration: 0.2 }}
                  />
                  
                  {/* Ícone (emoji simples, substitua por ícones Lucide se quiser) */}
                  <text
                    x={pos.x - 40}
                    y={pos.y + 6}
                    textAnchor="middle"
                    fontSize="20"
                    fontFamily="sans-serif"
                  >
                    {service.icon}
                  </text>
                  
                  {/* Primeira linha do texto */}
                  <motion.text
                    x={pos.x + 5}
                    y={pos.y - 5}
                    textAnchor="middle"
                    fill="#f1f5f9"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.5 + idx * 0.05 }}
                  >
                    {service.nome1}
                  </motion.text>
                  
                  {/* Segunda linha do texto */}
                  <motion.text
                    x={pos.x + 5}
                    y={pos.y + 10}
                    textAnchor="middle"
                    fill={colors.hex}
                    fontSize="10"
                    fontWeight="500"
                    fontFamily="sans-serif"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.6 + idx * 0.05 }}
                  >
                    {service.nome2}
                  </motion.text>

                  {/* Indicador pulsante no canto do card */}
                  <motion.circle
                    cx={pos.x + 60}
                    cy={pos.y - 22}
                    r="3"
                    fill={colors.hex}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, delay: idx * 0.2, repeat: Infinity }}
                  />
                </g>
              );
            })}
            
          </svg>
        </div>

        {/* BOTÃO CTA */}
        <motion.div
          className="mt-12 md:mt-16 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <p className="text-slate-400 mb-4 md:mb-6 text-sm md:text-base">
            Todos os serviços integrados em uma única plataforma
          </p>
          <motion.button
            className="px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/25 text-sm md:text-base"
            whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(245, 158, 11, 0.4)" }}
            whileTap={{ scale: 0.95 }}
          >
            Explorar Todos os Serviços
          </motion.button>
        </motion.div>
        
      </div>
    </section>
  );
};

export default ServicesHub;