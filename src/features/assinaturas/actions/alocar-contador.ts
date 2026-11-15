'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { AlocacaoRecusada, definirContadorResponsavel } from '../lib/contador-responsavel'
import { AlocarContadorSchema } from '../schemas/alocacao'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestor aloca (primeira vez) ou troca o contador responsável de um plano.
 *
 * Só a Gestão Vincis. A regra inteira — elegibilidade, trava, histórico e
 * auditoria — mora em `definirContadorResponsavel`; aqui ficam sessão,
 * validação e a resposta para a tela.
 */
export async function alocarContadorResponsavel(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const validacao = AlocarContadorSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  }
  const { assinaturaId, contadorId, motivo } = validacao.data
  const ip = await ipDaRequisicao()

  try {
    const resultado = await db.transaction((tx) =>
      definirContadorResponsavel(tx, {
        assinaturaId,
        contadorId,
        origem: 'gestor',
        alteradoPorId: gestor.id,
        motivo,
        ip,
      }),
    )
    revalidatePath('/admin/planos')
    if (!resultado.alterou) {
      return { sucesso: true as const, mensagem: 'Este contador já é o responsável pelo plano.' }
    }
    return {
      sucesso: true as const,
      mensagem: resultado.anteriorId ? 'Contador responsável trocado.' : 'Contador responsável alocado.',
    }
  } catch (erro) {
    if (erro instanceof AlocacaoRecusada) return { sucesso: false as const, mensagem: erro.message }
    console.error('[ALOCAR_CONTADOR]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return { sucesso: false as const, mensagem: 'Não foi possível salvar. Tente novamente.' }
  }
}
