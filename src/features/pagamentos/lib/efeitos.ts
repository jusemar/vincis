import { confirmarAssinaturaPaga } from '@/features/assinaturas/lib/pagamento-pix'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { confirmarConsultoriaPaga } from '@/features/consultorias/lib/efetivar-consultoria'
import { efetivarContratacaoPaga } from '@/features/servicos/lib/efetivar-contratacao'
import type { FinalidadeCobranca } from '../constants/cobranca'
import type { AplicarEfeito, CobrancaPaga, ResultadoEfeito } from '../types/efeito'
import { efetivarAcordoPago } from './acordo'

/**
 * Quem produz o efeito de cada finalidade.
 *
 * O núcleo de pagamentos não sabe o que é contratação, agenda ou plano: ele só
 * despacha. Cada regra mora no domínio dono dela — serviço em `servicos`,
 * horário em `consultorias`, plano em `assinaturas` —, e uma finalidade nova é
 * uma linha aqui mais a função no domínio.
 */
const EFEITOS: Record<FinalidadeCobranca, AplicarEfeito> = {
  servico: efetivarContratacaoPaga,
  consultoria: confirmarConsultoriaPaga,
  acordo: efetivarAcordoPago,
  assinatura: confirmarAssinaturaPaga,
}

export function aplicarEfeitoDaCobranca(
  tx: TransacaoDb,
  cobranca: CobrancaPaga,
): Promise<ResultadoEfeito> {
  const aplicar = EFEITOS[cobranca.finalidade as FinalidadeCobranca]
  if (!aplicar) {
    return Promise.resolve({ efeito: 'conflito', motivo: 'Finalidade de cobrança desconhecida.' })
  }
  return aplicar(tx, cobranca)
}
