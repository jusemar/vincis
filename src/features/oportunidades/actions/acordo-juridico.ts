'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { oportunidadePropostas, oportunidades } from '@/db/schema'
import { garantirAtendimentoDaOportunidade } from '@/features/atendimentos/lib/criar-atendimento-da-oportunidade'
import { prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import { SEM_AUTORIZACAO, semPermissaoPara } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

const Schema = z.object({ oportunidadeId: z.string().uuid('Solicitação inválida.') })

/**
 * Abre o Atendimento de um acordo jurídico já fechado.
 *
 * Hoje o aceite de proposta de advogado abre o Atendimento na hora (sem etapa
 * de pagamento). Acordos aceitos antes dessa regra ficaram parados "esperando
 * pagamento" que a Vincis não processa mais — esta ação os destrava. Só o
 * Cliente dono, só com proposta aceita e só para advogado; idempotente pelo
 * índice único do Atendimento. Não cria pagamento, cobrança nem status financeiro.
 */
export async function abrirAtendimentoDoAcordoJuridico(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO
  const validacao = Schema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Solicitação inválida.' }

  const [acordo] = await db
    .select({
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      prestadorId: oportunidadePropostas.prestadorId,
    })
    .from(oportunidades)
    .innerJoin(oportunidadePropostas, eq(oportunidadePropostas.oportunidadeId, oportunidades.id))
    .where(and(eq(oportunidades.id, validacao.data.oportunidadeId), eq(oportunidadePropostas.status, 'aceita')))
    .limit(1)
  if (!acordo) return { sucesso: false as const, mensagem: 'Esta solicitação não tem acordo fechado.' }
  if (acordo.clienteUsuarioId !== sessao.id) return semPermissaoPara('abrir este atendimento')
  if (!(await prestadorCobraDiretamente(db, acordo.prestadorId))) {
    return { sucesso: false as const, mensagem: 'Este acordo segue o fluxo com pagamento.' }
  }

  const atendimento = await garantirAtendimentoDaOportunidade(db, validacao.data.oportunidadeId)
  revalidatePath('/cliente')
  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: `Atendimento ${atendimento.protocolo} aberto.`, atendimentoId: atendimento.id }
}
