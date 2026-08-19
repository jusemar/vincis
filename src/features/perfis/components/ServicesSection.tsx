'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { professionalData } from '../constants/perfil';
import { contratarServico } from '@/features/servicos/actions/contratar';
import type { ServicoVitrine } from '@/features/servicos/queries/vitrine-publica';

type ServicesSectionProps = {
  /** Catálogo real do prestador. Sem prestador na URL, mantém a vitrine demo. */
  servicos?: ServicoVitrine[];
};

export default function ServicesSection({ servicos }: ServicesSectionProps = {}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [contratando, iniciarTransicao] = useTransition();

  // Mesmo formato de dado do mock anterior: o JSX abaixo não muda.
  const lista = servicos ?? professionalData.services;

  function contratar(servicoId: string | undefined) {
    if (!servicoId) return;
    iniciarTransicao(async () => {
      const resultado = await contratarServico({ servicoId });
      if (!resultado.sucesso) {
        // Visitante sem sessão volta para o fluxo de login já existente,
        // guardando a intenção para retomar o serviço certo depois.
        if (resultado.precisaEntrar) {
          const destino = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/?entrar=1&retorno=${encodeURIComponent(
            `${destino}#servico-${servicoId}`,
          )}`;
          return;
        }
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      style={{ maxWidth: 720 }}
    >
      <div
        className="uppercase text-[11px] font-[950] mb-[7px]"
        style={{ color: '#e6a51d', letterSpacing: '.13em' }}
      >
        Serviços
      </div>
      <h2
        className="font-bold mb-[14px]"
        style={{ fontSize: 23, letterSpacing: '-.035em', color: '#171412' }}
      >
        Serviços disponíveis
      </h2>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e8dfd4',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
        }}
      >
        {lista.map((service, i) => (
          <div key={i} style={{ borderBottom: i < lista.length - 1 ? '1px solid #f1ebe3' : 'none' }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left cursor-pointer"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 30px',
                gap: 14,
                alignItems: 'center',
                padding: 18,
                background: openIndex === i ? '#f8f5ef' : 'white',
                border: 0,
                fontFamily: 'inherit',
              }}
            >
              <div className="min-w-0 text-left">
                <h3 style={{ fontSize: 16, letterSpacing: '-.02em', marginBottom: 5, fontWeight: 700, color: '#171412' }}>
                  {service.title}
                </h3>
                <p style={{ color: '#6f675d', fontSize: 13, lineHeight: 1.45 }}>
                  {service.description}
                </p>
              </div>
              <div className="whitespace-nowrap text-[14px] font-[950]" style={{ color: '#e6a51d' }}>
                {service.price}
              </div>
              <div
                style={{
                  width: 30,
                  height: 30,
                  border: '1px solid #e8dfd4',
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
              fontWeight: 950,
              transition: '.18s ease',
              transform: openIndex === i ? 'rotate(45deg)' : 'rotate(0deg)',
              background: openIndex === i ? '#fff8e8' : 'transparent',
              borderColor: openIndex === i ? '#e6a51d' : '#e8dfd4',
              color: openIndex === i ? '#e6a51d' : '#958b7f',
                }}
              >
                +
              </div>
            </button>

            <AnimatePresence>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div style={{ padding: '0 18px 18px', display: 'grid', gap: 14 }}>
                    <div className="flex flex-wrap gap-[8px]">
                      {service.chips.map((chip, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-[5px] px-[10px] py-[7px] rounded-full text-[12px] font-[850]"
                          style={{
                            background: '#f8f5ef',
                            border: '1px solid #f1ebe3',
                            color: '#5b554d',
                          }}
                        >
                          <CheckCircle className="w-[12px] h-[12px]" style={{ color: '#e6a51d' }} />
                          {chip}
                        </span>
                      ))}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 170px',
                        gap: 12,
                        alignItems: 'center',
                        background: '#f8f5ef',
                        border: '1px solid #f1ebe3',
                        borderRadius: 15,
                        padding: 12,
                      }}
                    >
                      <p style={{ color: '#6f675d', fontSize: 12, lineHeight: 1.45, fontWeight: 650 }}>
                        {service.priceNote}
                      </p>
                      <button
                        type="button"
                        disabled={contratando}
                        onClick={() =>
                          contratar((service as ServicoVitrine).id)
                        }
                        style={{
                          width: '100%',
                          borderRadius: 13,
                          padding: '13px 14px',
                          fontSize: 14,
                          fontWeight: 950,
                          cursor: 'pointer',
                          transition: '.22s ease',
                          fontFamily: 'inherit',
                          border: service.isOrcamento ? '1px solid #e8dfd4' : '0',
                          background: service.isOrcamento ? 'white' : 'linear-gradient(135deg, #e6a51d, #f6c85f)',
                          color: service.isOrcamento ? '#171412' : '#211a0a',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 10px 26px rgba(32, 28, 22, .065)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {service.cta}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
