/**
 * Motor de preços do configurador de `/precos`.
 *
 * Ainda não existe regra de negócio de precificação definida para os planos
 * da plataforma (o que existe em `features/servicos` é o catálogo de serviços
 * avulsos de cada profissional — um domínio diferente). Os valores-base,
 * fatores e descontos abaixo são demonstrativos, isolados nesta única
 * tabela para que sejam fáceis de substituir por uma fonte real (API,
 * configuração de admin) mais adiante sem tocar nos componentes.
 */

export type FrameworkId = "mei" | "simples" | "presumido" | "real";
export type SectorId = "servicos" | "comercio" | "industria";
export type InvoiceRangeId = "ate10" | "11a30" | "31a100" | "101a250" | "mais250";
export type RevenueRangeId = "ate50k" | "50a150k" | "150a500k" | "500ka1m" | "acima1m";
export type InvoiceIssuerId = "empresa" | "vincis";
export type SupportId = "digital" | "hibrido" | "prioritario";
export type RoutineId = "compartilhado" | "vincis";
export type AddonId =
  | "emissao_extra"
  | "reuniao_mensal"
  | "suporte_prioritario"
  | "especialista_dedicado";
export type OfferId = "padrao" | "consultiva" | "juridico" | "combo";
export type PeriodId = "mensal" | "seis_meses" | "doze_meses";

export interface Answers {
  framework: FrameworkId;
  sectors: SectorId[];
  employees: number;
  invoiceRange: InvoiceRangeId;
  invoiceIssuer: InvoiceIssuerId;
  revenueRange: RevenueRangeId;
  support: SupportId;
  routine: RoutineId;
  addons: AddonId[];
}

export const defaultAnswers: Answers = {
  framework: "simples",
  sectors: ["servicos"],
  employees: 3,
  invoiceRange: "11a30",
  invoiceIssuer: "vincis",
  revenueRange: "ate50k",
  support: "hibrido",
  routine: "compartilhado",
  addons: [],
};

/* ------------------------------------------------------------- opções */

export const frameworks: { id: FrameworkId; label: string; hint: string }[] = [
  { id: "mei", label: "MEI", hint: "Faturamento até R$ 81 mil/ano" },
  { id: "simples", label: "Simples Nacional", hint: "O regime mais comum" },
  { id: "presumido", label: "Lucro Presumido", hint: "Apuração trimestral" },
  { id: "real", label: "Lucro Real", hint: "Estrutura contábil completa" },
];

export const sectors: { id: SectorId; label: string }[] = [
  { id: "servicos", label: "Serviços" },
  { id: "comercio", label: "Comércio" },
  { id: "industria", label: "Indústria" },
];

/**
 * Faixas de notas fiscais e faturamento — conceituais por enquanto, mas
 * isoladas em listas próprias para poderem ser reconfiguradas (ou vir de uma
 * API) sem alterar os componentes que as consomem.
 */
export const invoiceRanges: { id: InvoiceRangeId; label: string }[] = [
  { id: "ate10", label: "Até 10" },
  { id: "11a30", label: "11 a 30" },
  { id: "31a100", label: "31 a 100" },
  { id: "101a250", label: "101 a 250" },
  { id: "mais250", label: "Mais de 250" },
];

export const revenueRanges: { id: RevenueRangeId; label: string }[] = [
  { id: "ate50k", label: "Até R$ 50 mil" },
  { id: "50a150k", label: "R$ 50 mil a R$ 150 mil" },
  { id: "150a500k", label: "R$ 150 mil a R$ 500 mil" },
  { id: "500ka1m", label: "R$ 500 mil a R$ 1 milhão" },
  { id: "acima1m", label: "Acima de R$ 1 milhão" },
];

export const invoiceIssuers: { id: InvoiceIssuerId; label: string }[] = [
  { id: "empresa", label: "Minha empresa" },
  { id: "vincis", label: "Vincis" },
];

export const supports: { id: SupportId; label: string; desc: string }[] = [
  { id: "digital", label: "100% digital", desc: "Chat e e-mail, resposta em até 9h" },
  { id: "hibrido", label: "Híbrido", desc: "Chat, telefone e reuniões em grupo" },
  { id: "prioritario", label: "Atendimento prioritário", desc: "WhatsApp direto e reuniões 1:1" },
];

export const routines: { id: RoutineId; label: string; desc: string }[] = [
  { id: "compartilhado", label: "Eu cuido de parte da rotina", desc: "Envio documentos e acompanho de perto" },
  { id: "vincis", label: "Quero que a Vincis cuide", desc: "Rotina conduzida pelo time Vincis de ponta a ponta" },
];

export const addons: { id: AddonId; label: string; desc: string; monthly: number }[] = [
  { id: "emissao_extra", label: "Emissão de notas avulsas extra", desc: "Além da faixa contratada", monthly: 39 },
  { id: "reuniao_mensal", label: "Reunião mensal 1:1", desc: "Com o profissional responsável", monthly: 59 },
  { id: "suporte_prioritario", label: "Suporte prioritário", desc: "Resposta garantida em até 2h", monthly: 49 },
  { id: "especialista_dedicado", label: "Especialista dedicado", desc: "Ponto de contato fixo", monthly: 149 },
];

export const periods: { id: PeriodId; label: string; months: number }[] = [
  { id: "mensal", label: "Mensal", months: 1 },
  { id: "seis_meses", label: "6 meses", months: 6 },
  { id: "doze_meses", label: "12 meses", months: 12 },
];

/** Descontos por período de fechamento — parametrizáveis. */
export const PERIOD_DISCOUNTS: Record<PeriodId, number> = {
  mensal: 0,
  seis_meses: 0.08,
  doze_meses: 0.15,
};

/** Desconto do Pacote Empresarial Completo sobre a soma dos serviços separados. */
export const COMBO_DISCOUNT = 0.15;

/* ------------------------------------------------------------ cálculo */

const accountingBase: Record<FrameworkId, number> = {
  mei: 89,
  simples: 195,
  presumido: 389,
  real: 749,
};

const legalBase: Record<FrameworkId, number> = {
  mei: 69,
  simples: 149,
  presumido: 229,
  real: 379,
};

const CONSULTIVA_MULTIPLIER = 1.35;

const sectorFactor: Record<SectorId, number> = {
  servicos: 1,
  comercio: 1.08,
  industria: 1.18,
};

const supportFactor: Record<SupportId, number> = {
  digital: 1,
  hibrido: 1.07,
  prioritario: 1.2,
};

const routineFactor: Record<RoutineId, number> = {
  compartilhado: 1,
  vincis: 1.14,
};

const invoiceRangeCost: Record<InvoiceRangeId, number> = {
  ate10: 0,
  "11a30": 25,
  "31a100": 70,
  "101a250": 160,
  mais250: 320,
};

const revenueRangeCost: Record<RevenueRangeId, number> = {
  ate50k: 0,
  "50a150k": 60,
  "150a500k": 180,
  "500ka1m": 340,
  acima1m: 620,
};

function round5(n: number) {
  return Math.round(n / 5) * 5;
}

export interface PriceLine {
  label: string;
  value: number;
}

export interface OfferPeriodPrice {
  period: PeriodId;
  monthlyEquivalent: number;
  savingsVsMonthly: number;
}

export interface OfferPrice {
  offer: OfferId;
  lines: PriceLine[];
  baseMonthly: number;
  periods: OfferPeriodPrice[];
}

function baseBreakdown(offer: Exclude<OfferId, "combo">, a: Answers): PriceLine[] {
  const lines: PriceLine[] = [];

  if (offer === "juridico") {
    const base = legalBase[a.framework];
    lines.push({ label: "Preço base", value: round5(base) });

    const staff = Math.max(0, a.employees - 2) * 9;
    if (staff) lines.push({ label: "Risco trabalhista da equipe", value: staff });

    return lines;
  }

  const accountingBaseValue = accountingBase[a.framework];
  const base = offer === "consultiva" ? accountingBaseValue * CONSULTIVA_MULTIPLIER : accountingBaseValue;
  lines.push({ label: "Preço base", value: round5(base) });

  const staff = Math.max(0, a.employees - 2) * 24;
  if (staff) lines.push({ label: `Funcionários (${a.employees})`, value: staff });

  const notes = a.invoiceIssuer === "vincis" ? invoiceRangeCost[a.invoiceRange] : 0;
  if (notes) lines.push({ label: "Emissão de notas fiscais", value: notes });

  const revenue = revenueRangeCost[a.revenueRange];
  if (revenue) lines.push({ label: "Volume de faturamento", value: revenue });

  return lines;
}

function applyFactors(lines: PriceLine[], offer: Exclude<OfferId, "combo">, a: Answers): number {
  let total = lines.reduce((sum, l) => sum + l.value, 0);

  if (offer !== "juridico") {
    total *= sectorFactor[a.sectors[0] ?? "servicos"];
    total *= routineFactor[a.routine];
  }

  total *= supportFactor[a.support];
  return total;
}

function addonsMonthly(a: Answers): PriceLine[] {
  return a.addons.map((id) => {
    const addon = addons.find((x) => x.id === id)!;
    return { label: addon.label, value: addon.monthly };
  });
}

function periodPricesFor(monthlyTotal: number): OfferPeriodPrice[] {
  return periods.map((p) => {
    const discount = PERIOD_DISCOUNTS[p.id];
    const monthlyEquivalent = round5(monthlyTotal * (1 - discount));
    return {
      period: p.id,
      monthlyEquivalent,
      savingsVsMonthly: round5(monthlyTotal - monthlyEquivalent),
    };
  });
}

export function priceForOffer(offer: OfferId, a: Answers): OfferPrice {
  if (offer === "combo") {
    const consultiva = priceForOffer("consultiva", a);
    const juridico = priceForOffer("juridico", a);
    const separado = consultiva.baseMonthly + juridico.baseMonthly;
    const comboMonthly = round5(separado * (1 - COMBO_DISCOUNT));

    const lines: PriceLine[] = [
      { label: "Contabilidade Consultiva", value: consultiva.baseMonthly },
      { label: "Assistência Jurídica", value: juridico.baseMonthly },
      { label: "Desconto do combo", value: -round5(separado - comboMonthly) },
    ];

    return {
      offer,
      lines,
      baseMonthly: comboMonthly,
      periods: periodPricesFor(comboMonthly),
    };
  }

  const base = baseBreakdown(offer, a);
  const extra = addonsMonthly(a);
  const lines = [...base, ...extra];

  // Fatores (setor/atendimento/rotina) incidem só sobre a rotina "core";
  // adicionais somam pelo valor cheio, sem multiplicador.
  const coreTotal = applyFactors(base, offer, a);
  const addonsTotal = extra.reduce((s, l) => s + l.value, 0);
  const total = round5(coreTotal + addonsTotal);

  return {
    offer,
    lines,
    baseMonthly: total,
    periods: periodPricesFor(total),
  };
}

export function currency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/* ------------------------------------------------------- comparativo */

export interface FeatureRow {
  label: string;
  values: Partial<Record<OfferId, string | boolean>>;
}

export interface FeatureGroup {
  group: string;
  rows: FeatureRow[];
}

export const comparisonGroups: FeatureGroup[] = [
  {
    group: "Rotinas contábeis",
    rows: [
      { label: "Escrituração fiscal e contábil", values: { padrao: true, consultiva: true, combo: true } },
      { label: "Folha de pagamento", values: { padrao: true, consultiva: true, combo: true } },
      { label: "Obrigações acessórias", values: { padrao: true, consultiva: true, combo: true } },
      { label: "Emissão de notas fiscais", values: { padrao: "Opcional", consultiva: "Opcional", combo: "Opcional" } },
    ],
  },
  {
    group: "Consultoria",
    rows: [
      { label: "Reuniões de acompanhamento", values: { padrao: "—", consultiva: "Mensal", combo: "Mensal" } },
      { label: "Análise e orientação estratégica", values: { padrao: false, consultiva: true, combo: true } },
      { label: "Apoio à tomada de decisão", values: { padrao: false, consultiva: true, combo: true } },
    ],
  },
  {
    group: "Assistência jurídica",
    rows: [
      { label: "Consultas jurídicas", values: { juridico: true, combo: true } },
      { label: "Elaboração e revisão de contratos", values: { juridico: true, combo: true } },
      { label: "Notificações extrajudiciais", values: { juridico: true, combo: true } },
      { label: "Suporte trabalhista e societário", values: { juridico: true, combo: true } },
    ],
  },
  {
    group: "Atendimento",
    rows: [
      { label: "Canal de atendimento", values: { padrao: "Conforme escolhido", consultiva: "Conforme escolhido", juridico: "Conforme escolhido", combo: "Conforme escolhido" } },
      { label: "Especialista dedicado", values: { padrao: "Opcional", consultiva: "Opcional", juridico: "Opcional", combo: "Opcional" } },
    ],
  },
];

export function comparisonOffersFor(offer: OfferId): OfferId[] {
  if (offer === "juridico") return ["juridico"];
  if (offer === "combo") return ["combo"];
  return ["padrao", "consultiva"];
}
