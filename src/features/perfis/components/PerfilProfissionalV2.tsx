'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  BadgeCheck, Headphones, GraduationCap, Award,
  CheckCircle2, Lock, Users, Send,
  ChevronRight, ShieldCheck, Shield, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import Footer from '../../../components/shared/Footer';
import { contratarServico } from '@/features/servicos/actions/contratar';
import { anexarArquivoAoAtendimento } from '@/features/atendimentos/actions/anexar-arquivo';
import {
  FormularioSolicitarOrcamento,
  type DestinatarioDaSolicitacao,
} from '@/features/oportunidades/components/cliente/FormularioSolicitarOrcamento';
import { ConsultoriaPublica } from '@/features/consultorias/components/publico/ConsultoriaPublica';
import type { AgendaDoMesDTO } from '@/features/consultorias/types/consultoria';

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

type ServicoPublico = {
  id: string;
  name: string;
  desc: string;
  price: string;
  chips: string[];
  note: string;
  action: string;
  outline?: boolean;
};

/** Identidade pública real do prestador. Ausente = vitrine de demonstração. */
export type IdentidadePublica = {
  nome: string
  apresentacao: string
  experienciaAnos: number | null
  avaliacaoMedia: number | null
  totalAvaliacoes: number
}

/** Um card de "Comentários de clientes", já no formato que a seção desenha. */
export type AvaliacaoPublica = {
  id: string;
  stars: number;
  text: string;
  author: string;
};

type PerfilProfissionalV2Props = {
  identidade?: IdentidadePublica;
  /**
   * Comentários reais do prestador, mais recentes primeiro.
   *
   * Ausente (vitrine de demonstração, sem `?prestador=`) mantém os dois cards
   * de exemplo — que continuam sendo a referência visual aprovada. Presente e
   * vazio significa "este prestador ainda não foi avaliado", e a seção mostra
   * o estado vazio em vez de inventar comentário.
   */
  avaliacoes?: AvaliacaoPublica[];
  /**
   * Catálogo real do prestador. Quando ausente (vitrine de demonstração sem
   * `?prestador=`), a lista estática original continua sendo exibida — o visual
   * é idêntico nos dois casos.
   */
  servicos?: ServicoPublico[];
  /**
   * O destinatário de uma solicitação privada de orçamento.
   *
   * Resolvido no servidor a partir de `?prestador=`: só existe quando há um
   * Profissional real, habilitado e com ao menos uma categoria pública que ele
   * possa atender. Ausente — na vitrine de demonstração, por exemplo — o perfil
   * não oferece a ação, porque não haveria a quem dirigir o pedido.
   */
  solicitacaoDireta?: DestinatarioDaSolicitacao;
  /**
   * Primeiro mês da agenda real, resolvido no servidor a partir de
   * `?prestador=`.
   *
   * Ausente — ou com `consultoria: null` dentro — quando o Profissional não tem
   * consultoria ativa, e é o caso também da vitrine de demonstração, que não
   * tem dono. O card então mostra ausência: um calendário de exemplo com dias
   * verdes seria disponibilidade que ninguém pode contratar.
   */
  agendaConsultoria?: AgendaDoMesDTO | null;
};

export default function PerfilProfissionalV2({
  identidade,
  servicos,
  avaliacoes,
  solicitacaoDireta,
  agendaConsultoria,
}: PerfilProfissionalV2Props = {}) {
  // Dados reais quando o perfil é de um prestador; caso contrário mantém o
  // conteúdo de demonstração, sem alterar o layout em nenhum dos dois casos.
  const nomeExibido = identidade?.nome ?? 'Carlos Eduardo Mendes';
  /** "Dra. Ana Carolina Silva" → "Dra. Ana" — o tratamento vem do cadastro. */
  const primeiroNome = nomeExibido.split(/\s+/).slice(0, 2).join(' ');
  const apresentacaoExibida =
    identidade?.apresentacao ??
    'Contador especialista em IRPF, MEI e regularização fiscal para autônomos, pequenos negócios e empresas no Simples Nacional.';
  const [contratando, setContratando] = useState(false);
  const listaServicos: ServicoPublico[] = servicos ?? (services as ServicoPublico[]);
  // Mesma regra dos serviços: dado real quando existe prestador, conteúdo de
  // demonstração quando a página é a vitrine sem `?prestador=`.
  const listaAvaliacoes: AvaliacaoPublica[] =
    avaliacoes ??
    reviews.map((review, indice) => ({ id: `demo-${indice}`, ...review }));

  /**
   * Contratação direta. O Cliente vem da sessão no servidor; aqui só
   * encaminhamos o visitante sem conta para o fluxo de login já existente,
   * preservando a intenção para retomar o mesmo serviço depois.
   */
  /** Recado e anexos que o Cliente prepara antes de confirmar, por serviço. */
  const [mensagens, setMensagens] = useState<Record<string, string>>({});
  const [anexos, setAnexos] = useState<Record<string, File[]>>({});

  async function contratar(servicoId: string) {
    if (contratando) return;
    setContratando(true);
    try {
      const resultado = await contratarServico({
        servicoId,
        mensagem: mensagens[servicoId] ?? '',
      });
      if (!resultado.sucesso && resultado.precisaEntrar) {
        const retorno = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/?entrar=1&retorno=${encodeURIComponent(retorno)}`;
        return;
      }
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }

      // Os anexos vão para o Atendimento recém-criado pelo mesmo caminho
      // autorizado usado durante o atendimento — não existe segundo sistema de
      // arquivos só para a contratação.
      // Só quando a contratação nasce agora. Se ela já existia, clicar de novo
      // não pode duplicar os anexos — dali em diante o lugar de enviar arquivo
      // é o próprio Atendimento. É a mesma regra da mensagem inicial.
      const atendimentoId = resultado.dados?.jaExistia
        ? undefined
        : resultado.dados?.atendimentoId;
      const arquivos = anexos[servicoId] ?? [];
      if (atendimentoId && arquivos.length) {
        for (const arquivo of arquivos) {
          const dados = new FormData();
          dados.set('atendimentoId', atendimentoId);
          dados.set('arquivo', arquivo);
          const envio = await anexarArquivoAoAtendimento(dados);
          if (!envio.sucesso) toast.error(`${arquivo.name}: ${envio.mensagem}`);
        }
      }

      setMensagens((atual) => ({ ...atual, [servicoId]: '' }));
      setAnexos((atual) => ({ ...atual, [servicoId]: [] }));
      toast.success(resultado.mensagem);
    } finally {
      setContratando(false);
    }
  }

  /** O formulário privado abre no lugar, sem tirar ninguém da página. */
  const [solicitando, setSolicitando] = useState(false);
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => setStatus('success'), 600);
    return () => clearTimeout(timer);
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-dvh bg-background">
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
      <div className="min-h-dvh bg-background flex items-center justify-center">
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
    <div className="min-h-dvh bg-background relative overflow-hidden">
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
                <Link href="/" className="alvo-toque-h inline-flex items-center transition-colors hover:text-primary">Início</Link>
                <ChevronRight className="h-3 w-3" />
                <Link href="/profissionais" className="alvo-toque-h inline-flex items-center transition-colors hover:text-primary">Profissionais</Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-semibold">{nomeExibido}</span>
              </motion.nav>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="text-4xl sm:text-5xl font-bold tracking-tighter leading-[1.04] text-foreground mb-2.5"
              >
                {nomeExibido}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-base sm:text-[17px] text-muted-foreground/80 leading-relaxed max-w-[700px] mb-3.5"
              >
                {apresentacaoExibida}
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
                  <span className="block text-2xl font-bold tracking-tight text-foreground leading-none mb-1">
                    {identidade
                      ? identidade.totalAvaliacoes > 0
                        ? ((identidade.avaliacaoMedia ?? 0) / 10)
                            .toFixed(1)
                            .replace('.', ',')
                        : '—'
                      : '4.9'}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    {identidade
                      ? `${identidade.totalAvaliacoes} avaliações`
                      : '128 avaliações'}
                  </span>
                </div>
                <div className="p-3 md:p-4 grid content-center border-t md:border-t-0 md:border-l border-border min-h-[72px]">
                  <span className="block text-2xl font-bold tracking-tight text-foreground leading-none mb-1">
                    {identidade
                      ? `${identidade.experienciaAnos ?? 0} anos`
                      : '12 anos'}
                  </span>
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
                {solicitacaoDireta ? (
                  <>
                    O pedido feito aqui vai somente para {primeiroNome}. Nenhum
                    outro profissional vai vê-lo.
                  </>
                ) : (
                  <>
                    Descreva sua necessidade e receba propostas de profissionais
                    da categoria adequada.
                  </>
                )}
              </p>
            </div>

            {/*
              Uma porta só, e ela é privada.

              O bloco anterior perguntava "falar direto com este profissional ou
              abrir para a categoria?" — duas intenções diferentes na mesma
              tela, e a segunda contradizia o gesto de ter aberto o perfil de
              alguém. Quem chegou até aqui já escolheu com quem quer falar; quem
              ainda não escolheu tem a busca pública, onde o pedido aberto
              continua existindo inteiro.
            */}
            {solicitacaoDireta ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0 text-primary" />
                    Solicitação privada para {primeiroNome}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSolicitando((atual) => !atual)}
                    aria-expanded={solicitando}
                    className="alvo-toque-h bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all shadow-sm hover:bg-primary/90"
                  >
                    <Send className="h-4 w-4" />
                    {solicitando ? 'Fechar' : 'Solicitar orçamento'}
                  </button>
                </div>

                {solicitando ? (
                  <FormularioSolicitarOrcamento
                    destinatario={solicitacaoDireta}
                    onCancelar={() => setSolicitando(false)}
                  />
                ) : null}
              </div>
            ) : (
              /*
                Vitrine de demonstração (sem `?prestador=`) ou perfil que ainda
                não pode receber pedidos: não existe a quem dirigir, então o
                caminho honesto é a busca pública — e não um botão que o
                servidor recusaria.
              */
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0" />
                  Descreva sua necessidade e compare propostas de vários
                  profissionais.
                </p>
                <Link
                  href="/profissionais"
                  className="alvo-toque-h bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all shadow-sm hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                  Solicitar orçamento
                </Link>
              </div>
            )}
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
              {listaServicos.map((service) => (
                <details key={service.id ?? service.name} className="group">
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
                    {/* Recado e documentos que o Cliente já quer entregar. Sem
                        obrigatoriedade: exigir texto para contratar seria um
                        obstáculo, e a conversa continua depois no Atendimento. */}
                    {service.id && (
                      <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                        <label
                          htmlFor={`mensagem-${service.id}`}
                          className="block text-xs font-bold uppercase tracking-wide text-muted-foreground"
                        >
                          Mensagem para o profissional{' '}
                          <span className="font-medium normal-case tracking-normal">(opcional)</span>
                        </label>
                        <textarea
                          id={`mensagem-${service.id}`}
                          rows={3}
                          value={mensagens[service.id] ?? ''}
                          onChange={(e) =>
                            setMensagens((atual) => ({
                              ...atual,
                              [service.id as string]: e.target.value,
                            }))
                          }
                          placeholder="Explique sua necessidade. Ex.: preciso abrir um MEI para prestação de serviços e já tenho meus documentos."
                          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            id={`anexos-${service.id}`}
                            type="file"
                            multiple
                            accept=".txt,.pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              setAnexos((atual) => ({
                                ...atual,
                                [service.id as string]: Array.from(e.target.files ?? []),
                              }))
                            }
                            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground hover:file:bg-muted"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Arquivos ficam privados, visíveis só para você e o profissional. TXT, PDF, JPG ou PNG até 10 MB.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="bg-muted/30 border border-border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <p className="text-xs text-muted-foreground flex-1 leading-relaxed">{service.note}</p>
                      <button
                        type="button"
                        disabled={contratando || !service.id}
                        onClick={() => service.id && void contratar(service.id)}
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
            {/* Card idêntico ao aprovado: o que mudou foi de onde vêm as
                estrelas, o texto e o nome. Sem avaliação nenhuma, uma linha
                discreta no lugar do grid — nada de card fantasma nem de nota
                fictícia. */}
            {listaAvaliacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Este profissional ainda não recebeu avaliações.
              </p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {listaAvaliacoes.map((review) => (
                  <article key={review.id} className="bg-muted/30 p-4 rounded-xl">
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
            )}
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
            {/*
              O card de consultoria saiu daqui para
              `features/consultorias/components/publico/ConsultoriaPublica`: o
              mesmo JSX, as mesmas classes, agora alimentado pela agenda real do
              Profissional em vez de `availabilityData` e `timeSlots`. Regra de
              agenda não mora em componente de perfil — e o modal de
              contratação, o rascunho e o retorno do login moram junto dela, no
              domínio, e não aqui.
            */}
            <ConsultoriaPublica
              nomeExibido={nomeExibido}
              agendaInicial={agendaConsultoria ?? null}
            />

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
