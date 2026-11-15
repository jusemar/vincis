'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { CancelamentoRecusado, cancelarPlano, type ResultadoDoCancelamento } from '../lib/cancelamento'
import { CancelarMeuPlanoSchema, CancelarPlanoGestaoSchema } from '../schemas/cancelamento'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

type Resposta =
  | { sucesso: true; mensagem: string; dados: { canceladoEm: string; jaEstavaCancelado: boolean } }
  | { sucesso: false; mensagem: string }

async function executar(acao: () => Promise<ResultadoDoCancelamento>): Promise<Resposta> {
  try {
    const resultado = await acao()
    revalidatePath('/cliente/conta')
    revalidatePath('/admin/planos')
    revalidatePath('/admin/meus-clientes-vincis')
    return {
      sucesso: true,
      mensagem: resultado.jaEstavaCancelado ? 'Este plano já estava cancelado.' : 'Plano cancelado.',
      dados: { canceladoEm: resultado.canceladoEm.toISOString(), jaEstavaCancelado: resultado.jaEstavaCancelado },
    }
  } catch (erro) {
    if (erro instanceof CancelamentoRecusado) return { sucesso: false, mensagem: erro.message }
    console.error('[CANCELAR_PLANO]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return { sucesso: false, mensagem: 'Não foi possível cancelar o plano. Tente novamente.' }
  }
}

/**
 * O cliente cancela o próprio plano recorrente.
 *
 * Só o dono (o servidor confere pela sessão, nunca pelo id enviado). Não mexe
 * na conta do usuário nem em nada histórico — ver `lib/cancelamento.ts`.
 */
export async function cancelarMeuPlano(entrada: unknown): Promise<Resposta> {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { sucesso: false, mensagem: 'Entre na sua conta para continuar.' }
  const validacao = CancelarMeuPlanoSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false, mensagem: 'Plano inválido.' }
  const ip = await ipDaRequisicao()
  return executar(() =>
    cancelarPlano({
      assinaturaId: validacao.data.assinaturaId,
      origem: 'cliente',
      autorId: sessao.id,
      clienteUsuarioId: sessao.id,
      motivo: 'Solicitação do cliente',
      ip,
    }),
  )
}

/** A Gestão cancela um plano, com motivo obrigatório. */
export async function cancelarPlanoPelaGestao(entrada: unknown): Promise<Resposta> {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false, mensagem: 'Operação não autorizada.' }
  const validacao = CancelarPlanoGestaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  }
  const ip = await ipDaRequisicao()
  return executar(() =>
    cancelarPlano({
      assinaturaId: validacao.data.assinaturaId,
      origem: 'gestor',
      autorId: gestor.id,
      motivo: validacao.data.motivo,
      ip,
    }),
  )
}
