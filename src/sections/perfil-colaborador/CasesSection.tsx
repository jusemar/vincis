import { useRef } from 'react';
import { motion } from 'framer-motion';
import { professionalData } from './types';

export default function CasesSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allCases = [...professionalData.cases, ...professionalData.cases];

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      style={{
        background: '#ffffff',
        border: '1px solid #e8dfd4',
        borderRadius: 20,
        padding: 24,
        boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
        maxWidth: 720,
        overflow: 'hidden',
      }}
    >
      <div
        className="uppercase text-[11px] font-[950] mb-[7px]"
        style={{ color: '#e6a51d', letterSpacing: '.13em' }}
      >
        Casos de sucesso
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Experiências com clientes e demandas reais
      </h2>

      <div
        ref={scrollRef}
        className="flex gap-[14px] overflow-x-auto pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div style={{ minWidth: 20, flexShrink: 0 }} />
        {allCases.map((c, i) => (
          <article
            key={i}
            style={{
              minWidth: 248,
              minHeight: 148,
              scrollSnapAlign: 'start',
              border: 'none',
              borderRadius: 18,
              background: 'linear-gradient(160deg, #fff, #fff8e8)',
              padding: 17,
              boxShadow: '0 2px 8px rgba(32, 28, 22, .04)',
              position: 'relative',
              zIndex: 1,
              transition: '.22s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)';
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(32, 28, 22, .12)';
              e.currentTarget.style.zIndex = '10';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = '';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.zIndex = '1';
            }}
          >
            <div
              className="text-[11px] font-[950] uppercase mb-[10px]"
              style={{ color: '#e6a51d', letterSpacing: '.12em' }}
            >
              {c.type}
            </div>
            <h3 className="text-[15px] font-bold mb-[8px] leading-[1.35]" style={{ color: '#171412' }}>
              {c.title}
            </h3>
            <p style={{ color: '#6f675d', lineHeight: 1.5, fontSize: 13 }}>
              {c.description}
            </p>
          </article>
        ))}
        <div style={{ minWidth: 20, flexShrink: 0 }} />
      </div>
    </motion.section>
  );
}
