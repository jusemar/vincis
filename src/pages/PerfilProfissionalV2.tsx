import { useState } from 'react';
import {
  BadgeCheck, Headphones, Medal, GraduationCap, Award,
  CheckCircle2, Lock, Users, Send, PlusCircle, Heart, Share2,
  ChevronLeft, ChevronRight, Zap, ShieldCheck, Shield, FileText,
  Mail, Phone, Link as LinkIcon, Paperclip,
} from 'lucide-react';
import Footer from '../sections/Footer';
import { cn } from '@/lib/utils';

const availabilityData = {
  month: 'Outubro',
  year: 2026,
  days: [
    { day: 1, status: 'available' },
    { day: 2, status: 'unavailable' },
    { day: 3, status: 'available' },
    { day: 4, status: 'available' },
    { day: 5, status: 'available' },
    { day: 6, status: 'unavailable' },
    { day: 7, status: 'available' },
    { day: 8, status: 'available' },
    { day: 9, status: 'available' },
    { day: 10, status: 'available' },
    { day: 11, status: 'available' },
    { day: 12, status: 'available' },
    { day: 13, status: 'selected' },
    { day: 14, status: 'available' },
    { day: 15, status: 'available' },
    { day: 16, status: 'available' },
  ],
  weekDays: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  leadingBlanks: 5,
};

const timeSlots = [
  { time: '09:00', available: true },
  { time: '10:00', available: true },
  { time: '14:30', available: true, selected: true },
  { time: '16:00', available: true },
];

export default function PerfilProfissionalV2() {
  const [responseType, setResponseType] = useState<'private' | 'public'>('private');

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-8 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Spacer */}
        <div className="md:col-span-12" />

        {/* Main Content (8 cols) */}
        <div className="md:col-span-8 space-y-6">
          {/* Professional Intro Header */}
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col md:flex-row gap-6 items-start">
            <div className="w-full">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="bg-muted/50 px-3 py-1 rounded-full text-muted-foreground text-xs font-bold flex items-center gap-1">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                  Perfil verificado
                </span>
                <span className="bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Disponível
                </span>
                <span className="bg-muted/30 px-3 py-1 rounded-full text-muted-foreground text-xs font-bold flex items-center gap-1">
                  <Headphones className="h-3.5 w-3.5" />
                  Atendimento online
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] text-foreground mb-3">
                Carlos Eduardo Mendes
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
                Contador especialista em IRPF, MEI e regularização fiscal para autônomos, pequenos negócios e empresas no Simples Nacional.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                <div className="bg-primary/15 p-4 rounded-xl flex flex-col justify-center items-center text-center">
                  <span className="text-xs font-bold text-primary uppercase">PREMIUM</span>
                  <Medal className="h-5 w-5 text-primary mt-1" />
                </div>
                <div className="bg-card border border-border p-4 rounded-xl text-center shadow-sm">
                  <span className="block text-2xl font-bold tracking-tight text-foreground">4.9</span>
                  <span className="block text-xs font-bold text-muted-foreground uppercase">128 avaliações</span>
                </div>
                <div className="bg-card border border-border p-4 rounded-xl text-center shadow-sm">
                  <span className="block text-2xl font-bold tracking-tight text-foreground">12 anos</span>
                  <span className="block text-xs font-bold text-muted-foreground uppercase">Experiência</span>
                </div>
                <div className="bg-card border border-border p-4 rounded-xl text-center shadow-sm">
                  <span className="block text-2xl font-bold tracking-tight text-foreground">430+</span>
                  <span className="block text-xs font-bold text-muted-foreground uppercase">Declarações</span>
                </div>
              </div>
            </div>
          </section>

          {/* About Section */}
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-widest">
              Sobre o Contador
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">
              Especialista em rotinas fiscais e regularização
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed mb-6">
              Carlos atua com contabilidade consultiva para pessoas físicas, MEIs e pequenas empresas. O foco é simplificar decisões fiscais, evitar pendências e organizar documentos com clareza.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-muted/30 p-4 rounded-xl">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
                  <GraduationCap className="h-5 w-5 text-primary" /> Formação
                </h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  {[
                    'Ciências Contábeis — UFMG',
                    'Pós-graduação em Gestão Tributária',
                    'Registro profissional ativo',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-muted/30 p-4 rounded-xl">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
                  <Award className="h-5 w-5 text-primary" /> Especializações
                </h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  {[
                    'IRPF com investimentos',
                    'Simples Nacional avançado',
                    'Regularização de CNPJ e MEI',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Consult Section */}
          <section className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-[0.3em]">
                Consultar Especialistas
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Tire uma dúvida ou peça um orçamento
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Escolha falar direto com Carlos ou abrir para a categoria e receber múltiplas respostas em horas.
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <textarea
                  className="w-full h-32 p-4 bg-muted/30 border-0 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  placeholder="Ex: Como tributar o recebimento de stock options de uma matriz nos EUA?"
                />
                <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                  <Paperclip className="h-4 w-4" />
                  <button className="hover:underline text-xs">Anexar contexto (PDF, XML, balanço)</button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase">Quem deve responder</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <label
                    className={cn(
                      'relative flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border-2',
                      responseType === 'private'
                        ? 'bg-primary/5 border-primary'
                        : 'bg-card border-border',
                    )}
                    onClick={() => setResponseType('private')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center">
                        <Lock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-sm">Privado para Carlos</p>
                        <p className="text-xs text-muted-foreground">
                          Apenas este especialista responde. <span className="text-primary">Resposta média: 4h</span>
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        responseType === 'private' ? 'border-primary' : 'border-muted-foreground/30',
                      )}
                    >
                      {responseType === 'private' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                  </label>

                  <label
                    className={cn(
                      'relative flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border-2',
                      responseType === 'public'
                        ? 'bg-primary/5 border-primary'
                        : 'bg-card border-border',
                    )}
                    onClick={() => setResponseType('public')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted/50 rounded-full flex items-center justify-center">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-sm">Público para a categoria</p>
                        <p className="text-xs text-muted-foreground">
                          Vários contadores podem responder. Compare até 5 propostas.
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        responseType === 'public' ? 'border-primary' : 'border-muted-foreground/30',
                      )}
                    >
                      {responseType === 'public' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-4 w-4" />
                  Sigilo profissional garantido
                </p>
                <button className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all shadow-sm hover:bg-primary/90">
                  <Send className="h-4 w-4" />
                  Enviar
                </button>
              </div>
            </div>
          </section>

          {/* Services List */}
          <section>
            <span className="block text-xs font-bold text-primary mb-4 uppercase tracking-widest">
              Serviços
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">Serviços disponíveis</h2>
            <div className="space-y-4">
              {[
                { name: 'Declaração de IRPF', desc: 'Para pessoa física com rendimentos simples ou moderados.', price: 'R$ 100' },
                { name: 'Abertura de MEI', desc: 'Cadastro, orientação inicial e regularização básica.', price: 'R$ 50' },
                { name: 'Regularização de CNPJ', desc: 'Análise de pendências fiscais e obrigações atrasadas.', price: 'Sob orçamento' },
                { name: 'Consultoria tributária por hora', desc: 'Conversa estratégica para decisões fiscais e planejamento.', price: 'R$ 180,00/h' },
              ].map((service) => (
                <div
                  key={service.name}
                  className="bg-card border border-border rounded-xl p-6 flex justify-between items-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                >
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-foreground">{service.name}</h4>
                    <p className="text-muted-foreground text-sm">{service.desc}</p>
                  </div>
                  <div className="text-right flex items-center gap-4 shrink-0">
                    <div>
                      {service.price.startsWith('R$') && (
                        <span className="block text-primary text-xs font-bold uppercase">A partir de</span>
                      )}
                      <span className="text-lg font-semibold text-primary">{service.price}</span>
                    </div>
                    <PlusCircle className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sticky Sidebar (4 cols) */}
        <aside className="md:col-span-4">
          <div className="sticky top-24 space-y-6">
            {/* Main Widget */}
            <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm">
              <div className="relative h-48">
                <img
                  alt="Carlos Eduardo Mendes"
                  className="w-full h-full object-cover"
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop"
                />
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className="bg-white/90 dark:bg-card/90 p-2 rounded-full shadow-sm hover:bg-white dark:hover:bg-card transition-colors">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button className="bg-white/90 dark:bg-card/90 p-2 rounded-full shadow-sm hover:bg-white dark:hover:bg-card transition-colors">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-foreground">R$ 180</span>
                  <span className="text-muted-foreground text-sm">/ hora</span>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h5 className="text-lg font-semibold text-foreground">Disponibilidade do mês</h5>
                    <div className="flex gap-2">
                      <button className="text-muted-foreground/50 hover:text-foreground transition-colors">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button className="text-foreground">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-4">
                    {availabilityData.weekDays.map((d) => (
                      <span key={d} className="opacity-50 text-muted-foreground">{d}</span>
                    ))}
                    {Array.from({ length: availabilityData.leadingBlanks }).map((_, i) => (
                      <span key={`blank-${i}`} />
                    ))}
                    {availabilityData.days.map((day) => (
                      <span
                        key={day.day}
                        className={cn(
                          'py-2 rounded-lg text-xs font-bold',
                          day.status === 'available' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                          day.status === 'unavailable' && 'bg-red-500/10 text-red-500',
                          day.status === 'selected' && 'bg-primary text-primary-foreground',
                        )}
                      >
                        {day.day}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase text-muted-foreground/70">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" /> Disponível
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary" /> Selecionado
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-400" /> Indisponível
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg mb-6">
                  <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Responde em até 2h úteis</span>
                </div>

                <div className="mb-6">
                  <h6 className="text-xs font-bold text-muted-foreground uppercase mb-3">
                    Horários disponíveis para 13 de Outubro
                  </h6>
                  <div className="grid grid-cols-2 gap-2">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.time}
                        className={cn(
                          'px-3 py-2 rounded-lg text-sm font-bold transition-colors',
                          slot.selected
                            ? 'border-2 border-primary bg-primary/5 text-primary shadow-sm'
                            : 'border border-border text-foreground hover:border-primary hover:text-primary',
                        )}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold mb-4 active:scale-95 transition-all shadow-sm hover:bg-primary/90">
                  Agendar consultoria
                </button>

                <div className="space-y-4">
                  <p className="text-xs font-bold text-muted-foreground">Tem um cupom?</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-muted/30 border border-border rounded-lg text-sm font-bold text-center text-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none px-3 py-2"
                      type="text"
                      defaultValue="VINCIS10"
                    />
                    <button className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors">
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Info Cards */}
            <div className="space-y-4">
              {/* Specialties */}
              <div className="bg-card p-4 rounded-2xl border border-border">
                <h6 className="text-xs font-bold mb-4 uppercase text-muted-foreground/60">Especialidades</h6>
                <div className="flex flex-wrap gap-2">
                  {['IRPF', 'MEI', 'Simples Nacional', 'Regularização'].map((tag) => (
                    <span
                      key={tag}
                      className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Security */}
              <div className="bg-card p-4 rounded-2xl border border-border">
                <h6 className="text-xs font-bold mb-4 uppercase text-muted-foreground/60">Segurança</h6>
                <ul className="space-y-3">
                  {[
                    { icon: ShieldCheck, text: 'Dados protegidos' },
                    { icon: Shield, text: 'Conformidade LGPD' },
                    { icon: FileText, text: 'Contrato e sigilo' },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <item.icon className="h-5 w-5 text-primary" />
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}
