import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { professionalData } from './types';

export default function ReviewsSection() {
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
        Avaliações
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Comentários de clientes
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        {professionalData.reviews.map((review, i) => (
          <div
            key={i}
            style={{
              background: 'white',
              border: '1px solid #e8dfd4',
              borderRadius: 16,
              padding: 17,
            }}
          >
            <div style={{ color: '#e6a51d', letterSpacing: '.04em', marginBottom: 9, fontSize: 14 }}>
              {Array.from({ length: 5 }).map((_, j) => (
                <Star
                  key={j}
                  className="inline w-[14px] h-[14px]"
                  style={{
                    fill: j < review.rating ? '#e6a51d' : 'none',
                    color: j < review.rating ? '#e6a51d' : '#e8dfd4',
                  }}
                />
              ))}
            </div>
            <p style={{ color: '#4d4740', lineHeight: 1.6, fontSize: 14, marginBottom: 12 }}>
              &ldquo;{review.text}&rdquo;
            </p>
            <strong style={{ fontSize: 13, color: '#171412' }}>— {review.name}</strong>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
