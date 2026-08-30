import type { ServicoTab } from '../types'

/**
 * O que muda entre os serviços, na tabela abaixo dos preços.
 *
 * É conteúdo comercial, não preço: nenhuma linha daqui entra em nenhuma conta.
 * Por isso ficou no código, ao lado da tela que a desenha, quando os valores
 * foram para o banco — colocar texto de vitrine numa tabela de precificação
 * misturaria duas coisas que mudam por motivos diferentes e em ritmos
 * diferentes.
 */
export type OfertaComparada = 'padrao' | 'consultiva' | 'juridico' | 'combo'

export const ROTULO_DA_OFERTA: Record<OfertaComparada, string> = {
  padrao: 'Padrão',
  consultiva: 'Consultiva',
  juridico: 'Jurídico',
  combo: 'Completo',
}

export interface LinhaComparativo {
  label: string;
  values: Partial<Record<OfertaComparada, string | boolean>>;
}

export interface GrupoComparativo {
  group: string;
  rows: LinhaComparativo[];
}

export const GRUPOS_COMPARATIVO: GrupoComparativo[] = [
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

export function ofertasComparadas(tab: ServicoTab): OfertaComparada[] {
  if (tab === "juridico") return ["juridico"];
  if (tab === "combo") return ["combo"];
  return ["padrao", "consultiva"];
}
