import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ChevronLeft, 
  Calendar, 
  Clock, 
  User, 
  Mail, 
  Phone, 
  MessageCircle,
  Video,
  Check,
  Tag,
  CreditCard,
  Shield,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import type { Professional } from '../types/profissionais';

interface BookingModalProps {
  professional: Professional;
  isOpen: boolean;
  onClose: () => void;
}

type ChannelType = 'chat' | 'video' | 'phone' | 'email';
type DurationType = 1 | 2 | 3;

interface BookingData {
  date: string | null;
  time: string | null;
  duration: DurationType;
  channel: ChannelType;
  name: string;
  email: string;
  phone: string;
  notes: string;
  coupon: string;
}

const channelConfig: Record<ChannelType, { label: string; icon: any; discount: number; description: string }> = {
  chat: { 
    label: 'Chat', 
    icon: MessageCircle, 
    discount: 0,
    description: 'Atendimento por chat em tempo real'
  },
  video: { 
    label: 'Vídeo Chamada', 
    icon: Video, 
    discount: 0,
    description: 'Videochamada com áudio e vídeo'
  },
  phone: { 
    label: 'Ligação', 
    icon: Phone, 
    discount: 0,
    description: 'Atendimento por telefone'
  },
  email: { 
    label: 'E-mail', 
    icon: Mail, 
    discount: 10,
    description: 'Atendimento assíncrono por e-mail (10% OFF)'
  },
};

const durationConfig: Record<DurationType, { label: string; discount: number }> = {
  1: { label: '1 hora', discount: 0 },
  2: { label: '2 horas', discount: 15 },
  3: { label: '3 horas', discount: 25 },
};

// Mock available dates (next 30 days)
const generateAvailableDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    // Skip weekends
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      dates.push({
        date: date.toISOString().split('T')[0],
        day: date.getDate(),
        month: date.toLocaleString('pt-BR', { month: 'short' }),
        weekday: date.toLocaleString('pt-BR', { weekday: 'short' }),
      });
    }
  }
  return dates.slice(0, 20); // Limit to 20 available dates
};

// Mock time slots
const generateTimeSlots = (_date: string): { time: string; available: boolean }[] => {
  const slots: { time: string; available: boolean }[] = [];
  const baseHours = [9, 10, 11, 14, 15, 16, 17];
  baseHours.forEach(hour => {
    slots.push({ time: `${hour}:00`, available: Math.random() > 0.3 });
    if (hour !== 17) slots.push({ time: `${hour}:30`, available: Math.random() > 0.3 });
  });
  return slots;
};

// Mock valid coupons
const validCoupons: Record<string, number> = {
  'VINCIS10': 10,
  'PRIMEIRA20': 20,
  'INDICOU15': 15,
  'MEI25': 25,
};

export default function BookingModal({ professional, isOpen, onClose }: BookingModalProps) {
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState<BookingData>({
    date: null,
    time: null,
    duration: 1,
    channel: 'video',
    name: '',
    email: '',
    phone: '',
    notes: '',
    coupon: '',
  });
  const [couponApplied, setCouponApplied] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const availableDates = useMemo(() => generateAvailableDates(), []);
  const timeSlots = useMemo(() => 
    bookingData.date ? generateTimeSlots(bookingData.date) : [], 
    [bookingData.date]
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const calculatePrice = () => {
    let basePrice = professional.hourlyRate * bookingData.duration;
    
    // Duration discount
    const durationDiscount = durationConfig[bookingData.duration].discount;
    basePrice = basePrice * (1 - durationDiscount / 100);
    
    // Channel discount
    const channelDiscount = channelConfig[bookingData.channel].discount;
    basePrice = basePrice * (1 - channelDiscount / 100);
    
    // Coupon discount
    if (couponApplied) {
      basePrice = basePrice * (1 - couponApplied.discount / 100);
    }
    
    return basePrice;
  };

  const originalPrice = professional.hourlyRate * bookingData.duration;
  const finalPrice = calculatePrice();

  const applyCoupon = () => {
    const code = bookingData.coupon.toUpperCase().trim();
    if (validCoupons[code]) {
      setCouponApplied({ code, discount: validCoupons[code] });
      setCouponError('');
    } else {
      setCouponApplied(null);
      setCouponError('Cupom inválido ou expirado');
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return bookingData.date && bookingData.time;
      case 2:
        return bookingData.name && bookingData.email && bookingData.phone;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      setIsConfirmed(true);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setBookingData({
      date: null,
      time: null,
      duration: 1,
      channel: 'video',
      name: '',
      email: '',
      phone: '',
      notes: '',
      coupon: '',
    });
    setCouponApplied(null);
    setCouponError('');
    setIsConfirmed(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/90 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden glass-card rounded-2xl border border-border shadow-elevated"
          >
            {isConfirmed ? (
              // Success Screen
              <div className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-12 h-12 text-green-400" />
                </motion.div>
                <h2 className="text-3xl font-bold text-foreground mb-4">Agendamento Confirmado!</h2>
                <p className="text-muted-foreground mb-6">
                  Seu agendamento com <strong>{professional.name}</strong> foi confirmado.<br />
                  Enviamos os detalhes para <strong>{bookingData.email}</strong>
                </p>
                <div className="glass-card rounded-2xl p-6 mb-6 text-left max-w-md mx-auto">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data:</span>
                      <span className="font-medium">{new Date(bookingData.date!).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Horário:</span>
                      <span className="font-medium">{bookingData.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duração:</span>
                      <span className="font-medium">{durationConfig[bookingData.duration].label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Canal:</span>
                      <span className="font-medium">{channelConfig[bookingData.channel].label}</span>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-between">
                      <span className="font-semibold">Total pago:</span>
                      <span className="font-bold text-gradient-gold">{formatCurrency(finalPrice)}</span>
                    </div>
                  </div>
                </div>
                <motion.button
                  onClick={resetAndClose}
                  className="px-8 py-3 bg-gradient-gold text-primary-foreground font-semibold rounded-xl"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Fechar
                </motion.button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div className="flex items-center gap-4">
                    <img 
                      src={professional.photo} 
                      alt={professional.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="font-semibold text-foreground">{professional.name}</h3>
                      <p className="text-sm text-muted-foreground">{professional.specialty}</p>
                    </div>
                  </div>
                  <button 
                    onClick={onClose}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-2 p-4 border-b border-border">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {step > s ? <Check className="w-4 h-4" /> : s}
                      </div>
                      {s < 3 && (
                        <div className={`w-12 h-0.5 transition-colors ${
                          step > s ? 'bg-primary' : 'bg-muted'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                  <AnimatePresence mode="wait">
                    {/* Step 1: Date & Time Selection */}
                    {step === 1 && (
                      <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            Selecione a data
                          </h4>
                          <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                            {availableDates.map((date) => (
                              <button
                                key={date.date}
                                onClick={() => setBookingData({ ...bookingData, date: date.date, time: null })}
                                className={`p-3 rounded-xl text-center transition-all ${
                                  bookingData.date === date.date
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80 text-foreground'
                                }`}
                              >
                                <div className="text-xs uppercase">{date.weekday}</div>
                                <div className="text-lg font-bold">{date.day}</div>
                                <div className="text-xs">{date.month}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {bookingData.date && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                              <Clock className="w-5 h-5 text-primary" />
                              Selecione o horário
                            </h4>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                              {timeSlots.map((slot) => (
                                <button
                                  key={slot.time}
                                  disabled={!slot.available}
                                  onClick={() => setBookingData({ ...bookingData, time: slot.time })}
                                  className={`p-3 rounded-xl text-center transition-all ${
                                    bookingData.time === slot.time
                                      ? 'bg-primary text-primary-foreground'
                                      : slot.available
                                        ? 'bg-muted hover:bg-muted/80 text-foreground'
                                        : 'bg-muted/50 text-muted-foreground cursor-not-allowed line-through'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}

                        {/* Duration Selection */}
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            Duração da consulta
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {(Object.keys(durationConfig) as unknown as DurationType[]).map((duration) => (
                              <button
                                key={duration}
                                onClick={() => setBookingData({ ...bookingData, duration })}
                                className={`p-4 rounded-xl border-2 transition-all ${
                                  bookingData.duration === duration
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                }`}
                              >
                                <div className="font-semibold text-foreground">{durationConfig[duration].label}</div>
                                {durationConfig[duration].discount > 0 && (
                                  <div className="text-sm text-green-400">
                                    -{durationConfig[duration].discount}%
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Channel Selection */}
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-primary" />
                            Canal de atendimento
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            {(Object.keys(channelConfig) as ChannelType[]).map((channel) => {
                              const ChannelIcon = channelConfig[channel].icon;
                              return (
                                <button
                                  key={channel}
                                  onClick={() => setBookingData({ ...bookingData, channel })}
                                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                                    bookingData.channel === channel
                                      ? 'border-primary bg-primary/10'
                                      : 'border-border hover:border-primary/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 mb-2">
                                    <ChannelIcon className="w-5 h-5 text-primary" />
                                    <span className="font-semibold text-foreground">{channelConfig[channel].label}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{channelConfig[channel].description}</p>
                                  {channelConfig[channel].discount > 0 && (
                                    <div className="mt-2 text-sm text-green-400 font-medium">
                                      -{channelConfig[channel].discount}% OFF
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Personal Data & Coupon */}
                    {step === 2 && (
                      <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <User className="w-5 h-5 text-primary" />
                            Seus dados
                          </h4>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-muted-foreground mb-2">
                                Nome completo *
                              </label>
                              <input
                                type="text"
                                value={bookingData.name}
                                onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="Digite seu nome"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-muted-foreground mb-2">
                                E-mail *
                              </label>
                              <input
                                type="email"
                                value={bookingData.email}
                                onChange={(e) => setBookingData({ ...bookingData, email: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="seu@email.com"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-muted-foreground mb-2">
                                Telefone *
                              </label>
                              <input
                                type="tel"
                                value={bookingData.phone}
                                onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="(11) 99999-9999"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-muted-foreground mb-2">
                                Observações (opcional)
                              </label>
                              <textarea
                                value={bookingData.notes}
                                onChange={(e) => setBookingData({ ...bookingData, notes: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                rows={3}
                                placeholder="Descreva brevemente o motivo da consulta..."
                              />
                            </div>
                          </div>
                        </div>

                        {/* Coupon */}
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-primary" />
                            Cupom de desconto
                          </h4>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={bookingData.coupon}
                              onChange={(e) => setBookingData({ ...bookingData, coupon: e.target.value })}
                              className="flex-1 px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 uppercase"
                              placeholder="Digite o cupom"
                            />
                            <button
                              onClick={applyCoupon}
                              className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                            >
                              Aplicar
                            </button>
                          </div>
                          {couponApplied && (
                            <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                              <Check className="w-4 h-4" />
                              Cupom <strong>{couponApplied.code}</strong> aplicado! -{couponApplied.discount}%
                            </div>
                          )}
                          {couponError && (
                            <div className="mt-2 text-red-400 text-sm">
                              {couponError}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Step 3: Confirmation */}
                    {step === 3 && (
                      <motion.div
                        key="step3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div>
                          <h4 className="text-lg font-semibold text-foreground mb-4">
                            Confirme seu agendamento
                          </h4>
                          
                          {/* Summary Card */}
                          <div className="glass-card rounded-2xl p-6 space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-border">
                              <img 
                                src={professional.photo} 
                                alt={professional.name}
                                className="w-16 h-16 rounded-full object-cover"
                              />
                              <div>
                                <h5 className="font-semibold text-foreground">{professional.name}</h5>
                                <p className="text-sm text-muted-foreground">{professional.specialty}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Data:</span>
                                <p className="font-medium text-foreground">
                                  {new Date(bookingData.date!).toLocaleDateString('pt-BR', { 
                                    weekday: 'long', 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Horário:</span>
                                <p className="font-medium text-foreground">{bookingData.time}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Duração:</span>
                                <p className="font-medium text-foreground">{durationConfig[bookingData.duration].label}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Canal:</span>
                                <p className="font-medium text-foreground">{channelConfig[bookingData.channel].label}</p>
                              </div>
                            </div>

                            <div className="pt-4 border-t border-border">
                              <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-primary" />
                                <div>
                                  <p className="font-medium text-foreground">{bookingData.name}</p>
                                  <p className="text-sm text-muted-foreground">{bookingData.email}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Price Breakdown */}
                          <div className="mt-6 glass-card rounded-2xl p-6">
                            <h5 className="font-semibold text-foreground mb-4">Resumo do pagamento</h5>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Valor base ({bookingData.duration}h × {formatCurrency(professional.hourlyRate)})</span>
                                <span className="text-foreground">{formatCurrency(originalPrice)}</span>
                              </div>
                              {durationConfig[bookingData.duration].discount > 0 && (
                                <div className="flex justify-between text-green-400">
                                  <span>Desconto por duração (-{durationConfig[bookingData.duration].discount}%)</span>
                                  <span>-{formatCurrency(originalPrice * durationConfig[bookingData.duration].discount / 100)}</span>
                                </div>
                              )}
                              {channelConfig[bookingData.channel].discount > 0 && (
                                <div className="flex justify-between text-green-400">
                                  <span>Desconto {channelConfig[bookingData.channel].label} (-{channelConfig[bookingData.channel].discount}%)</span>
                                  <span>-{formatCurrency(originalPrice * (1 - durationConfig[bookingData.duration].discount / 100) * channelConfig[bookingData.channel].discount / 100)}</span>
                                </div>
                              )}
                              {couponApplied && (
                                <div className="flex justify-between text-green-400">
                                  <span>Cupom {couponApplied.code} (-{couponApplied.discount}%)</span>
                                  <span>-{formatCurrency((originalPrice - (originalPrice - finalPrice)) * couponApplied.discount / (100 - couponApplied.discount))}</span>
                                </div>
                              )}
                              <div className="pt-3 border-t border-border flex justify-between items-center">
                                <span className="font-semibold text-foreground">Total a pagar</span>
                                <span className="text-2xl font-bold text-gradient-gold">{formatCurrency(finalPrice)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Security Note */}
                          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <Shield className="w-4 h-4" />
                            <span>Pagamento seguro e criptografado</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between p-6 border-t border-border">
                  <button
                    onClick={handleBack}
                    disabled={step === 1}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${
                      step === 1 
                        ? 'text-muted-foreground cursor-not-allowed' 
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Voltar
                  </button>

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={`flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all ${
                      canProceed()
                        ? 'bg-gradient-gold text-primary-foreground shadow-glow hover:shadow-glow-lg'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    {step === 3 ? (
                      <>
                        <CreditCard className="w-5 h-5" />
                        Pagar {formatCurrency(finalPrice)}
                      </>
                    ) : (
                      <>
                        Continuar
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
