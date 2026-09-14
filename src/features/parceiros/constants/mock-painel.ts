/**
 * Dados de demonstração do Painel do Parceiro.
 *
 * **Nada aqui é real.** O programa de parceiros ainda não tem tabela, action
 * nem consulta: esta etapa existe para aprovar o desenho da tela dentro do
 * Vincis de verdade, e não para operar comissão nenhuma.
 *
 * Ficam todos num arquivo só de propósito. Quando o backend existir, cada bloco
 * troca a origem do dado sem que se precise caçar número dentro de JSX — e,
 * enquanto isso, é possível ler numa tela só tudo o que a interface afirma.
 *
 * Nível, percentuais, clientes recorrentes ativos e proteção **não** estão
 * aqui: vêm da configuração publicada pela Gestão e do estado real do parceiro
 * (`lib/niveis.ts`).
 */


/** Situação do parceiro. Alimenta Hero, KPIs e card de níveis. */
export const SITUACAO_PARCEIRO = {
  clientesAtivos: 37,
  mesesConsecutivos: 12,
}

/**
 * Indicadores do painel.
 *
 * `tom` não é enfeite e não varia por gosto: **azul (`info`) é recorrência**,
 * âmbar (`primary`) é todo o resto. É o mesmo critério da série do gráfico, do
 * card "Planos recorrentes" e dos chips do Hero — a cor diz sempre a mesma
 * coisa, em qualquer bloco da tela.
 */
export const KPIS_PARCEIRO = [
  {
    id: 'ganhos-mes',
    icone: 'wallet',
    rotulo: 'Ganhos do mês',
    valor: 4812,
    prefixo: 'R$ ',
    variacao: 32,
    apoio: 'meta R$ 5.500',
    tom: 'primary',
  },
  {
    id: 'renda-recorrente',
    icone: 'repeat',
    rotulo: 'Renda recorrente',
    valor: 3240,
    prefixo: 'R$ ',
    variacao: 18,
    apoio: 'prevista p/ próximo mês',
    tom: 'info',
  },
  {
    id: 'clientes-ativos',
    icone: 'users',
    rotulo: 'Clientes ativos',
    valor: 37,
    variacao: 9,
    apoio: '+3 esta semana',
    tom: 'primary',
  },
  {
    id: 'recorrentes-ativos',
    icone: 'refresh',
    rotulo: 'Recorrentes ativos',
    valor: 7,
    variacao: 12,
    apoio: 'definem seu nível',
    tom: 'info',
  },
  {
    id: 'conversao',
    icone: 'target',
    rotulo: 'Conversão de leads',
    valor: 32,
    sufixo: '%',
    variacao: 6,
    apoio: 'média parceiros: 19%',
    tom: 'primary',
  },
  {
    id: 'acumulado',
    icone: 'moeda',
    rotulo: 'Acumulado total',
    valor: 48230,
    prefixo: 'R$ ',
    variacao: 42,
    apoio: 'desde o início',
    tom: 'primary',
  },
] as const

export type KpiParceiro = (typeof KPIS_PARCEIRO)[number]

/** Períodos do seletor do gráfico. O último é o que abre selecionado. */
export const PERIODOS_GRAFICO = ['7D', '30D', '90D', '12M'] as const
export type PeriodoGrafico = (typeof PERIODOS_GRAFICO)[number]

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

/**
 * Série de comissões por período.
 *
 * Os valores são gerados por uma fórmula determinística — nada de `Math.random`,
 * que faria servidor e navegador desenharem gráficos diferentes e quebraria a
 * hidratação. Cada período tem sua própria granularidade para que trocar a aba
 * mude de fato o desenho, e não só o rótulo.
 */
export function serieDeComissoes(periodo: PeriodoGrafico) {
  if (periodo === '12M') {
    return MESES.map((m, i) => ({
      etiqueta: m,
      ganhos: Math.round(800 + i * 230 + Math.sin(i) * 180),
      recorrente: Math.round(400 + i * 180 + Math.cos(i) * 120),
    }))
  }

  if (periodo === '90D') {
    return Array.from({ length: 12 }).map((_, i) => ({
      etiqueta: `S${i + 1}`,
      ganhos: Math.round(620 + i * 96 + Math.sin(i * 0.8) * 140),
      recorrente: Math.round(360 + i * 74 + Math.cos(i * 0.8) * 90),
    }))
  }

  if (periodo === '30D') {
    return Array.from({ length: 10 }).map((_, i) => ({
      etiqueta: `${i * 3 + 1}`,
      ganhos: Math.round(280 + i * 62 + Math.sin(i) * 90),
      recorrente: Math.round(180 + i * 44 + Math.cos(i) * 60),
    }))
  }

  return Array.from({ length: 7 }).map((_, i) => ({
    etiqueta: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i],
    ganhos: Math.round(140 + i * 38 + Math.sin(i) * 46),
    recorrente: Math.round(90 + i * 26 + Math.cos(i) * 30),
  }))
}

/** Cabeçalho do gráfico: acumulado exibido e a comparação. */
export const RESUMO_COMISSOES = {
  acumulado: 48230,
  variacao: 32,
  comparacao: 'vs trimestre anterior',
}

export const CUPOM_PARCEIRO = {
  codigo: 'JUNIOR10',
  /** Sem promessa de comissão extra: essa regra ainda não existe. */
  descricao: '10% de desconto para quem usar seu cupom',
  ativo: true,
  metricas: [
    { rotulo: 'Usos', valor: '142' },
    { rotulo: 'Gerado', valor: 'R$ 18k' },
    { rotulo: 'Conv.', valor: '32%' },
  ],
}

/**
 * O link deixou de ser mock: `base` e `identificador` foram substituídos pelo
 * código real do parceiro, montado em `lib/link-de-indicacao`. Ficam aqui
 * porque a tela ainda usa `visitas30d`, e medir acesso é a próxima fatia.
 */
export const LINK_INDICACAO = {
  visitas30d: 1284,
}

export const PREVISAO_RENDA = {
  clientesAlvo: 40,
  valorAlvo: 8450,
  retencao: 94,
  marcos: [
    { rotulo: 'Hoje', valor: 4812, clientes: 37 },
    { rotulo: '+ 6 meses', valor: 6720, clientes: 32 },
    { rotulo: '+ 12 meses', valor: 8450, clientes: 40, destaque: true },
  ],
}


export const FUNIL = [
  { etapa: 'Visitas no link', valor: 4820, percentual: 100 },
  { etapa: 'Leads qualificados', valor: 612, percentual: 78 },
  { etapa: 'Clientes ativos', valor: 184, percentual: 52 },
  { etapa: 'Recorrentes', valor: 97, percentual: 34 },
]

export const RANKING = [
  { nome: 'Marina Costa', cidade: 'São Paulo', valor: 28430, crescimento: 24, voce: false },
  { nome: 'Rafael Andrade', cidade: 'Curitiba', valor: 24100, crescimento: 18, voce: false },
  { nome: 'Você', cidade: 'Belo Horizonte', valor: 18920, crescimento: 31, voce: true },
  { nome: 'Camila Reis', cidade: 'Recife', valor: 16480, crescimento: 12, voce: false },
  { nome: 'Diego Martins', cidade: 'Porto Alegre', valor: 14250, crescimento: 9, voce: false },
]

export const COMUNIDADE = {
  online: 248,
  iniciais: ['AL', 'MR', 'JS', 'TC', 'PD'],
  restantes: 243,
  atividade: [
    { nome: 'Marina Costa', texto: 'fechou um plano Premium', quando: 'agora' },
    { nome: 'Rafael Andrade', texto: 'compartilhou: como dobrei minha carteira', quando: '5 min' },
    { nome: 'Camila Reis', texto: 'subiu para Ouro', quando: '12 min' },
  ],
}

export const ACADEMIA = [
  { titulo: 'Como captar 10 clientes em 30 dias', detalhe: '8 aulas · 2h', progresso: 75 },
  { titulo: 'Domine o WhatsApp Business', detalhe: '5 aulas · 1h', progresso: 30 },
  { titulo: 'Conteúdo que converte no Instagram', detalhe: '12 aulas · 3h', progresso: 0 },
]

export const MATERIAIS = [
  { id: 'instagram', nome: 'Carrossel Instagram', tipo: '10 artes' },
  { id: 'whatsapp', nome: 'Scripts WhatsApp', tipo: '8 modelos' },
  { id: 'banners', nome: 'Banners web', tipo: '5 formatos' },
  { id: 'reels', nome: 'Reels prontos', tipo: '6 vídeos' },
  { id: 'ebook', nome: 'E-book do parceiro', tipo: 'PDF · 32p' },
] as const

/** Chips flutuantes do Hero, no desktop. */
export const DESTAQUES_HERO = [
  { texto: '+R$ 1.284 esta semana', icone: 'tendencia' },
  { texto: '24 recorrências ativas', icone: 'recorrencia' },
] as const

/** Médias exibidas no bloco do sistema híbrido. */
export const MEDIAS_HIBRIDO = {
  avulso: 'R$ 1.840/mês',
  recorrente: 'R$ 8.450/mês',
}
