'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { configuracoesPlataforma, parceiroPrazos } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { CHAVE_PRAZO_PARCEIRO } from '@/features/configuracoes/lib/configuracoes'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  PRAZO_MAXIMO_DIAS,
  PRAZO_MINIMO_DIAS,
  referenciaDePrazoValida,
  rotuloDaReferencia,
} from '../constants/prazo'

const ROTA_PARCEIROS_ADMIN = '/admin/parceiros'

const Dias = z.coerce
  .number()
  .int('Informe um número inteiro de dias.')
  .min(PRAZO_MINIMO_DIAS, `O prazo mínimo é de ${PRAZO_MINIMO_DIAS} dia.`)
  .max(PRAZO_MAXIMO_DIAS, `O prazo máximo é de ${PRAZO_MAXIMO_DIAS} dias.`)

const PrazoPadraoSchema = z.object({ dias: Dias })

const PrazoDoServicoSchema = z.object({
  referencia: z
    .string()
    .refine(referenciaDePrazoValida, 'Serviço desconhecido.'),
  dias: Dias,
})

/**
 * Define o prazo padrão das indicações de parceiro.
 *
 * Só a Gestão Vincis: é regra da plataforma, não do escritório de ninguém. A
 * alteração vale para as indicações **futuras** — as que já existem carregam o
 * próprio `prazo_dias`, congelado no nascimento, e nenhuma consulta volta aqui
 * depois disso.
 *
 * A trilha guarda o valor anterior e o novo. `updated_at` diria só que mudou;
 * como este número vai lastrear comissão, uma atribuição contestada precisa
 * poder ser explicada.
 */
export async function definirPrazoPadraoDeParceiro(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) return SEM_AUTORIZACAO

  const validacao = PrazoPadraoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Prazo inválido.',
    }
  }
  const { dias } = validacao.data

  const [anterior] = await db
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_PRAZO_PARCEIRO))
    .limit(1)

  await db
    .insert(configuracoesPlataforma)
    .values({
      chave: CHAVE_PRAZO_PARCEIRO,
      valor: String(dias),
      atualizadoPor: sessao.id,
    })
    .onConflictDoUpdate({
      target: configuracoesPlataforma.chave,
      set: { valor: String(dias), atualizadoPor: sessao.id, updatedAt: new Date() },
    })

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.prazoParceiroAlterado,
    entidade: 'parceiro_prazo_padrao',
    autorId: sessao.id,
    origem: 'gestao_vincis',
    metadados: {
      escopo: 'padrao',
      valorAnterior: anterior?.valor ?? null,
      valorNovo: String(dias),
    },
  })

  revalidatePath(ROTA_PARCEIROS_ADMIN)
  return {
    sucesso: true as const,
    mensagem: `Prazo padrão definido em ${dias} dia(s). Vale para novas indicações.`,
  }
}

/** O mesmo, para um serviço específico. Sobrepõe o padrão só naquele serviço. */
export async function definirPrazoDoServico(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) return SEM_AUTORIZACAO

  const validacao = PrazoDoServicoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Prazo inválido.',
    }
  }
  const { referencia, dias } = validacao.data

  const [anterior] = await db
    .select({ dias: parceiroPrazos.dias })
    .from(parceiroPrazos)
    .where(eq(parceiroPrazos.referencia, referencia))
    .limit(1)

  await db
    .insert(parceiroPrazos)
    .values({ referencia, dias, atualizadoPor: sessao.id })
    .onConflictDoUpdate({
      target: parceiroPrazos.referencia,
      set: { dias, atualizadoPor: sessao.id, updatedAt: new Date() },
    })

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.prazoParceiroAlterado,
    entidade: 'parceiro_prazo_servico',
    autorId: sessao.id,
    origem: 'gestao_vincis',
    metadados: {
      escopo: 'servico',
      servico: referencia,
      valorAnterior: anterior?.dias ?? null,
      valorNovo: dias,
    },
  })

  revalidatePath(ROTA_PARCEIROS_ADMIN)
  return {
    sucesso: true as const,
    mensagem: `${rotuloDaReferencia(referencia)}: ${dias} dia(s). Vale para novas indicações.`,
  }
}
