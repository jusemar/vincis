import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { professionalData } from '../constants/perfil';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number>(0);

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
        FAQ personalizado
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Perguntas frequentes
      </h2>

      <div style={{ display: 'grid', gap: 10 }}>
        {professionalData.faqs.map((faq, i) => (
          <div
            key={i}
            style={{
              border: '1px solid #e8dfd4',
              borderRadius: 15,
              background: 'white',
              padding: 16,
            }}
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
              className="w-full text-left cursor-pointer flex items-center justify-between gap-4"
              style={{
                border: 0,
                background: 'none',
                fontFamily: 'inherit',
                fontWeight: 950,
                fontSize: 14,
                color: '#171412',
                padding: 0,
              }}
            >
              <span>{faq.question}</span>
              <span style={{ color: '#e6a51d', fontSize: 20, lineHeight: 1 }}>
                {openIndex === i ? '–' : '+'}
              </span>
            </button>
            <AnimatePresence>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <p style={{ color: '#6f675d', lineHeight: 1.65, fontSize: 13, marginTop: 12 }}>
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
