'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { formatarValorRepasse } from '../lib/formato'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { ROTULO_SITUACAO_REPASSE } from '../constants/repasse'
import { registrarRepasse } from '../lib/registrar-repasse'
import { RegistrarRepasseSchema } from '../schemas/repasse'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestão registra o repasse manual feito ao profissional.
 *
 * Somente o Gestor da Vincis. A conferência de pagamento, prestação,
 * cancelamento, estorno e duplicidade acontece no domínio, sob trava.
 */
export async function registrarRepasseProfissional(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const validacao = RegistrarRepasseSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  }
  const { repasseId, repassadoEm, comprovante, observacao } = validacao.data

  const resultado = await registrarRepasse({
    repasseId,
    gestorId: gestor.id,
    // Meio-dia UTC: a data escolhida não muda de dia em nenhum fuso do Brasil.
    repassadoEm: new Date(`${repassadoEm}T12:00:00Z`),
    comprovante,
    observacao: observacao?.trim() ? observacao.trim() : null,
    ip: await ipDaRequisicao(),
  })

  if (!resultado.ok) {
    const mensagem =
      resultado.motivo === 'ja_repassado'
        ? 'Este repasse já foi registrado.'
        : resultado.motivo === 'data_futura'
          ? 'A data do repasse não pode ser futura.'
          : resultado.motivo === 'nao_disponivel'
            ? `Este valor não está disponível para repasse (situação atual: ${ROTULO_SITUACAO_REPASSE[resultado.situacao]}).`
            : 'Repasse não encontrado.'
    revalidatePath('/admin/repasses')
    return { sucesso: false as const, mensagem }
  }

  revalidatePath('/admin/repasses')
  return {
    sucesso: true as const,
    mensagem: `Repasse de ${formatarValorRepasse(resultado.valorProfissionalCentavos)} registrado.`,
  }
}
