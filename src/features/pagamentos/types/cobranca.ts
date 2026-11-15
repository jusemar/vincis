import type { FinalidadeCobranca, StatusCobranca } from '../constants/cobranca'

/**
 * A cobrança como a tela precisa dela.
 *
 * Só o que o pagador vê: valor, QR Code, Copia e Cola, validade, situação e —
 * depois de paga — o protocolo. txid, `end_to_end_id`, contexto e prestador
 * ficam no servidor.
 */
export type CobrancaPixDTO = {
  id: string
  finalidade: FinalidadeCobranca
  status: StatusCobranca
  valorCentavos: number
  descricao: string
  pixCopiaECola: string | null
  qrCodeImagem: string | null
  expiraEm: Date | null
  pagaEm: Date | null
  /** `conflito` = pago, mas o efeito não pôde acontecer (estorno manual). */
  efeito: 'aplicado' | 'conflito' | null
  atendimentoId: string | null
  protocolo: string | null
}

/** Resposta das ações que abrem ou consultam cobrança. */
export type ResultadoCobranca =
  | { situacao: 'ok'; cobranca: CobrancaPixDTO }
  | { situacao: 'gerando'; mensagem: string }
  | { situacao: 'indisponivel'; mensagem: string }
  | { situacao: 'nao_encontrada'; mensagem: string }
