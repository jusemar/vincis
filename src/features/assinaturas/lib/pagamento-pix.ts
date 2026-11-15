import { revalidatePath } from 'next/cache'
import type { AplicarEfeito } from '@/features/pagamentos/types/efeito'
import { PROVEDOR_EFI } from '../constants/pagamento'
import { confirmarPagamentoDeAssinatura } from './pagamentos'

/**
 * Efeito do Pix confirmado de um plano da Vincis.
 *
 * Não reinventa nada: entrega o dinheiro confirmado ao caminho único que já
 * existia para isso, `confirmarPagamentoDeAssinatura` — que cobre as
 * competências, ativa a vigência no primeiro pagamento e cuida do programa de
 * parceiros. A identidade do evento é o txid da cobrança (`provedor = efi`),
 * então webhook repetido devolve `repetido` em vez de cobrir o mês duas vezes.
 *
 * ## Por que fora da transação da cobrança
 *
 * `confirmarPagamentoDeAssinatura` abre a própria transação, com a trava da
 * assinatura e o retry de deadlock dela. Como é idempotente pelo txid, se a
 * transação da cobrança falhar depois, a próxima confirmação reencontra o
 * pagamento já registrado e marca a cobrança paga — sem segunda cobertura.
 *
 * Recusa (valor que deixou de bater, contrato cancelado) vira `conflito`: o
 * dinheiro entrou e a equipe precisa estornar ou ajustar à mão.
 */
/** O número do mês gravado no contexto da cobrança, quando houver. */
export function competenciaDaCobranca(contexto: unknown): number | null {
  if (typeof contexto !== 'object' || contexto === null) return null
  const numero = (contexto as { competenciaNumero?: unknown }).competenciaNumero
  return typeof numero === 'number' && Number.isInteger(numero) && numero > 0 ? numero : null
}

export const confirmarAssinaturaPaga: AplicarEfeito = async (_tx, cobranca) => {
  const resultado = await confirmarPagamentoDeAssinatura({
    assinaturaId: cobranca.referenciaId,
    provedor: PROVEDOR_EFI,
    idExterno: cobranca.txid,
    valorCentavos: cobranca.valorCentavos,
    confirmadoEm: cobranca.pagaEm ?? new Date(),
    autorId: null,
    // O mês para o qual o Pix foi emitido (mensalidade). Pix antigos não têm.
    competenciaNumero: competenciaDaCobranca(cobranca.contexto),
  })

  if (!resultado.ok) {
    return { efeito: 'conflito', motivo: `Assinatura recusou o pagamento: ${resultado.motivo}.` }
  }

  return {
    efeito: 'aplicado',
    referenciaId: resultado.pagamentoId,
    atendimentoId: null,
    protocolo: null,
    novo: !resultado.repetido,
    aposConfirmar: async () => {
      revalidatePath('/cliente')
      revalidatePath('/precos')
    },
  }
}
