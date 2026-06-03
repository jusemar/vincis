import { motion } from 'framer-motion';
import { professionalData } from './types';

export default function TimelineSection() {
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
        Experiência
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Histórico profissional
      </h2>

      <div style={{ display: 'grid', gap: 11 }}>
        {professionalData.timeline.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-[110px_1fr] gap-[15px] p-[14px]"
            style={{
              background: '#f8f5ef',
              border: '1px solid #f1ebe3',
              borderRadius: 15,
            }}
          >
            <div className="text-[13px] font-[950]" style={{ color: '#e6a51d' }}>
              {item.year}
            </div>
            <div>
              <h3 className="text-[15px] font-bold mb-[4px]" style={{ color: '#171412' }}>
                {item.title}
              </h3>
              <p style={{ color: '#6f675d', lineHeight: 1.55, fontSize: 13 }}>
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
