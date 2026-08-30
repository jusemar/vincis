'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '../lib/validar-gestor-vincis'
import { ConfirmacaoWhatsappSchema } from '../schemas/confirmacao-email'
import type { ResultadoPadrao } from '../types'

/**
 * Confirmação manual de identidade pelo WhatsApp cadastrado.
 *
 * É o caminho alternativo quando o e-mail não chega: o Gestor Vincis fala com a
 * pessoa pelo número informado no cadastro e atesta a identidade. Exclusivo do
 * Gestor — `validarGestorVincis` refaz a checagem de perfil no servidor, sem
 * confiar em nada vindo do cliente.
 *
 * Duas garantias no que é gravado:
 * 1. `emailVerificado` **nunca** é tocado aqui. O e-mail continua pendente até
 *    que a pessoa clique no link — afirmar o contrário seria registrar um fato
 *    que não ocorreu.
 * 2. A operação é idempotente: repetir sobre uma conta já confirmada por
 *    WhatsApp não regrava a autoria, a data nem duplica a auditoria.
 */
export async function confirmarContaViaWhatsappGestao(
  entrada: unknown,
): Promise<ResultadoPadrao> {
  const gestor = await validarGestorVincis()
  if (!gestor) {
    return { sucesso: false, mensagem: 'Operação não autorizada.' }
  }

  const validacao = ConfirmacaoWhatsappSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const { usuarioId } = validacao.data

  try {
    const resultado = await db.transaction(async (tx) => {
      const [usuario] = await tx
        .select({
          id: usuarios.id,
          nome: usuarios.nome,
          whatsapp: usuarios.whatsapp,
          status: usuarios.status,
          emailVerificado: usuarios.emailVerificado,
          whatsappVerificado: usuarios.whatsappVerificado,
        })
        .from(usuarios)
        .where(eq(usuarios.id, usuarioId))
        .limit(1)
        .for('update')

      if (!usuario) return { estado: 'inexistente' as const }
      if (usuario.status === 'bloqueado') return { estado: 'bloqueado' as const }
      if (!usuario.whatsapp) return { estado: 'sem_whatsapp' as const }
      // Idempotência: nada a fazer, nada a auditar de novo.
      if (usuario.whatsappVerificado) return { estado: 'ja_confirmado' as const }

      const agora = new Date()
      await tx
        .update(usuarios)
        .set({
          whatsappVerificado: true,
          whatsappVerificadoEm: agora,
          whatsappVerificadoPorId: gestor.id,
          // Libera a conta. `emailVerificado` permanece como está.
          status: 'ativo',
          updatedAt: agora,
        })
        .where(eq(usuarios.id, usuarioId))

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.contaVerificadaViaWhatsappGestao,
          entidade: 'usuarios',
          registroAfetado: usuario.id,
          autorId: gestor.id,
          usuarioId: usuario.id,
          origem: 'gestao_vincis',
          // Somente o mínimo estruturado da decisão: nunca conteúdo da conversa.
          metadados: {
            metodo: 'whatsapp_gestao',
            emailVerificadoNoMomento: usuario.emailVerificado,
          },
        },
        tx,
      )

      return { estado: 'confirmado' as const, nome: usuario.nome }
    })

    if (resultado.estado === 'inexistente') {
      return { sucesso: false, mensagem: 'Usuário não encontrado.' }
    }
    if (resultado.estado === 'bloqueado') {
      return {
        sucesso: false,
        mensagem: 'Esta conta está bloqueada e não pode ser verificada.',
      }
    }
    if (resultado.estado === 'sem_whatsapp') {
      return {
        sucesso: false,
        mensagem: 'Esta conta não possui WhatsApp cadastrado.',
      }
    }
    if (resultado.estado === 'ja_confirmado') {
      return {
        sucesso: true,
        mensagem: 'Esta conta já estava verificada via WhatsApp.',
      }
    }

    revalidatePath('/admin/usuarios')
    return {
      sucesso: true,
      mensagem: `Identidade de ${resultado.nome} confirmada via WhatsApp.`,
    }
  } catch (error) {
    console.error('[CONFIRMAR_CONTA_WHATSAPP_GESTAO]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false,
      mensagem: 'Não foi possível confirmar a identidade. Tente novamente.',
    }
  }
}
