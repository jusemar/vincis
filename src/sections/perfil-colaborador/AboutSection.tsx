import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { professionalData } from './types';

export default function AboutSection() {
  const d = professionalData;

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
      }}
    >
      <div
        className="uppercase text-[11px] font-[950] mb-[7px]"
        style={{ color: '#e6a51d', letterSpacing: '.13em' }}
      >
        Sobre o contador
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Especialista em rotinas fiscais e regularização
      </h2>
      <p style={{ color: '#6f675d', lineHeight: 1.72, fontSize: 15, marginBottom: 18 }}>
        {d.about}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <div
          style={{
            background: '#f8f5ef',
            border: '1px solid #f1ebe3',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 11, color: '#171412' }}>
            Formação
          </h3>
          <div style={{ display: 'grid', gap: 9 }}>
            {['Ciências Contábeis — UFMG', 'Pós-graduação em Gestão Tributária', 'Registro profissional ativo'].map((item, i) => (
              <div key={i} className="flex items-start gap-[8px]" style={{ color: '#6f675d', fontSize: 13, lineHeight: 1.45 }}>
                <Check className="w-[14px] h-[14px] mt-[3px] flex-shrink-0" style={{ color: '#e6a51d' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: '#f8f5ef',
            border: '1px solid #f1ebe3',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 11, color: '#171412' }}>
            Especializações
          </h3>
          <div style={{ display: 'grid', gap: 9 }}>
            {['IRPF com investimentos', 'Simples Nacional avançado', 'Regularização de CNPJ e MEI'].map((item, i) => (
              <div key={i} className="flex items-start gap-[8px]" style={{ color: '#6f675d', fontSize: 13, lineHeight: 1.45 }}>
                <Check className="w-[14px] h-[14px] mt-[3px] flex-shrink-0" style={{ color: '#e6a51d' }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
