'use server'

import { revalidatePath } from 'next/cache'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { encerrarSemConclusao } from '../lib/encerrar-sem-conclusao'
import { EncerrarSemConclusaoSchema } from '../schemas/encerramento'

/**
 * Encerrar um Atendimento parado sem conclusão — só o Gestor da Plataforma.
 *
 * A guarda vem antes de tudo, inclusive da validação: um id de Atendimento
 * enviado por Profissional, Colaborador ou Cliente não chega ao banco. Esconder
 * o botão não é autorização; esta linha é.
 */
export async function encerrarAtendimentoSemConclusao(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return SEM_AUTORIZACAO

  const validacao = EncerrarSemConclusaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const resultado = await encerrarSemConclusao({
    ...validacao.data,
    gestorId: gestor.id,
  })
  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem:
        resultado.motivo === 'ja-encerrado'
          ? 'Este atendimento já está encerrado.'
          : 'Atendimento não encontrado.',
    }
  }

  revalidatePath('/admin/atendimentos-parados')
  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: `Atendimento ${resultado.protocolo} encerrado sem conclusão.`,
  }
}
