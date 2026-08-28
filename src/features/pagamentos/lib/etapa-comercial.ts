/**
 * Em que ponto do caminho comercial uma solicitação está.
 *
 * ## Por que isto é derivado, e não uma coluna nova
 *
 * A oportunidade já tem um `status`, e ele responde a **uma** pergunta:
 * *ela ainda recebe propostas?* (`aberta` sim; `encerrada`, `expirada` e
 * `cancelada` não). Essa pergunta é a que a vitrine do prestador, a difusão e o
 * banner fazem, e responder mais do que isso naquela coluna faria o
 * `where status = 'aberta'` de cada consulta ficar errado sozinho.
 *
 * As etapas seguintes — acordo, pagamento, Atendimento — já estão gravadas em
 * fatos com dono: a proposta aceita (`oportunidade_propostas.status`), a linha
 * de `oportunidade_pagamentos` e o `atendimentos.oportunidade_id`. Duplicá-las
 * num enum de status criaria dois lugares capazes de discordar, e o dia em que
 * discordassem o Cliente veria "aguardando pagamento" com o pagamento já feito.
 *
 * Então: uma coluna para a distribuição, uma função para a narrativa. Este
 * arquivo é **puro** — nenhum acesso a banco — para que a tela do Cliente e a do
 * prestador contem a mesma história sem duplicar a regra.
 */

export const ETAPAS_COMERCIAIS = [
  'aberta',
  'aguardando_pagamento',
  'pago',
  'em_atendimento',
  'expirada',
  'cancelada',
  'sem_interesse',
  'encerrada',
] as const

export type EtapaComercial = (typeof ETAPAS_COMERCIAIS)[number]

export const ROTULO_ETAPA_COMERCIAL: Record<EtapaComercial, string> = {
  aberta: 'Aberta',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pagamento aprovado',
  em_atendimento: 'Atendimento criado',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  // Não é recusa à pessoa que pediu, e não é erro: é a agenda de quem foi
  // escolhido. O rótulo diz isso sem adjetivo.
  sem_interesse: 'Sem interesse do profissional',
  encerrada: 'Encerrada',
}

export type SituacaoDaOportunidade = {
  /** Status já resolvido pelo relógio (`statusVisivel`). */
  status: string
  /** Existe proposta aceita — por aceite direto ou por contraproposta. */
  temAcordo: boolean
  /** Existe pagamento aprovado. */
  temPagamento: boolean
  /** O Atendimento já foi aberto. */
  temAtendimento: boolean
  /**
   * Por que a solicitação foi encerrada, quando foi.
   *
   * Só muda a narrativa de um `encerrada` sem acordo: `sem_interesse` conta que
   * o destinatário de uma solicitação privada declinou. Qualquer outro valor —
   * e a ausência dele — mantém o comportamento anterior, caractere por
   * caractere.
   */
  motivoEncerramento?: string | null
}

export function etapaComercial(situacao: SituacaoDaOportunidade): EtapaComercial {
  if (situacao.temAtendimento) return 'em_atendimento'
  if (situacao.temPagamento) return 'pago'
  if (situacao.temAcordo) return 'aguardando_pagamento'
  if (situacao.status === 'aberta') return 'aberta'
  if (situacao.status === 'expirada') return 'expirada'
  if (situacao.status === 'cancelada') return 'cancelada'
  // Encerrada sem acordo tem duas causas, e a diferença importa para quem
  // pediu: o acordo é desfecho, a recusa é ausência de resposta.
  if (situacao.motivoEncerramento === 'sem_interesse') return 'sem_interesse'
  return 'encerrada'
}

/**
 * As quatro etapas que o Cliente acompanha depois de aceitar.
 *
 * A tela mostra sempre as quatro, com a atual destacada e as anteriores
 * concluídas: esconder as futuras deixaria o Cliente sem saber que ainda falta
 * pagar para o trabalho começar.
 */
export const TRILHA_APOS_ACORDO = [
  { etapa: 'aguardando_pagamento', rotulo: 'Proposta aceita' },
  { etapa: 'pago', rotulo: 'Pagamento aprovado' },
  { etapa: 'em_atendimento', rotulo: 'Atendimento criado' },
] as const

/** Posição da etapa atual na trilha. `-1` quando ainda não houve acordo. */
export function posicaoNaTrilha(etapa: EtapaComercial) {
  return TRILHA_APOS_ACORDO.findIndex((passo) => passo.etapa === etapa)
}

/** Ainda falta pagar? É a pergunta que decide o botão "Pagar". */
export function aguardandoPagamento(situacao: SituacaoDaOportunidade) {
  return etapaComercial(situacao) === 'aguardando_pagamento'
}
