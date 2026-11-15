'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { configuracoesPlataforma } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import {
  CHAVE_COMISSAO_SERVICOS_AVULSOS,
  COMISSAO_MAXIMA_MILESIMOS,
  COMISSAO_MINIMA_MILESIMOS,
  formatarPercentualMilesimos,
} from '../constants/comissao'
import { lerComissaoServicosAvulsos } from '../queries/comissao-vincis'

/** "20", "12,5" ou "12.5" → milésimos (até uma casa decimal). */
const ComissaoSchema = z.object({
  percentual: z
    .string()
    .trim()
    .regex(/^\d{1,2}([.,]\d)?$/, 'Informe um percentual entre 0,1 e 99,9, com até uma casa decimal.')
    .transform((texto) => Math.round(Number(texto.replace(',', '.')) * 10))
    .pipe(
      z
        .number()
        .int()
        .min(COMISSAO_MINIMA_MILESIMOS, 'A comissão mínima é 0,1%.')
        .max(COMISSAO_MAXIMA_MILESIMOS, 'A comissão máxima é 99,9%.'),
    ),
})

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestão define a comissão da Vincis nos serviços avulsos.
 *
 * Vale para cobranças **novas**: cada contratação guarda o percentual com que
 * o Pix foi emitido, então mudar aqui não reescreve contratação antiga. A
 * mudança fica no log de auditoria com o antes e o depois — é o histórico do
 * percentual.
 */
export async function definirComissaoServicosAvulsos(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const validacao = ComissaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Percentual inválido.' }
  }
  const milesimos = validacao.data.percentual
  const anterior = await lerComissaoServicosAvulsos()
  if (anterior === milesimos) {
    return { sucesso: true as const, mensagem: 'Comissão mantida.' }
  }

  const ip = await ipDaRequisicao()
  await db.transaction(async (tx) => {
    await tx
      .insert(configuracoesPlataforma)
      .values({ chave: CHAVE_COMISSAO_SERVICOS_AVULSOS, valor: String(milesimos), atualizadoPor: gestor.id })
      .onConflictDoUpdate({
        target: configuracoesPlataforma.chave,
        set: { valor: String(milesimos), atualizadoPor: gestor.id, updatedAt: new Date() },
      })
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.comissaoServicosAvulsosAlterada,
        entidade: 'configuracoes_plataforma',
        registroAfetado: null,
        autorId: gestor.id,
        usuarioId: gestor.id,
        origem: 'gestao_vincis',
        ip,
        metadados: { chave: CHAVE_COMISSAO_SERVICOS_AVULSOS, anteriorMilesimos: anterior, novoMilesimos: milesimos },
      },
      tx,
    )
  })

  revalidatePath('/admin/central')
  return {
    sucesso: true as const,
    mensagem: `Comissão da Vincis (avulsos e planos) definida em ${formatarPercentualMilesimos(milesimos)}.`,
  }
}
