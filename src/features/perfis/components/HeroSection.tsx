import { motion } from 'framer-motion';
import { professionalData } from '../constants/perfil';

export default function HeroSection() {
  const d = professionalData;

  return (
    <section
      className="relative overflow-visible border-b"
      style={{ borderColor: '#f1ebe3', height: 272 }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(135deg, rgba(255,248,232,.96), rgba(237,247,255,.94) 48%, rgba(244,239,255,.96)),
            radial-gradient(circle at 20% 10%, rgba(230,165,29,.24), transparent 28%)
          `,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 70% 10%, rgba(109,93,252,.12), transparent 24%),
            radial-gradient(circle at 18% 90%, rgba(230,165,29,.16), transparent 26%)
          `,
        }}
      />

      <div
        className="relative z-10 mx-auto"
        style={{ maxWidth: 1180, width: 'calc(100% - 32px)' }}
      >
        <div
          className="grid gap-[18px] items-start pt-[28px]"
          style={{ gridTemplateColumns: 'minmax(0, 720px) 360px' }}
        >
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[12px] font-bold mb-[15px]"
              style={{ color: '#6f675d', fontWeight: 700 }}
            >
              Contabilidade › Imposto de Renda › Simples Nacional
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="font-bold mb-[10px]"
              style={{
                fontSize: 'clamp(32px, 4vw, 48px)',
                letterSpacing: '-.055em',
                lineHeight: 1.04,
                color: '#171412',
              }}
            >
              {d.name}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{
                maxWidth: 700,
                color: '#4e473f',
                lineHeight: 1.52,
                fontSize: 17,
                marginBottom: 14,
              }}
            >
              {d.subtitle}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-wrap gap-[8px] mb-[14px]"
            >
              {[
                { icon: '✓', label: 'Perfil verificado' },
                { label: 'Disponível', dot: true },
                { label: 'Atendimento online', icon: '✦' },
              ].map((badge, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-[7px] px-[10px] py-[7px] rounded-full text-[12px]"
                  style={{
                    border: '1px solid rgba(255,255,255,.75)',
                    background: 'rgba(255,255,255,.54)',
                    backdropFilter: 'blur(12px)',
                    color: '#4d463d',
                    fontWeight: 850,
                    boxShadow: '0 6px 18px rgba(32,28,22,.04)',
                  }}
                >
                  {badge.icon && (
                    <span style={{ color: '#e6a51d', fontSize: 13 }}>{badge.icon}</span>
                  )}
                  {badge.dot && (
                    <span
                      className="rounded-full"
                      style={{
                        width: 7,
                        height: 7,
                        background: '#16a34a',
                        boxShadow: '0 0 0 4px rgba(22,163,74,.14)',
                      }}
                    />
                  )}
                  {badge.label}
                </div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: '120px 1fr 120px 1fr 120px',
                alignItems: 'stretch',
                background: 'rgba(255,255,255,.90)',
                border: '1px solid #e8dfd4',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
                maxWidth: '100%',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #e6a51d, #f6c85f)',
                  color: '#211a0a',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 950,
                  fontSize: 14,
                  padding: 12,
                }}
              >
                Premium
              </div>
              {[
                { value: d.rating.toFixed(1), label: `${d.reviewCount} avaliações` },
                { value: d.experience, label: 'experiência' },
                { value: d.declarations, label: 'declarações' },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 16px',
                    borderLeft: '1px solid #e8dfd4',
                    display: 'grid',
                    alignContent: 'center',
                    minHeight: 72,
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 950,
                      letterSpacing: '-.04em',
                      marginBottom: 3,
                      color: '#171412',
                    }}
                  >
                    {item.value}
                  </div>
                  <div style={{ color: '#6f675d', fontSize: 12, fontWeight: 750 }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          <div />
        </div>
      </div>
    </section>
  );
}
