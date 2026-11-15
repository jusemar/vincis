/**
 * O vocabulário do contrato recorrente da Vincis.
 *
 * O contrato nasce `aguardando_pagamento` e só vira `ativa` pelo primeiro
 * pagamento confirmado (`lib/pagamentos.ts`) — nunca pelo aceite, pelo tempo
 * ou por pagamento simulado. `cancelada` e `encerrada` são os dois fins
 * possíveis; nada hoje escreve esses dois.
 */
export const STATUS_ASSINATURA = [
  'aguardando_pagamento',
  'ativa',
  'cancelada',
  'encerrada',
] as const
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number]

export const ROTULO_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  ativa: 'Ativa',
  cancelada: 'Cancelada',
  encerrada: 'Encerrada',
}

export const PERIODICIDADES = ['mensal', 'semestral', 'anual'] as const
export type Periodicidade = (typeof PERIODICIDADES)[number]

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
}

/**
 * A forma comercial a partir da duração.
 *
 * A tabela de preços nomeia os prazos como quiser (`seis_meses`, `doze_meses`);
 * o contrato fala a língua do negócio. Duração que não seja 1, 6 ou 12 meses
 * **não** vira contrato: devolve nulo, e a contratação é recusada — inventar uma
 * periodicidade para um prazo desconhecido seria vender algo que a Vincis não
 * definiu.
 */
export function periodicidadeDosMeses(meses: number): Periodicidade | null {
  if (meses === 1) return 'mensal'
  if (meses === 6) return 'semestral'
  if (meses === 12) return 'anual'
  return null
}

/**
 * Planos que a Vincis oferece para contratação em `/precos`.
 *
 * Jurídico e o Pacote Empresarial (Contabilidade + Jurídico) saíram da
 * vitrine: advocacia segue pelo pedido de orçamento ao advogado, fora dos
 * planos pagos. Os serviços continuam no catálogo de precificação, mas a
 * contratação e o Pix recusam qualquer código fora desta lista — esconder a
 * aba não basta, a action pode ser chamada direto.
 */
export const PLANOS_CONTRATAVEIS = ['padrao', 'consultiva'] as const

export function planoContratavel(codigo: string): boolean {
  return (PLANOS_CONTRATAVEIS as readonly string[]).includes(codigo)
}

/**
 * Planos que podem receber Pix: os da vitrine, o Perfil Pro do advogado, o
 * adicional de armazenamento dele e o bloco de +5 GB do contador Autônomo
 * (pagamentos do profissional à Vincis pelo uso da plataforma, contratados no
 * painel — fora de `/precos`, e sem relação com honorários).
 */
export function planoPagavel(codigo: string): boolean {
  return (
    planoContratavel(codigo) ||
    codigo === 'perfil_pro' ||
    codigo === 'perfil_pro_armazenamento' ||
    codigo === 'autonomo_armazenamento'
  )
}
