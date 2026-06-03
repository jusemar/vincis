import { useState } from 'react';
import { Heart, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { professionalData } from '@/sections/perfil-colaborador/types';

const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const calendarDays = [
  { day: 26, muted: true }, { day: 27, muted: true }, { day: 28, muted: true },
  { day: 29, muted: true }, { day: 30, muted: true }, { day: 1, available: true },
  { day: 2, busy: true }, { day: 3 }, { day: 4, available: true },
  { day: 5, available: true }, { day: 6, busy: true }, { day: 7 },
  { day: 8, selected: true }, { day: 9 }, { day: 10 },
  { day: 11, available: true }, { day: 12 }, { day: 13, available: true },
  { day: 14, busy: true }, { day: 15, available: true }, { day: 16 },
  { day: 17 }, { day: 18, available: true }, { day: 19 }, { day: 20 },
  { day: 21, available: true }, { day: 22, busy: true }, { day: 23 },
  { day: 24 }, { day: 25, available: true }, { day: 26, available: true },
  { day: 27 }, { day: 28 }, { day: 29, available: true }, { day: 30 },
  { day: 31 }, { day: 1, muted: true }, { day: 2, muted: true },
  { day: 3, muted: true }, { day: 4, muted: true }, { day: 5, muted: true },
  { day: 6, muted: true },
];

export default function ProfileCard() {
  const d = professionalData;
  const [coupon, setCoupon] = useState('VINCIS10');

  return (
    <div
      style={{
        marginTop: -170,
        marginLeft: 6,
        position: 'sticky',
        top: 82,
        zIndex: 5,
        background: '#ffffff',
        border: '1px solid #e8dfd4',
        borderRadius: 22,
        boxShadow: '0 22px 55px rgba(32, 28, 22, .10)',
        overflow: 'hidden',
      }}
    >
      {/* Photo */}
      <div
        className="relative"
        style={{ height: 170, background: '#f8f5ef' }}
      >
        <img
          src="https://images.unsplash.com/photo-1556157382-97eda2d62296?w=900&h=560&fit=crop"
          alt={d.name}
          className="w-full h-full object-cover object-center"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.42))' }}
        />
        <div className="absolute flex gap-[8px]" style={{ top: 12, right: 12 }}>
          <button
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 36, height: 36, borderRadius: 999,
              border: '1px solid rgba(255,255,255,.55)',
              background: 'rgba(255,255,255,.88)',
              color: '#6f675d',
              transition: '.22s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(32,28,22,.065)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <Heart className="w-[16px] h-[16px]" />
          </button>
          <button
            className="flex items-center justify-center cursor-pointer"
            style={{
              width: 36, height: 36, borderRadius: 999,
              border: '1px solid rgba(255,255,255,.55)',
              background: 'rgba(255,255,255,.88)',
              color: '#6f675d',
              transition: '.22s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(32,28,22,.065)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <Share2 className="w-[16px] h-[16px]" />
          </button>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {/* Price */}
        <div className="flex items-start justify-between gap-[12px]" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: '-.045em', color: '#171412' }}>
            R$ {d.hourlyRate}<small style={{ color: '#6f675d', fontSize: 14, letterSpacing: 0, fontWeight: 800 }}>/ hora</small>
          </div>
        </div>

        {/* Calendar */}
        <div
          style={{
            border: '1px solid #f1ebe3',
            background: '#fffefa',
            borderRadius: 16,
            padding: 13,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 950,
              marginBottom: 10,
              color: '#171412',
            }}
          >
            Disponibilidade do mês
          </div>

          <div
            className="flex items-center justify-between gap-[10px]"
            style={{ color: '#51483f', fontSize: 12, fontWeight: 900, marginBottom: 10 }}
          >
            <span>Maio 2026</span>
            <div className="flex gap-[6px]">
              <button
                style={{
                  width: 26, height: 26, borderRadius: 999,
                  border: '1px solid #e8dfd4', background: 'white', color: '#6f675d', fontWeight: 900,
                  cursor: 'pointer', display: 'grid', placeItems: 'center', fontFamily: 'inherit',
                }}
              >
                <ChevronLeft className="w-[12px] h-[12px]" />
              </button>
              <button
                style={{
                  width: 26, height: 26, borderRadius: 999,
                  border: '1px solid #e8dfd4', background: 'white', color: '#6f675d', fontWeight: 900,
                  cursor: 'pointer', display: 'grid', placeItems: 'center', fontFamily: 'inherit',
                }}
              >
                <ChevronRight className="w-[12px] h-[12px]" />
              </button>
            </div>
          </div>

          <div
            className="grid grid-cols-7 gap-[5px]"
          >
            {weekdays.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-[900] pb-[3px]" style={{ color: '#958b7f' }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-[5px]">
            {calendarDays.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-center text-[11px] font-[850] rounded-[9px]"
                style={{
                  height: 30,
                  cursor: 'default',
                  ...(item.muted ? { color: '#c3bab0', background: 'transparent', border: '1px solid transparent' }
                    : item.selected ? { color: '#8a5c00', background: '#fff8e8', border: '1px solid rgba(230,165,29,.42)', boxShadow: '0 0 0 2px rgba(230,165,29,.10)' }
                    : item.available ? { color: '#166534', background: '#eaf8ef', border: '1px solid rgba(22,101,52,.15)' }
                    : item.busy ? { color: '#991b1b', background: '#fff1f1', border: '1px solid rgba(153,27,27,.12)' }
                    : { color: '#5d544a', background: 'transparent', border: '1px solid transparent' }
                  ),
                }}
              >
                {item.day}
              </div>
            ))}
          </div>

          <div className="flex gap-[10px] flex-wrap mt-[10px] text-[10px] font-[800]" style={{ color: '#6f675d' }}>
            <span className="inline-flex items-center gap-[5px]">
              <span style={{ width: 8, height: 8, borderRadius: 999, display: 'inline-block', background: '#86efac' }} />
              Disponível
            </span>
            <span className="inline-flex items-center gap-[5px]">
              <span style={{ width: 8, height: 8, borderRadius: 999, display: 'inline-block', background: '#f6c85f' }} />
              Selecionado
            </span>
            <span className="inline-flex items-center gap-[5px]">
              <span style={{ width: 8, height: 8, borderRadius: 999, display: 'inline-block', background: '#fecaca' }} />
              Indisponível
            </span>
          </div>

          <div
            className="flex items-center gap-[8px] mt-[12px] p-[8px_12px] rounded-[10px]"
            style={{
              background: 'linear-gradient(135deg, rgba(22,163,74,.08), rgba(22,163,74,.02))',
              border: '1px solid rgba(22,163,74,.15)',
              fontSize: 12,
              fontWeight: 800,
              color: '#166534',
            }}
          >
            <span
              style={{
                width: 8, height: 8, background: '#22c55e', borderRadius: '50%',
                boxShadow: '0 0 0 3px rgba(22,163,74,.15)',
              }}
            />
            Responde em até 2h úteis
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'grid', gap: 12, marginBottom: 15 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <button
              style={{
                width: '100%', border: 0, borderRadius: 13, padding: '13px 14px',
                fontSize: 14, fontWeight: 950, cursor: 'pointer', fontFamily: 'inherit',
                background: 'linear-gradient(135deg, #e6a51d, #f6c85f)',
                color: '#211a0a',
                transition: '.22s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(32,28,22,.065)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              Agendar consultoria
            </button>
            <p style={{ color: '#6f675d', fontSize: 12, lineHeight: 1.45 }}>
              Confirme um horário para conversar ao vivo por videochamada.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <button
              style={{
                width: '100%', border: 0, borderRadius: 13, padding: '13px 14px',
                fontSize: 14, fontWeight: 950, cursor: 'pointer', fontFamily: 'inherit',
                background: '#242225', color: '#fff',
                transition: '.22s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(32,28,22,.065)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              Consultar especialistas
            </button>
            <p style={{ color: '#6f675d', fontSize: 12, lineHeight: 1.45 }}>
              Envie uma dúvida privada para este contador ou pública para profissionais da categoria.
            </p>
          </div>
        </div>

        {/* Coupon */}
        <div style={{ borderTop: '1px solid #f1ebe3', paddingTop: 15 }}>
          <div style={{ fontSize: 13, fontWeight: 950, marginBottom: 8, color: '#171412' }}>
            Tem um cupom?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px', gap: 8 }}>
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              style={{
                height: 42, border: '1px solid #e8dfd4', background: '#f8f5ef',
                borderRadius: 11, padding: '0 12px', outline: 'none',
                color: '#171412', fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
              }}
              placeholder="Digite o cupom"
            />
            <button
              style={{
                border: 0, borderRadius: 11, background: '#6d5dfc', color: 'white',
                cursor: 'pointer', fontWeight: 950, fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              Aplicar
            </button>
          </div>
          <p style={{ marginTop: 8, color: '#6f675d', fontSize: 12, lineHeight: 1.4 }}>
            Use cupons em serviços elegíveis ou na primeira consultoria.
          </p>
        </div>

        {/* Specialties */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e8dfd4',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
            marginTop: 12,
          }}
        >
          <h3 style={{ fontSize: 16, letterSpacing: '-.02em', marginBottom: 12, color: '#171412' }}>
            Especialidades
          </h3>
          <div className="flex flex-wrap gap-[8px]">
            {d.specialties.map((s, i) => (
              <span
                key={i}
                className="px-[10px] py-[7px] rounded-full text-[12px] font-[850]"
                style={{
                  background: '#fff8e8',
                  color: '#8a5c00',
                  border: '1px solid #f4db9a',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Como funciona */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e8dfd4',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
            marginTop: 16,
          }}
        >
          <h3 style={{ fontSize: 16, letterSpacing: '-.02em', marginBottom: 12, color: '#171412' }}>
            Como funciona
          </h3>
          <p style={{ color: '#6f675d', fontSize: 13, lineHeight: 1.58 }}>
            Escolha um serviço fechado, solicite orçamento para casos variáveis ou agende uma consultoria para conversar ao vivo.
          </p>
        </div>

        {/* Segurança */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e8dfd4',
            borderRadius: 18,
            padding: 18,
            boxShadow: '0 10px 26px rgba(32, 28, 22, .065)',
            marginTop: 16,
          }}
        >
          <h3 style={{ fontSize: 16, letterSpacing: '-.02em', marginBottom: 12, color: '#171412' }}>
            Segurança
          </h3>
          <div style={{ display: 'grid', gap: 9 }}>
            {[
              '🔒 Dados protegidos',
              '🛡 Conformidade LGPD',
              '📄 Documentos com segurança',
              '💬 Atendimento pela plataforma',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-[8px]" style={{ color: '#6f675d', fontSize: 12, fontWeight: 800 }}>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
