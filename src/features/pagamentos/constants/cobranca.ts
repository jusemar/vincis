/**
 * Vocabulário da cobrança Pix real (Efí).
 *
 * Convive com `constants/pagamento.ts`, que descreve a simulação: lá nada
 * passa por dinheiro; aqui tudo passa. As duas origens nunca se misturam — a
 * coluna `origem`/`provedor` de cada registro diz qual é qual.
 */

/** O que uma cobrança pode estar pagando. Espelha o `check` da tabela. */
export const FINALIDADES_COBRANCA = [
  'servico',
  'consultoria',
  'acordo',
  'assinatura',
] as const
export type FinalidadeCobranca = (typeof FINALIDADES_COBRANCA)[number]

/**
 * Estados de uma cobrança.
 *
 * - `gerando`: a linha existe e a Efí ainda está sendo chamada;
 * - `aguardando_pagamento`: QR Code emitido, nenhum Pix recebido;
 * - `paga`: a Efí confirmou o Pix (consulta autenticada, não o navegador);
 * - `expirada`: venceu sem pagamento — a Efí não aceita mais o Pix;
 * - `cancelada`: removida na Efí antes de ser paga;
 * - `falhou`: a Efí recusou emitir. Nada foi cobrado.
 */
export const STATUS_COBRANCA = [
  'gerando',
  'aguardando_pagamento',
  'paga',
  'expirada',
  'cancelada',
  'falhou',
] as const
export type StatusCobranca = (typeof STATUS_COBRANCA)[number]

export const ROTULO_STATUS_COBRANCA: Record<StatusCobranca, string> = {
  gerando: 'Gerando cobrança',
  aguardando_pagamento: 'Aguardando pagamento',
  paga: 'Pagamento confirmado',
  expirada: 'Pix expirado',
  cancelada: 'Cobrança cancelada',
  falhou: 'Não foi possível gerar a cobrança',
}

/**
 * Validade do Pix por finalidade, em segundos.
 *
 * Consultoria é curta porque segura um horário que outra pessoa poderia
 * comprar: a reserva é estendida para cobrir exatamente esta janela (mais a
 * folga de `FOLGA_RESERVA_APOS_PIX_SEGUNDOS`). Serviço, acordo e plano não
 * prendem nada de ninguém e podem esperar uma hora.
 */
export const EXPIRACAO_PIX_SEGUNDOS: Record<FinalidadeCobranca, number> = {
  servico: 60 * 60,
  consultoria: 15 * 60,
  acordo: 60 * 60,
  assinatura: 60 * 60,
}

/**
 * Quanto a reserva do horário sobrevive depois de o Pix vencer.
 *
 * O Pix pago no último segundo pode ter o aviso da Efí atrasado; a folga
 * garante que o horário ainda é desse Cliente quando a confirmação chegar.
 */
export const FOLGA_RESERVA_APOS_PIX_SEGUNDOS = 5 * 60

/**
 * Intervalo mínimo entre duas consultas à Efí pela mesma cobrança.
 *
 * O navegador pergunta a cada poucos segundos; a Efí não precisa ouvir cada
 * pergunta. Abaixo disso a resposta vem do banco.
 */
export const INTERVALO_MINIMO_CONSULTA_EFI_MS = 5_000

/** De quanto em quanto tempo a tela de pagamento pergunta pela situação. */
export const INTERVALO_POLLING_COBRANCA_MS = 4_000

/** Uma `gerando` parada há mais que isto é retomada (o PUT é idempotente). */
export const GERACAO_TRAVADA_APOS_MS = 30_000

/** A Efí não respondeu (rede, tempo esgotado, 5xx). Transitório. */
export const MENSAGEM_PIX_INDISPONIVEL =
  'O pagamento por Pix está indisponível no momento. Nada foi cobrado. Tente novamente em instantes.'

/** O ambiente não tem a Efí configurada. Tentar de novo não resolve. */
export const MENSAGEM_PIX_NAO_CONFIGURADO =
  'O pagamento por Pix ainda não está configurado neste ambiente. Nada foi cobrado. Avise o suporte da Vincis.'

/** A Efí respondeu e recusou emitir a cobrança (4xx). */
export const MENSAGEM_PIX_RECUSADO =
  'A instituição de pagamento recusou gerar este Pix. Nada foi cobrado. Se persistir, avise o suporte da Vincis.'
