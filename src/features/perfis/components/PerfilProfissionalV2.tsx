'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  BadgeCheck, Headphones, GraduationCap, Award,
  CheckCircle2, Lock, Users, Send,
  ChevronRight, ShieldCheck, Shield, FileText,
  Pencil, X, Check, Plus, ChevronUp, ChevronDown, Trash2, Camera,
  Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import Footer from '../../../components/shared/Footer';
import { contratarServico } from '@/features/servicos/actions/contratar';
import { anexarArquivoAoAtendimento } from '@/features/atendimentos/actions/anexar-arquivo';
import { salvarVitrineProfissional } from '@/features/usuarios/actions/salvar-vitrine-profissional';
import { REGIMES_TRIBUTARIOS } from '@/features/usuarios/schemas/perfil-profissional';
import {
  salvarCasosSucesso,
  salvarExperiencias,
  salvarPerguntasFrequentes,
} from '@/features/perfis/actions/salvar-conteudo-vitrine';
import { salvarAvatarProfissional } from '@/features/perfis/actions/salvar-avatar-profissional';
import {
  FormularioSolicitarOrcamento,
  type DestinatarioDaSolicitacao,
} from '@/features/oportunidades/components/cliente/FormularioSolicitarOrcamento';
import { ConsultoriaPublica } from '@/features/consultorias/components/publico/ConsultoriaPublica';
import { obterMinhaConsultoria, salvarConsultoria } from '@/features/consultorias/actions/consultoria';
import type { AgendaDoMesDTO, ConsultoriaDoPrestadorDTO } from '@/features/consultorias/types/consultoria';

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

/** Rótulos amigáveis para os únicos valores que `regimesAtendidos` aceita. */
const ROTULO_REGIME: Record<(typeof REGIMES_TRIBUTARIOS)[number], string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
};

/**
 * Substantivo do kicker "Sobre o ___", por `tipoProfissional`. Nunca gravado
 * no banco — é apresentação, derivada do cadastro (campo protegido).
 */
const ROTULO_TIPO_PROFISSIONAL: Record<string, string> = {
  contabilidade: 'Contador',
  especialista_fiscal: 'Especialista Fiscal',
  advocacia: 'Advogado',
};

/** Chave estável para itens novos do rascunho, antes de existirem no banco. */
function chaveLocal(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/** Troca um item de posição com o vizinho — a reordenação inteira é isso. */
function mover<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const copia = [...lista];
  const troca = copia[indice];
  copia[indice] = copia[alvo];
  copia[alvo] = troca;
  return copia;
}

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

/**
 * Rascunho local do modo edição. Vive só no navegador enquanto o dono edita —
 * nada aqui é persistido nesta etapa. `salvarEdicao` é intencionalmente um
 * placeholder honesto: a gravação real fica para a etapa seguinte.
 */
type RascunhoPerfil = {
  apresentacao: string;
  especialidades: string[];
  certificacoes: string[];
  formacao: string;
  instituicaoEnsino: string;
  anoFormacao: string;
  areasAtuacao: string[];
  cidade: string;
  estado: string;
  disponivelAtendimento: boolean;
  regimesAtendidos: string[];
  sobreTitulo: string;
  sobreTexto: string;
};

function construirRascunho(identidade?: IdentidadePublica): RascunhoPerfil {
  return {
    apresentacao: identidade?.apresentacao ?? '',
    especialidades: identidade?.especialidades ?? [],
    certificacoes: identidade?.certificacoes ?? [],
    formacao: identidade?.formacao ?? '',
    instituicaoEnsino: identidade?.instituicaoEnsino ?? '',
    anoFormacao: identidade?.anoFormacao ? String(identidade.anoFormacao) : '',
    areasAtuacao: identidade?.areasAtuacao ?? [],
    cidade: identidade?.cidade ?? '',
    estado: identidade?.estado ?? '',
    disponivelAtendimento: identidade?.disponivelAtendimento ?? true,
    regimesAtendidos: identidade?.regimesAtendidos ?? [],
    sobreTitulo: identidade?.sobreTitulo ?? '',
    sobreTexto: identidade?.sobreTexto ?? '',
  };
}

/**
 * Rascunhos dos três blocos ordenáveis (Casos de sucesso, Experiência, FAQ).
 *
 * `chave` é só do navegador — existe para o React ter uma key estável mesmo
 * antes do item ter `id` (ele nasce sem `id`, a action grava e devolve um
 * novo do zero na próxima leitura). `id`, quando presente, é o registro real;
 * ausente significa "item novo, ainda não gravado".
 */
type RascunhoCaso = { chave: string; id?: string; tipo: string; titulo: string; descricao: string };
type RascunhoExperiencia = { chave: string; id?: string; periodo: string; titulo: string; descricao: string };
type RascunhoPergunta = { chave: string; id?: string; pergunta: string; resposta: string };

function construirRascunhoCasos(itens?: CasoSucessoPublico[]): RascunhoCaso[] {
  return (itens ?? []).map((item) => ({ ...item, chave: item.id }));
}
function construirRascunhoExperiencias(itens?: ExperienciaPublica[]): RascunhoExperiencia[] {
  return (itens ?? []).map((item) => ({ ...item, chave: item.id }));
}
function construirRascunhoFaq(itens?: FaqPublico[]): RascunhoPergunta[] {
  return (itens ?? []).map((item) => ({ ...item, chave: item.id }));
}

/** Lista de chips com remoção e um campo discreto para adicionar um novo item. */
function EditorDeChips({
  itens,
  onAdicionar,
  onRemover,
  placeholder,
}: {
  itens: string[];
  onAdicionar: (valor: string) => void;
  onRemover: (indice: number) => void;
  placeholder: string;
}) {
  const [novo, setNovo] = useState('');
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {itens.map((item, indice) => (
        <span
          key={`${item}-${indice}`}
          className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemover(indice)}
            aria-label={`Remover ${item}`}
            className="hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={novo}
        onChange={(e) => setNovo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && novo.trim()) {
            e.preventDefault();
            onAdicionar(novo.trim());
            setNovo('');
          }
        }}
        placeholder={placeholder}
        className="bg-transparent border border-dashed border-border rounded-full px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary min-w-[140px]"
      />
    </div>
  );
}

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
  /**
   * Campos já persistidos no cadastro. Cada um é exibido só quando tem valor —
   * vazio não vira placeholder, traço ou ícone órfão, o bloco correspondente
   * simplesmente não aparece.
   */
  especialidades?: string[]
  certificacoes?: string[]
  formacao?: string | null
  instituicaoEnsino?: string | null
  anoFormacao?: number | null
  areasAtuacao?: string[]
  cidade?: string
  estado?: string
  disponivelAtendimento?: boolean
  regimesAtendidos?: string[]
  avatarUrl?: string | null
  valorHoraCentavos?: number | null
  tipoProfissional?: string
  /** Conteúdo do bloco "Sobre". Vazio/ausente = o bloco correspondente some. */
  sobreTitulo?: string | null
  sobreTexto?: string | null
}

/** Um card de "Comentários de clientes", já no formato que a seção desenha. */
export type AvaliacaoPublica = {
  id: string;
  stars: number;
  text: string;
  author: string;
};

/** Um card de "Casos de sucesso", real e já ordenado pelo dono do perfil. */
export type CasoSucessoPublico = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
};

/** Um item de "Histórico profissional", real e já ordenado. */
export type ExperienciaPublica = {
  id: string;
  periodo: string;
  titulo: string;
  descricao: string;
};

/** Um item do "FAQ personalizado", real e já ordenado. */
export type FaqPublico = {
  id: string;
  pergunta: string;
  resposta: string;
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
  /**
   * Se quem está vendo a página é o próprio dono do perfil, validado no
   * servidor (sessão comparada com `prestadorId`, nunca o inverso). Visitantes,
   * clientes e outros profissionais sempre recebem `false` — e o visual público
   * não muda em nada para eles.
   */
  podeEditar?: boolean;
  /**
   * Os três blocos ordenáveis, reais e já na ordem salva. Ausentes (vitrine de
   * demonstração sem `?prestador=`) mantêm o conteúdo de exemplo; presentes e
   * vazios escondem o bloco inteiro — nunca mock a mostrar "por baixo".
   */
  casosSucesso?: CasoSucessoPublico[];
  experiencias?: ExperienciaPublica[];
  faq?: FaqPublico[];
  /**
   * Link para a tabela de preços publicada por este Profissional.
   *
   * Resolvido no servidor: só existe quando ele publicou uma. Ausente — vitrine
   * de demonstração, ou perfil que nunca publicou — a chamada simplesmente não
   * aparece, em vez de levar a uma página que diria "sem preços".
   */
  planosEPrecos?: string;
};

export default function PerfilProfissionalV2({
  identidade,
  servicos,
  avaliacoes,
  solicitacaoDireta,
  agendaConsultoria,
  podeEditar = false,
  casosSucesso,
  experiencias,
  faq,
  planosEPrecos,
}: PerfilProfissionalV2Props = {}) {
  // Dados reais quando o perfil é de um prestador; caso contrário mantém o
  // conteúdo de demonstração, sem alterar o layout em nenhum dos dois casos.
  const nomeExibido = identidade?.nome ?? 'Carlos Eduardo Mendes';
  /** "Dra. Ana Carolina Silva" → "Dra. Ana" — o tratamento vem do cadastro. */
  const primeiroNome = nomeExibido.split(/\s+/).slice(0, 2).join(' ');
  const apresentacaoExibida =
    identidade?.apresentacao ??
    'Contador especialista em IRPF, MEI e regularização fiscal para autônomos, pequenos negócios e empresas no Simples Nacional.';
  /**
   * Formação + certificações reais do cadastro, no mesmo formato de lista já
   * aprovado visualmente. Sem `identidade` (vitrine de demonstração) mantém o
   * conteúdo de exemplo; com `identidade` e nada preenchido, a lista fica vazia
   * e o card correspondente não é desenhado — nada de item fantasma.
   */
  const itensFormacao: string[] = identidade
    ? [
        identidade.formacao
          ? `${identidade.formacao}${identidade.instituicaoEnsino ? ` — ${identidade.instituicaoEnsino}` : ''}${identidade.anoFormacao ? ` (${identidade.anoFormacao})` : ''}`
          : null,
        ...(identidade.certificacoes ?? []),
      ].filter((item): item is string => Boolean(item))
    : [
        'Ciências Contábeis — UFMG',
        'Pós-graduação em Gestão Tributária',
        'Registro profissional ativo',
      ];
  const itensEspecializacoes: string[] = identidade
    ? (identidade.especialidades ?? [])
    : [
        'IRPF com investimentos',
        'Simples Nacional avançado',
        'Regularização de CNPJ e MEI',
      ];
  /** Mesma lista, para o card "Especialidades" da sidebar. */
  const tagsEspecialidadesSidebar: string[] = identidade
    ? (identidade.especialidades ?? [])
    : ['IRPF', 'MEI', 'Simples Nacional', 'Regularização'];

  /**
   * Bloco "Sobre": kicker deriva de `tipoProfissional` (nunca gravado — é
   * apresentação de um campo protegido), título e texto vêm do cadastro real.
   * Sem `identidade`, os três continuam sendo o conteúdo de demonstração
   * aprovado; com `identidade` e nada preenchido, ficam vazios e a seção
   * decide sozinha, mais abaixo, se ainda tem algo para mostrar (Formação e
   * Especializações continuam contando).
   */
  const kickerSobre = identidade
    ? `Sobre o ${ROTULO_TIPO_PROFISSIONAL[identidade.tipoProfissional ?? ''] ?? 'Profissional'}`
    : 'Sobre o Contador';
  const sobreTituloExibido = identidade
    ? (identidade.sobreTitulo ?? '')
    : 'Especialista em rotinas fiscais e regularização';
  const sobreTextoExibido = identidade
    ? (identidade.sobreTexto ?? '')
    : 'Carlos atua com contabilidade consultiva para pessoas físicas, MEIs e pequenas empresas. O foco é simplificar decisões fiscais, evitar pendências e organizar documentos com clareza.';

  /**
   * Os três blocos ordenáveis, normalizados para o mesmo formato em ambos os
   * modos: sem `identidade`, o conteúdo de demonstração ganha a mesma forma
   * dos dados reais, para o JSX de leitura não precisar de dois caminhos.
   */
  const listaCasosSucesso: CasoSucessoPublico[] = identidade
    ? (casosSucesso ?? [])
    : successCases.map((item, indice) => ({
        id: `demo-${indice}`,
        tipo: item.type,
        titulo: item.title,
        descricao: item.desc,
      }));
  const listaExperiencias: ExperienciaPublica[] = identidade
    ? (experiencias ?? [])
    : experience.map((item, indice) => ({
        id: `demo-${indice}`,
        periodo: item.year,
        titulo: item.title,
        descricao: item.desc,
      }));
  const listaFaq: FaqPublico[] = identidade
    ? (faq ?? [])
    : faqItems.map((item, indice) => ({
        id: `demo-${indice}`,
        pergunta: item.q,
        resposta: item.a,
      }));

  /**
   * Modo edição inline. Só existe de verdade quando `podeEditar` é `true` —
   * essa flag já chega validada do servidor, então `emEdicao` nunca liga para
   * quem não é o dono, mesmo que `modoEdicao` acabe `true` por algum motivo.
   */
  const router = useRouter();
  const [modoEdicao, setModoEdicao] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoPerfil>(() => construirRascunho(identidade));
  const [rascunhoCasos, setRascunhoCasos] = useState<RascunhoCaso[]>(() => construirRascunhoCasos(casosSucesso));
  const [rascunhoExperiencias, setRascunhoExperiencias] = useState<RascunhoExperiencia[]>(() =>
    construirRascunhoExperiencias(experiencias),
  );
  const [rascunhoFaq, setRascunhoFaq] = useState<RascunhoPergunta[]>(() => construirRascunhoFaq(faq));
  const [salvando, setSalvando] = useState(false);
  const [enviandoAvatar, setEnviandoAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  /**
   * A consultoria do próprio prestador, com todos os campos que
   * `salvarConsultoria` exige (inclusive os que esta etapa NUNCA deve
   * alterar: `intervaloMinutos` e `ativa`, ausentes do DTO público). Buscada
   * ao entrar em edição — `null` quando o prestador não tem consultoria
   * configurada, caso em que a edição de título/descrição/valor/duração fica
   * indisponível em vez de criar uma consultoria nova por um caminho lateral.
   */
  const [consultoriaAtual, setConsultoriaAtual] = useState<ConsultoriaDoPrestadorDTO | null>(null);
  const [rascunhoConsultoria, setRascunhoConsultoria] = useState({
    titulo: '',
    descricaoCurta: '',
    valor: '',
    duracaoMinutos: '',
  });
  const emEdicao = podeEditar && modoEdicao;

  async function entrarEmEdicao() {
    setRascunho(construirRascunho(identidade));
    setRascunhoCasos(construirRascunhoCasos(casosSucesso));
    setRascunhoExperiencias(construirRascunhoExperiencias(experiencias));
    setRascunhoFaq(construirRascunhoFaq(faq));
    setModoEdicao(true);
    const resultado = await obterMinhaConsultoria();
    if (resultado.sucesso && resultado.dados) {
      setConsultoriaAtual(resultado.dados);
      setRascunhoConsultoria({
        titulo: resultado.dados.titulo,
        descricaoCurta: resultado.dados.descricaoCurta,
        valor: (resultado.dados.valorCentavos / 100).toFixed(2).replace('.', ','),
        duracaoMinutos: String(resultado.dados.duracaoMinutos),
      });
    } else {
      setConsultoriaAtual(null);
    }
  }

  function cancelarEdicao() {
    // Sair do modo edição não grava nada — todos os rascunhos são descartados
    // e o próximo "Editar meu perfil" parte de novo dos dados reais, nunca do
    // que ficou digitado.
    setRascunho(construirRascunho(identidade));
    setRascunhoCasos(construirRascunhoCasos(casosSucesso));
    setRascunhoExperiencias(construirRascunhoExperiencias(experiencias));
    setRascunhoFaq(construirRascunhoFaq(faq));
    setModoEdicao(false);
  }

  async function alterarAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviandoAvatar(true);
    try {
      const dados = new FormData();
      dados.set('avatar', arquivo);
      const resultado = await salvarAvatarProfissional(dados);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      // Upload é imediato, independente do "Salvar" geral: a foto já existe
      // como arquivo no storage assim que confirmada, então mostrar o
      // resultado real de uma vez é mais honesto do que fingir que ela
      // esperaria o rascunho do resto do perfil.
      router.refresh();
    } finally {
      setEnviandoAvatar(false);
    }
  }

  async function salvarEdicao() {
    if (salvando) return;
    setSalvando(true);
    try {
      // Os quatro blocos salvam juntos, no mesmo clique em "Salvar" — a pessoa
      // não deveria ter que descobrir que existem quatro botões diferentes.
      // Se qualquer um falhar, ninguém sai do modo edição e nenhum rascunho é
      // descartado: ela vê o erro e tenta de novo sem perder o que digitou.
      const [resultadoVitrine, resultadoCasos, resultadoExperiencias, resultadoFaq] = await Promise.all([
        salvarVitrineProfissional({
          apresentacao: rascunho.apresentacao,
          especialidades: rascunho.especialidades,
          certificacoes: rascunho.certificacoes,
          formacao: rascunho.formacao,
          instituicaoEnsino: rascunho.instituicaoEnsino,
          anoFormacao: rascunho.anoFormacao === '' ? null : Number(rascunho.anoFormacao),
          areasAtuacao: rascunho.areasAtuacao,
          cidade: rascunho.cidade,
          estado: rascunho.estado,
          disponivelAtendimento: rascunho.disponivelAtendimento,
          regimesAtendidos: rascunho.regimesAtendidos,
          sobreTitulo: rascunho.sobreTitulo,
          sobreTexto: rascunho.sobreTexto,
        }),
        salvarCasosSucesso(
          rascunhoCasos.map(({ id, tipo, titulo, descricao }) => ({ id, tipo, titulo, descricao })),
        ),
        salvarExperiencias(
          rascunhoExperiencias.map(({ id, periodo, titulo, descricao }) => ({ id, periodo, titulo, descricao })),
        ),
        salvarPerguntasFrequentes(
          rascunhoFaq.map(({ id, pergunta, resposta }) => ({ id, pergunta, resposta })),
        ),
      ]);
      // Consultoria só entra na leva se já existir uma configurada: a mesma
      // action de sempre (`salvarConsultoria`), recebendo TODOS os campos que
      // ela exige — os quatro editados aqui e os demais (agenda, intervalos,
      // antecedência, horizonte, timezone, `ativa`) copiados sem alteração do
      // que já estava salvo, para nenhum deles mudar por efeito colateral.
      const resultadoConsultoria = consultoriaAtual
        ? await salvarConsultoria({
            titulo: rascunhoConsultoria.titulo,
            descricaoCurta: rascunhoConsultoria.descricaoCurta,
            modalidade: consultoriaAtual.modalidade,
            valorCentavos: Math.round(Number(rascunhoConsultoria.valor.replace(',', '.')) * 100),
            duracaoMinutos: Number(rascunhoConsultoria.duracaoMinutos),
            intervaloMinutos: consultoriaAtual.intervaloMinutos,
            antecedenciaMinimaMinutos: consultoriaAtual.antecedenciaMinimaMinutos,
            horizonteDias: consultoriaAtual.horizonteDias,
            timezone: consultoriaAtual.timezone,
            ativa: consultoriaAtual.ativa,
          })
        : { sucesso: true as const, mensagem: '' };
      const primeiroErro = [
        resultadoVitrine,
        resultadoCasos,
        resultadoExperiencias,
        resultadoFaq,
        resultadoConsultoria,
      ].find((r) => !r.sucesso);
      if (primeiroErro) {
        toast.error(primeiroErro.mensagem);
        return;
      }
      toast.success('Perfil atualizado.');
      // Só sai do modo edição depois da confirmação do servidor. O
      // `refresh()` busca de novo os dados reais da página (Server Component)
      // — a mesma tela passa a mostrar o que foi gravado, não um estado
      // otimista local.
      setModoEdicao(false);
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

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
              <div className="flex items-center justify-between gap-3 mb-4">
                <motion.nav
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Link href="/" className="alvo-toque-h inline-flex items-center transition-colors hover:text-primary">Início</Link>
                  <ChevronRight className="h-3 w-3" />
                  <Link href="/profissionais" className="alvo-toque-h inline-flex items-center transition-colors hover:text-primary">Profissionais</Link>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-semibold">{nomeExibido}</span>
                </motion.nav>

                {/*
                  Só o dono, e só porque `podeEditar` já chegou validado no
                  servidor (sessão comparada com `prestadorId`, nunca a URL
                  sozinha). Para qualquer outro visitante `podeEditar` é
                  `false` e este bloco inteiro não renderiza nada.
                */}
                {podeEditar && (
                  modoEdicao ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={cancelarEdicao}
                        disabled={salvando}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void salvarEdicao()}
                        disabled={salvando}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {salvando ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void entrarEmEdicao()}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted/40 transition-colors shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar meu perfil
                    </button>
                  )
                )}
              </div>

              {/*
                Sem avatar e fora da edição, nada aqui muda: nenhum elemento
                novo entra no DOM. `avatar_url` só ganha lugar na tela quando
                tem valor real, ou quando o dono está editando e pode
                adicionar um — a mesma regra de campo vazio do resto do
                perfil, aplicada à primeira coisa que não tinha onde aparecer.
              */}
              {(identidade?.avatarUrl || emEdicao) ? (
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="relative shrink-0">
                    {identidade?.avatarUrl ? (
                      // `<img>` simples: URL pública externa (Vercel Blob), sem domínio configurado em next/image.
                      <img
                        src={identidade.avatarUrl}
                        alt={nomeExibido}
                        className="h-14 w-14 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-full border border-dashed border-border bg-muted/30 grid place-items-center text-muted-foreground">
                        <Camera className="h-5 w-5" />
                      </div>
                    )}
                    {emEdicao && (
                      <>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={enviandoAvatar}
                          aria-label="Alterar foto"
                          className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-card disabled:opacity-60"
                        >
                          <Camera className="h-3 w-3" />
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => void alterarAvatar(e)}
                        />
                      </>
                    )}
                  </div>
                  <motion.h1
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.05 }}
                    className="text-4xl sm:text-5xl font-bold tracking-tighter leading-[1.04] text-foreground"
                  >
                    {nomeExibido}
                  </motion.h1>
                </div>
              ) : (
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 }}
                  className="text-4xl sm:text-5xl font-bold tracking-tighter leading-[1.04] text-foreground mb-2.5"
                >
                  {nomeExibido}
                </motion.h1>
              )}
              {emEdicao ? (
                <div className="max-w-[700px] mb-3.5">
                  <textarea
                    value={rascunho.apresentacao}
                    onChange={(e) => setRascunho((r) => ({ ...r, apresentacao: e.target.value }))}
                    rows={3}
                    placeholder="Escreva uma apresentação para o seu perfil público."
                    className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base sm:text-[17px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              ) : (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-base sm:text-[17px] text-muted-foreground/80 leading-relaxed max-w-[700px] mb-3.5"
                >
                  {apresentacaoExibida}
                </motion.p>
              )}

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
                {(!identidade || identidade.disponivelAtendimento) && (
                  <span className="inline-flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5 text-xs font-bold text-foreground/80">
                    <span className="w-[7px] h-[7px] rounded-full bg-green-500 shadow-[0_0_0_4px_rgba(22,163,74,0.14)]" />
                    Disponível
                  </span>
                )}
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
          {(emEdicao ||
            sobreTituloExibido ||
            sobreTextoExibido ||
            itensFormacao.length > 0 ||
            itensEspecializacoes.length > 0) && (
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                {kickerSobre}
              </span>
            </div>
            {emEdicao ? (
              <input
                value={rascunho.sobreTitulo}
                onChange={(e) => setRascunho((r) => ({ ...r, sobreTitulo: e.target.value }))}
                placeholder="Adicionar título (ex.: Especialista em rotinas fiscais)"
                className="w-full text-3xl font-bold tracking-tight text-foreground mb-4 rounded-xl border border-border bg-background px-3 py-2 placeholder:text-muted-foreground placeholder:text-base placeholder:font-normal focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            ) : (
              sobreTituloExibido && (
                <h2 className="text-3xl font-bold tracking-tight text-foreground mb-4">
                  {sobreTituloExibido}
                </h2>
              )
            )}
            {emEdicao ? (
              <textarea
                value={rascunho.sobreTexto}
                onChange={(e) => setRascunho((r) => ({ ...r, sobreTexto: e.target.value }))}
                rows={3}
                placeholder="Adicionar texto complementar sobre a atuação."
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 mb-6"
              />
            ) : (
              sobreTextoExibido && (
                <p className="text-base text-muted-foreground leading-relaxed mb-6">
                  {sobreTextoExibido}
                </p>
              )
            )}
            {(emEdicao || itensFormacao.length > 0 || itensEspecializacoes.length > 0) && (
              <div
                className={`grid gap-6${
                  (emEdicao || itensFormacao.length > 0) && (emEdicao || itensEspecializacoes.length > 0)
                    ? ' md:grid-cols-2'
                    : ''
                }`}
              >
                {(emEdicao || itensFormacao.length > 0) && (
                  <div className="bg-muted/30 p-4 rounded-xl">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
                      <GraduationCap className="h-5 w-5 text-primary" /> Formação
                    </h3>
                    {emEdicao ? (
                      <div className="space-y-3">
                        <input
                          value={rascunho.formacao}
                          onChange={(e) => setRascunho((r) => ({ ...r, formacao: e.target.value }))}
                          placeholder="Adicionar formação (ex.: Ciências Contábeis)"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={rascunho.instituicaoEnsino}
                            onChange={(e) => setRascunho((r) => ({ ...r, instituicaoEnsino: e.target.value }))}
                            placeholder="Instituição de ensino"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                          />
                          <input
                            value={rascunho.anoFormacao}
                            onChange={(e) =>
                              setRascunho((r) => ({
                                ...r,
                                anoFormacao: e.target.value.replace(/\D/g, '').slice(0, 4),
                              }))
                            }
                            placeholder="Ano de formação"
                            inputMode="numeric"
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                          />
                        </div>
                        <div>
                          <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                            Certificações
                          </span>
                          <EditorDeChips
                            itens={rascunho.certificacoes}
                            onAdicionar={(valor) =>
                              setRascunho((r) => ({ ...r, certificacoes: [...r.certificacoes, valor] }))
                            }
                            onRemover={(indice) =>
                              setRascunho((r) => ({
                                ...r,
                                certificacoes: r.certificacoes.filter((_, i) => i !== indice),
                              }))
                            }
                            placeholder="+ Adicionar certificação"
                          />
                        </div>
                      </div>
                    ) : (
                      <ul className="space-y-2 text-muted-foreground text-sm">
                        {itensFormacao.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(emEdicao || itensEspecializacoes.length > 0) && (
                  <div className="bg-muted/30 p-4 rounded-xl">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
                      <Award className="h-5 w-5 text-primary" /> Especializações
                    </h3>
                    {emEdicao ? (
                      <EditorDeChips
                        itens={rascunho.especialidades}
                        onAdicionar={(valor) =>
                          setRascunho((r) => ({ ...r, especialidades: [...r.especialidades, valor] }))
                        }
                        onRemover={(indice) =>
                          setRascunho((r) => ({
                            ...r,
                            especialidades: r.especialidades.filter((_, i) => i !== indice),
                          }))
                        }
                        placeholder="+ Adicionar especialidade"
                      />
                    ) : (
                      <ul className="space-y-2 text-muted-foreground text-sm">
                        {itensEspecializacoes.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
          )}
          </motion.div>

          {/*
            Planos e preços deste profissional.

            Aparece só quando ele publicou uma tabela — a decisão é do servidor,
            que devolve o link ou não devolve nada. Um botão permanente levaria
            metade dos perfis a uma página dizendo "sem preços", e a chamada
            "Ver planos e preços" promete um número.

            Fica antes do pedido de orçamento de propósito: quem consegue ver o
            valor na hora não precisa pedir orçamento para descobri-lo — e quem
            precisa de algo fora da tabela encontra o pedido logo abaixo.
          */}
          {planosEPrecos ? (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              <section className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <span className="block text-xs font-bold text-primary mb-3 uppercase tracking-[0.3em]">
                  Contabilidade mensal
                </span>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">
                      Veja quanto custa para a sua empresa
                    </h2>
                    <p className="mt-2 max-w-xl text-base text-muted-foreground leading-relaxed">
                      {primeiroNome} definiu os próprios valores mensais.
                      Responda sobre a empresa e o preço aparece na hora.
                    </p>
                  </div>
                  <Link
                    href={planosEPrecos}
                    className="alvo-toque-h bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all shadow-sm hover:bg-primary/90"
                  >
                    <Calculator className="h-4 w-4" />
                    Ver planos e preços
                  </Link>
                </div>
              </section>
            </motion.div>
          ) : null}

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
          {(emEdicao || listaCasosSucesso.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                Casos de sucesso
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Experiências com clientes e demandas reais
            </h2>
            {emEdicao ? (
              <div className="space-y-3">
                {rascunhoCasos.map((item, indice) => (
                  <div key={item.chave} className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={item.tipo}
                        onChange={(e) =>
                          setRascunhoCasos((atual) =>
                            atual.map((c, i) => (i === indice ? { ...c, tipo: e.target.value } : c)),
                          )
                        }
                        placeholder="Tipo (ex.: IRPF)"
                        className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <input
                        value={item.titulo}
                        onChange={(e) =>
                          setRascunhoCasos((atual) =>
                            atual.map((c, i) => (i === indice ? { ...c, titulo: e.target.value } : c)),
                          )
                        }
                        placeholder="Título do caso"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRascunhoCasos((atual) => mover(atual, indice, -1))}
                          disabled={indice === 0}
                          aria-label="Mover para cima"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRascunhoCasos((atual) => mover(atual, indice, 1))}
                          disabled={indice === rascunhoCasos.length - 1}
                          aria-label="Mover para baixo"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Remover este caso de sucesso?')) {
                              setRascunhoCasos((atual) => atual.filter((_, i) => i !== indice));
                            }
                          }}
                          aria-label="Remover caso de sucesso"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={item.descricao}
                      onChange={(e) =>
                        setRascunhoCasos((atual) =>
                          atual.map((c, i) => (i === indice ? { ...c, descricao: e.target.value } : c)),
                        )
                      }
                      rows={2}
                      placeholder="Descrição do caso"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setRascunhoCasos((atual) => [
                      ...atual,
                      { chave: chaveLocal(), tipo: '', titulo: '', descricao: '' },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar caso de sucesso
                </button>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-2 px-2 scrollbar-none">
                {listaCasosSucesso.map((item) => (
                  <article
                    key={item.id}
                    className="min-w-[260px] shrink-0 snap-start bg-card border border-border rounded-xl p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300"
                  >
                    <span className="text-primary text-xs font-bold uppercase tracking-widest">{item.tipo}</span>
                    <h3 className="text-sm font-semibold text-foreground mt-2 mb-2 leading-snug">{item.titulo}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.descricao}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          </motion.div>
          )}

          {/* Experiência */}
          {(emEdicao || listaExperiencias.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                Experiência
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Histórico profissional
            </h2>
            {emEdicao ? (
              <div className="space-y-3">
                {rascunhoExperiencias.map((item, indice) => (
                  <div key={item.chave} className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={item.periodo}
                        onChange={(e) =>
                          setRascunhoExperiencias((atual) =>
                            atual.map((c, i) => (i === indice ? { ...c, periodo: e.target.value } : c)),
                          )
                        }
                        placeholder="Período (ex.: 12 anos)"
                        className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <input
                        value={item.titulo}
                        onChange={(e) =>
                          setRascunhoExperiencias((atual) =>
                            atual.map((c, i) => (i === indice ? { ...c, titulo: e.target.value } : c)),
                          )
                        }
                        placeholder="Título"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRascunhoExperiencias((atual) => mover(atual, indice, -1))}
                          disabled={indice === 0}
                          aria-label="Mover para cima"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRascunhoExperiencias((atual) => mover(atual, indice, 1))}
                          disabled={indice === rascunhoExperiencias.length - 1}
                          aria-label="Mover para baixo"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Remover este item do histórico?')) {
                              setRascunhoExperiencias((atual) => atual.filter((_, i) => i !== indice));
                            }
                          }}
                          aria-label="Remover item do histórico"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={item.descricao}
                      onChange={(e) =>
                        setRascunhoExperiencias((atual) =>
                          atual.map((c, i) => (i === indice ? { ...c, descricao: e.target.value } : c)),
                        )
                      }
                      rows={2}
                      placeholder="Descrição"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setRascunhoExperiencias((atual) => [
                      ...atual,
                      { chave: chaveLocal(), periodo: '', titulo: '', descricao: '' },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar item ao histórico
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {listaExperiencias.map((item) => (
                  <div key={item.id} className="grid grid-cols-[100px_1fr] gap-4 bg-muted/30 p-4 rounded-xl">
                    <span className="text-primary font-bold text-sm">{item.periodo}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{item.titulo}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          </motion.div>
          )}

          {/* FAQ */}
          {(emEdicao || listaFaq.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
          <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">
                FAQ personalizado
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground mb-6">
              Perguntas frequentes
            </h2>
            {emEdicao ? (
              <div className="space-y-3">
                {rascunhoFaq.map((item, indice) => (
                  <div key={item.chave} className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={item.pergunta}
                        onChange={(e) =>
                          setRascunhoFaq((atual) =>
                            atual.map((c, i) => (i === indice ? { ...c, pergunta: e.target.value } : c)),
                          )
                        }
                        placeholder="Pergunta"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRascunhoFaq((atual) => mover(atual, indice, -1))}
                          disabled={indice === 0}
                          aria-label="Mover para cima"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRascunhoFaq((atual) => mover(atual, indice, 1))}
                          disabled={indice === rascunhoFaq.length - 1}
                          aria-label="Mover para baixo"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Remover esta pergunta?')) {
                              setRascunhoFaq((atual) => atual.filter((_, i) => i !== indice));
                            }
                          }}
                          aria-label="Remover pergunta"
                          className="h-7 w-7 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={item.resposta}
                      onChange={(e) =>
                        setRascunhoFaq((atual) =>
                          atual.map((c, i) => (i === indice ? { ...c, resposta: e.target.value } : c)),
                        )
                      }
                      rows={2}
                      placeholder="Resposta"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setRascunhoFaq((atual) => [
                      ...atual,
                      { chave: chaveLocal(), pergunta: '', resposta: '' },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar pergunta
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {listaFaq.map((item) => (
                  <details
                    key={item.id}
                    className="group border border-border rounded-xl p-4 transition-colors [&[open]]:border-primary/20"
                  >
                    <summary className="list-none flex justify-between items-center gap-4 cursor-pointer text-sm font-semibold text-foreground">
                      {item.pergunta}
                      <span className="text-primary text-lg leading-none transition-transform duration-300 group-open:rotate-45 shrink-0">+</span>
                    </summary>
                    <p className="text-sm text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border/50">
                      {item.resposta}
                    </p>
                  </details>
                ))}
              </div>
            )}
          </section>
          </motion.div>
          )}

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
            <div className="relative">
              <ConsultoriaPublica
                nomeExibido={nomeExibido}
                agendaInicial={agendaConsultoria ?? null}
              />
              {/*
                Não mexe no calendário nem no fluxo de agendamento — só um
                selo por cima, visível só em edição, sem tocar o componente da
                consultoria. A edição de verdade mora no painel abaixo.
              */}
              {emEdicao && (
                <span
                  aria-hidden="true"
                  className="absolute top-3 right-3 z-10 inline-flex items-center justify-center h-7 w-7 rounded-full bg-card border border-border text-primary shadow-sm"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            {/*
              Painel de edição da consultoria: título, descrição, valor e
              duração — os únicos campos que esta etapa altera. Reaproveita
              `salvarConsultoria` (a mesma action da tela de configuração),
              mandando de volta agenda, intervalos, antecedência, horizonte,
              timezone e `ativa` exatamente como já estavam. Sem consultoria
              configurada, não há o que editar aqui — criar uma pertence a
              outro fluxo, não à vitrine.
            */}
            {emEdicao && (
              <div className="bg-card p-5 rounded-2xl border border-dashed border-border space-y-3">
                <h6 className="text-xs font-bold uppercase text-muted-foreground/60 flex items-center gap-1.5">
                  <Pencil className="h-3 w-3" /> Editar consultoria
                </h6>
                {consultoriaAtual ? (
                  <>
                    <input
                      value={rascunhoConsultoria.titulo}
                      onChange={(e) => setRascunhoConsultoria((r) => ({ ...r, titulo: e.target.value }))}
                      placeholder="Título da consultoria"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                    <textarea
                      value={rascunhoConsultoria.descricaoCurta}
                      onChange={(e) => setRascunhoConsultoria((r) => ({ ...r, descricaoCurta: e.target.value }))}
                      rows={2}
                      placeholder="Descrição curta"
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={rascunhoConsultoria.valor}
                        onChange={(e) => setRascunhoConsultoria((r) => ({ ...r, valor: e.target.value }))}
                        placeholder="Valor (R$)"
                        inputMode="decimal"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <input
                        value={rascunhoConsultoria.duracaoMinutos}
                        onChange={(e) =>
                          setRascunhoConsultoria((r) => ({
                            ...r,
                            duracaoMinutos: e.target.value.replace(/\D/g, '').slice(0, 3),
                          }))
                        }
                        placeholder="Duração (min)"
                        inputMode="numeric"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Configure sua consultoria no painel administrativo para poder editar estes dados por aqui.
                  </p>
                )}
              </div>
            )}

            {/* Secondary Info Cards */}
            <div className="space-y-4">
              {/* Specialties */}
              {(emEdicao || tagsEspecialidadesSidebar.length > 0) && (
                <div className="bg-card p-5 rounded-2xl border border-border">
                  <h6 className="text-xs font-bold mb-4 uppercase text-muted-foreground/60">Especialidades</h6>
                  {emEdicao ? (
                    <EditorDeChips
                      itens={rascunho.especialidades}
                      onAdicionar={(valor) =>
                        setRascunho((r) => ({ ...r, especialidades: [...r.especialidades, valor] }))
                      }
                      onRemover={(indice) =>
                        setRascunho((r) => ({
                          ...r,
                          especialidades: r.especialidades.filter((_, i) => i !== indice),
                        }))
                      }
                      placeholder="+ Adicionar especialidade"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tagsEspecialidadesSidebar.map((tag) => (
                        <span
                          key={tag}
                          className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/*
                Localização e disponibilidade não têm bloco público hoje — só
                aparecem aqui, e só em modo edição, para o dono preencher.
                Fora da edição este card não existe, então o visual público
                (e o do próprio dono fora do modo edição) não muda em nada.
              */}
              {emEdicao && (
                <div className="bg-card p-5 rounded-2xl border border-dashed border-border">
                  <h6 className="text-xs font-bold mb-4 uppercase text-muted-foreground/60 flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" /> Localização e disponibilidade
                  </h6>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={rascunho.cidade}
                        onChange={(e) => setRascunho((r) => ({ ...r, cidade: e.target.value }))}
                        placeholder="Adicionar cidade"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                      <input
                        value={rascunho.estado}
                        onChange={(e) =>
                          setRascunho((r) => ({ ...r, estado: e.target.value.toUpperCase().slice(0, 2) }))
                        }
                        placeholder="UF"
                        maxLength={2}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rascunho.disponivelAtendimento}
                        onChange={(e) => setRascunho((r) => ({ ...r, disponivelAtendimento: e.target.checked }))}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      Disponível para atendimento
                    </label>
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                        Regimes atendidos
                      </span>
                      {/*
                        `regimesAtendidos` é um enum fechado no banco — texto
                        livre aqui só geraria valor que o servidor rejeitaria.
                        Alternância entre as opções válidas, no lugar do editor
                        de texto livre usado pelas demais listas.
                      */}
                      <div className="flex flex-wrap gap-2">
                        {REGIMES_TRIBUTARIOS.map((regime) => {
                          const selecionado = rascunho.regimesAtendidos.includes(regime);
                          return (
                            <button
                              key={regime}
                              type="button"
                              onClick={() =>
                                setRascunho((r) => ({
                                  ...r,
                                  regimesAtendidos: selecionado
                                    ? r.regimesAtendidos.filter((item) => item !== regime)
                                    : [...r.regimesAtendidos, regime],
                                }))
                              }
                              className={
                                selecionado
                                  ? 'bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/30'
                                  : 'bg-transparent text-muted-foreground px-3 py-1 rounded-full text-xs font-bold border border-dashed border-border hover:border-primary/40'
                              }
                            >
                              {ROTULO_REGIME[regime]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                        Áreas de atuação
                      </span>
                      <EditorDeChips
                        itens={rascunho.areasAtuacao}
                        onAdicionar={(valor) =>
                          setRascunho((r) => ({ ...r, areasAtuacao: [...r.areasAtuacao, valor] }))
                        }
                        onRemover={(indice) =>
                          setRascunho((r) => ({
                            ...r,
                            areasAtuacao: r.areasAtuacao.filter((_, i) => i !== indice),
                          }))
                        }
                        placeholder="+ Adicionar área de atuação"
                      />
                    </div>
                  </div>
                </div>
              )}

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
