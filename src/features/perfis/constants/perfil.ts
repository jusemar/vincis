import type { ProfessionalData } from '../types/perfil';

export const professionalData: ProfessionalData = {
  name: 'Carlos Eduardo Mendes',
  subtitle:
    'Contador especialista em IRPF, MEI e regularização fiscal para autônomos, pequenos negócios e empresas no Simples Nacional.',
  about:
    'Carlos atua com contabilidade consultiva para pessoas físicas, MEIs e pequenas empresas. O foco é simplificar decisões fiscais, evitar pendências e organizar documentos com clareza.',
  location: 'Belo Horizonte, MG',
  rating: 4.9,
  reviewCount: 128,
  education: 'Ciências Contábeis — UFMG',
  experience: '12 anos',
  declarations: '430+',
  hourlyRate: 180,
  specialties: ['IRPF', 'MEI', 'Simples Nacional', 'Regularização'],
  certifications: [
    'Ciências Contábeis — UFMG',
    'Pós-graduação em Gestão Tributária',
    'Registro profissional ativo',
  ],
  services: [
    {
      title: 'Declaração de IRPF',
      description: 'Para pessoa física com rendimentos simples ou moderados.',
      price: 'A partir de R$ 100',
      chips: ['Atendimento online', 'Até 2 fontes pagadoras', 'Organização dos documentos', 'Entrega da declaração'],
      cta: 'Contratar agora',
      priceNote: 'Preço inicial para casos simples. Investimentos, exterior ou muitos informes podem exigir orçamento.',
    },
    {
      title: 'Abertura de MEI',
      description: 'Cadastro, orientação inicial e regularização básica.',
      price: 'A partir de R$ 50',
      chips: ['Emissão do CNPJ', 'Orientação de atividade', 'Primeiros passos fiscais'],
      cta: 'Contratar agora',
      priceNote: 'Ideal para quem quer iniciar formalmente com orientação simples e rápida.',
    },
    {
      title: 'Regularização de CNPJ',
      description: 'Análise de pendências fiscais, cadastrais e obrigações atrasadas.',
      price: 'Sob orçamento',
      chips: ['Diagnóstico inicial', 'Consulta de pendências', 'Plano de regularização'],
      cta: 'Solicitar orçamento',
      isOrcamento: true,
      priceNote: 'Como cada caso muda conforme pendências e órgãos envolvidos, o valor é definido após análise.',
    },
    {
      title: 'Consultoria tributária por hora',
      description: 'Conversa estratégica para decisões fiscais e planejamento.',
      price: 'R$ 180,00/h',
      chips: ['Videochamada', 'Análise do caso', 'Orientação prática'],
      cta: 'Agendar consultoria',
      priceNote: 'Use quando sua dúvida precisa de conversa ao vivo, contexto e orientação personalizada.',
    },
  ],
  cases: [
    { type: 'IRPF', title: 'Declaração com pendências anteriores', description: 'Organização de documentos e envio correto após inconsistências.' },
    { type: 'MEI', title: 'Formalização de prestador', description: 'Orientação fiscal inicial para emissão de nota e obrigações mensais.' },
    { type: 'CNPJ', title: 'Regularização de empresa inativa', description: 'Diagnóstico de pendências e plano de regularização fiscal.' },
    { type: 'Simples', title: 'Correção de enquadramento fiscal', description: 'Análise de regime e organização para reduzir riscos.' },
  ],
  timeline: [
    { year: '12 anos', title: 'Atuação em contabilidade', description: 'Experiência com pessoas físicas, MEIs, autônomos e pequenas empresas.' },
    { year: '430+', title: 'Declarações e regularizações', description: 'Atendimento com IRPF, CNPJ, DAS, pendências e obrigações fiscais.' },
  ],
  faqs: [
    { question: 'O valor da declaração de IRPF pode mudar?', answer: 'Sim. O preço inicial vale para casos simples. Situações com investimentos, exterior, atividade rural ou muitos informes podem exigir orçamento.' },
    { question: 'O atendimento é totalmente online?', answer: 'Sim. O atendimento pode acontecer por ticket, envio de documentos pela plataforma e videochamada em consultorias agendadas.' },
    { question: 'Posso tirar uma dúvida antes de contratar?', answer: 'Sim. Use o campo de dúvida abaixo para enviar uma pergunta privada para este contador ou pública para profissionais da categoria.' },
  ],
  reviews: [
    { name: 'Mariana Costa', text: 'Organizou meu imposto de renda com clareza e explicou tudo sem complicar.', rating: 5 },
    { name: 'Rafael Oliveira', text: 'Atendimento rápido, direto e muito profissional. Resolveu minha regularização.', rating: 5 },
  ],
};
