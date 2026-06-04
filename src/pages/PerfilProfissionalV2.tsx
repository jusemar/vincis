import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BadgeCheck, Headphones, GraduationCap, Award,
  CheckCircle2, Lock, Users, Send, Heart, Share2,
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
    { day: 17, status: 'available' },
    { day: 18, status: 'available' },
    { day: 19, status: 'unavailable' },
    { day: 20, status: 'available' },
    { day: 21, status: 'available' },
    { day: 22, status: 'available' },
    { day: 23, status: 'unavailable' },
    { day: 24, status: 'available' },
    { day: 25, status: 'available' },
    { day: 26, status: 'available' },
    { day: 27, status: 'available' },
    { day: 28, status: 'available' },
    { day: 29, status: 'available' },
    { day: 30, status: 'available' },
    { day: 31, status: 'available' },
  ],
  weekDays: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  leadingBlanks: 4,
};

const timeSlots = [
  { time: '09:00', available: true },
  { time: '10:00', available: true },
  { time: '14:30', available: true, selected: true },
  { time: '16:00', available: true },
];

const successCases = [
  { type: 'IRPF', title: 'Declaração com pendências anteriores', desc: 'Organização de documentos e envio correto após inconsistências.' },
  { type: 'MEI', title: 'Formalização de prestador', desc: 'Orientação fiscal inicial para emissão de nota e obrigações mensais.' },
  { type: 'CNPJ', title: 'Regularização de empresa inativa', desc: 'Diagnóstico de pendências e plano de regularização fiscal.' },
  { type: 'Simples', title: 'Correção de enquadramento fiscal', desc: 'Análise de regime e organização para reduzir riscos.' },
];

const experience = [
  { year: '12 anos', title: 'Atuação em contabilidade', desc: 'Experiência com pessoas físicas, MEIs, autônomos e pequenas empresas.' },
  { year: '430+', title: 'Declarações e regularizações', desc: 'Atendimento com IRPF, CNPJ, DAS, pendências e obrigações fiscais.' },
];

const faqItems = [
  { q: 'O valor da declaração de IRPF pode mudar?', a: 'Sim. O preço inicial vale para casos simples. Situações com investimentos, exterior, atividade rural ou muitos informes podem exigir orçamento.' },
  { q: 'O atendimento é totalmente online?', a: 'Sim. O atendimento pode acontecer por ticket, envio de documentos pela plataforma e videochamada em consultorias agendadas.' },
  { q: 'Posso tirar uma dúvida antes de contratar?', a: 'Use "Consultar especialistas" para enviar uma pergunta privada para este contador ou pública para profissionais da categoria.' },
];

const reviews = [
  { stars: 5, text: 'Organizou meu imposto de renda com clareza e explicou tudo sem complicar.', author: 'Mariana Costa' },
  { stars: 5, text: 'Atendimento rápido, direto e muito profissional. Resolveu minha regularização.', author: 'Rafael Oliveira' },
];

const services = [
  {
    name: 'Declaração de IRPF',
    desc: 'Para pessoa física com rendimentos simples ou moderados.',
    price: 'A partir de R$100',
    chips: ['Atendimento online', 'Até 2 fontes pagadoras', 'Organização dos documentos', 'Entrega da declaração'],
    note: 'Preço inicial para casos simples. Investimentos, exterior ou muitos informes podem exigir orçamento.',
    action: 'Contratar agora',
  },
  {
    name: 'Abertura de MEI',
    desc: 'Cadastro, orientação inicial e regularização básica.',
    price: 'A partir de R$50',
    chips: ['Emissão do CNPJ', 'Orientação de atividade', 'Primeiros passos fiscais'],
    note: 'Ideal para quem quer iniciar formalmente com orientação simples e rápida.',
    action: 'Contratar agora',
  },
  {
    name: 'Regularização de CNPJ',
    desc: 'Análise de pendências fiscais, cadastrais e obrigações atrasadas.',
    price: 'Sob orçamento',
    chips: ['Diagnóstico inicial', 'Consulta de pendências', 'Plano de regularização'],
    note: 'Como cada caso muda conforme pendências e órgãos envolvidos, o valor é definido após análise.',
    action: 'Solicitar orçamento',
    outline: true,
  },
  {
    name: 'Consultoria tributária por hora',
    desc: 'Conversa estratégica para decisões fiscais e planejamento.',
    price: 'R$180,00/h',
    chips: ['Videochamada', 'Análise do caso', 'Orientação prática'],
    note: 'Use quando sua dúvida precisa de conversa ao vivo, contexto e orientação personalizada.',
    action: 'Agendar consultoria',
  },
];

export default function PerfilProfissionalV2() {
  const [responseType, setResponseType] = useState<'private' | 'public'>('private');
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => setStatus('success'), 600);
    return () => clearTimeout(timer);
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-muted/10 animate-pulse">
          <div className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-8 space-y-4">
            <div className="h-3 w-40 bg-muted rounded" />
            <div className="h-10 w-3/4 bg-muted rounded" />
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="flex gap-2">
              <div className="h-8 w-28 bg-muted rounded-full" />
              <div className="h-8 w-24 bg-muted rounded-full" />
              <div className="h-8 w-36 bg-muted rounded-full" />
            </div>
            <div className="h-[72px] w-full bg-muted rounded-xl" />
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-4 md:px-6 pb-8 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-8 space-y-6">
            <div className="h-52 bg-muted rounded-xl animate-pulse" />
            <div className="h-72 bg-muted rounded-xl animate-pulse" />
            <div className="h-48 bg-muted rounded-xl animate-pulse" />
            <div className="h-48 bg-muted rounded-xl animate-pulse" />
            <div className="h-36 bg-muted rounded-xl animate-pulse" />
            <div className="h-52 bg-muted rounded-xl animate-pulse" />
            <div className="h-44 bg-muted rounded-xl animate-pulse" />
          </div>

          <aside className="md:col-span-4">
            <div className="sticky top-24 space-y-6 animate-pulse">
              <div className="h-96 bg-muted rounded-2xl" />
              <div className="h-28 bg-muted rounded-2xl" />
              <div className="h-32 bg-muted rounded-2xl" />
            </div>
          </aside>
        </main>
        <Footer />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Erro ao carregar perfil</h2>
          <p className="text-muted-foreground max-w-md">
            Não foi possível carregar os dados do profissional. Tente novamente.
          </p>
          <button
            onClick={() => {
              setStatus('loading');
              setTimeout(() => setStatus('success'), 600);
            }}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background glows & grid */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 60%)" }} />
        <div className="absolute -bottom-40 -right-32 h-[600px] w-[600px] rounded-full blur-3xl"
             style={{ background: "radial-gradient(circle, hsl(var(--amber-400) / 0.2), transparent 60%)" }} />
      </div>

      {/* Hero Section */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-8">
              {/* Breadcrumb */}
              <motion.nav
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 text-xs text-muted-foreground mb-4"
              >
                <Link to="/" className="hover:text-primary transition-colors">Início</Link>
                <ChevronRight className="h-3 w-3" />
                <Link to="/profissionais" className="hover:text-primary transition-colors">Profissionais</Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-semibold">Carlos Eduardo Mendes</span>
              </motion.nav>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="text-4xl sm:text-5xl font-bold tracking-tighter leading-[1.04] text-foreground mb-2.5"
              >
                Carlos Eduardo Mendes
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-base sm:text-[17px] text-muted-foreground/80 leading-relaxed max-w-[700px] mb-3.5"
              >
                Contador especialista em IRPF, MEI e regularização fiscal para autônomos, pequenos negócios e empresas no Simples Nacional.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="flex flex-wrap gap-2 mb-6"
              >
                <span className="inline-flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5 text-xs font-bold text-foreground/80">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                  Perfil verificado
                </span>
                <span className="inline-flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5 text-xs font-bold text-foreground/80">
                  <span className="w-[7px] h-[7px] rounded-full bg-green-500 shadow-[0_0_0_4px_rgba(22,163,74,0.14)]" />
                  Disponível
                </span>
                <span className="inline-flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5 text-xs font-bold text-foreground/80">
                  <Headphones className="h-3.5 w-3.5" />
                  Atendimento online
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-[120px_1fr_120px_1fr_120px] rounded-xl border border-border bg-card shadow-sm overflow-hidden"
              >
                <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground grid place-items-center font-bold text-sm p-3">
                  Premium
                </div>
                <div className="p-3 md:p-4 grid content-center border-t md:border-t-0 md:border-l border-border min-h-[72px]">
                  <span className="block text-2xl font-bold tracking-tight text-foreground leading-none mb-1">4.9</span>
                  <span className="text-xs font-bold text-muted-foreground">128 avaliações</span>
                </div>
                <div className="p-3 md:p-4 grid content-center border-t md:border-t-0 md:border-l border-border min-h-[72px]">
                  <span className="block text-2xl font-bold tracking-tight text-foreground leading-none mb-1">12 anos</span>
                  <span className="text-xs font-bold text-muted-foreground">experiência</span>
                </div>
                <div className="p-3 md:p-4 grid content-center border-t md:border-t-0 md:border-l border-border min-h-[72px]">
                  <span className="block text-2xl font-bold tracking-tight text-foreground leading-none mb-1">430+</span>
                  <span className="text-xs font-bold text-muted-foreground">declarações</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 md:px-6 pb-8 grid grid-cols-1 md:grid-cols-12 gap-6 md:-mt-60">
        <div className="md:col-span-8 space-y-6 md:pt-60">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
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
          </motion.div>

          {/* Consult Section */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-[0.3em]">
                Consultar Especialistas
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Diga o que você precisa e receba um orçamento
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
          </motion.div>

          {/* Services List */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
          <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="p-6 pb-0">
              <span className="block text-xs font-bold text-primary mb-4 uppercase tracking-widest">
                Serviços
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">Serviços disponíveis</h2>
            </div>
            <div className="divide-y divide-border">
              {services.map((service) => (
                <details key={service.name} className="group">
                  <summary className="flex items-center gap-4 p-6 cursor-pointer list-none">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg font-semibold text-foreground">{service.name}</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">{service.desc}</p>
                    </div>
                    <span className="text-sm font-bold text-primary whitespace-nowrap">{service.price}</span>
                    <span className="w-8 h-8 rounded-full border border-border grid place-items-center text-muted-foreground font-bold text-lg transition-transform duration-300 group-open:rotate-45 group-open:text-primary group-open:bg-primary/10 shrink-0">
                      +
                    </span>
                  </summary>
                  <div className="px-6 pb-6 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {service.chips.map((chip) => (
                        <span
                          key={chip}
                          className="bg-muted/50 border border-border/50 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                    <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{service.note}</p>
                      <button
                        className={
                          service.outline
                            ? 'border-2 border-primary text-primary px-6 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap hover:bg-primary/5 active:scale-95 transition-all shrink-0'
                            : 'bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold text-sm whitespace-nowrap hover:bg-primary/90 active:scale-95 transition-all shrink-0'
                        }
                      >
                        {service.action}
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
          </motion.div>

          {/* Casos de Sucesso */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm overflow-hidden">
            <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-widest">
              Casos de sucesso
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Experiências com clientes e demandas reais
            </h2>
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-2 px-2 scrollbar-none">
              {successCases.map((item) => (
                <article
                  key={item.title}
                  className="min-w-[260px] shrink-0 snap-start bg-card border border-border rounded-xl p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
                >
                  <span className="text-primary text-xs font-bold uppercase tracking-widest">{item.type}</span>
                  <h3 className="text-sm font-semibold text-foreground mt-2 mb-2 leading-snug">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </article>
              ))}
            </div>
          </section>
          </motion.div>

          {/* Experiência */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-widest">
              Experiência
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Histórico profissional
            </h2>
            <div className="space-y-3">
              {experience.map((item) => (
                <div key={item.year} className="grid grid-cols-[100px_1fr] gap-4 bg-muted/30 p-4 rounded-xl">
                  <span className="text-primary font-bold text-sm">{item.year}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          </motion.div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-widest">
              FAQ personalizado
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Perguntas frequentes
            </h2>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <details
                  key={item.q}
                  className="group border border-border rounded-xl p-4 transition-colors [&[open]]:border-primary/20"
                >
                  <summary className="list-none flex justify-between items-center gap-4 cursor-pointer text-sm font-semibold text-foreground">
                    {item.q}
                    <span className="text-primary text-lg leading-none transition-transform duration-300 group-open:rotate-45 shrink-0">+</span>
                  </summary>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border/50">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
          </motion.div>

          {/* Avaliações */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-widest">
              Avaliações
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Comentários de clientes
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {reviews.map((review) => (
                <article key={review.author} className="bg-muted/30 p-4 rounded-xl">
                  <div className="text-amber-400 text-sm mb-2 tracking-wider">
                    {'★'.repeat(review.stars)}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mb-3">
                    &ldquo;{review.text}&rdquo;
                  </p>
                  <strong className="text-xs text-muted-foreground">&mdash; {review.author}</strong>
                </article>
              ))}
            </div>
          </section>
          </motion.div>
        </div>

        {/* Sticky Sidebar (4 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="md:col-span-4"
        >
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
                    <h5 className="text-lg font-semibold text-foreground">Maio 2026</h5>
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
                    Horários disponíveis
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
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 bg-muted/30 border border-border rounded-lg text-sm font-bold text-center text-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none px-3 py-2"
                      type="text"
                      defaultValue=""
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
              <div className="bg-card p-5 rounded-2xl border border-border">
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

              {/* Como funciona */}
              <div className="bg-card p-5 rounded-2xl border border-border">
                <h6 className="text-xs font-bold mb-4 uppercase text-muted-foreground/60">Como funciona</h6>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Escolha um serviço fechado, solicite orçamento para casos variáveis ou agende uma consultoria para conversar ao vivo.
                </p>
              </div>

              {/* Security */}
              <div className="bg-card p-5 rounded-2xl border border-border">
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
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
