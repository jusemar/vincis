'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { cadastrarWebhookEfi } from '../lib/webhook-efi-cadastro'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestão cadastra o webhook Pix da Vincis na Efí.
 *
 * Sem entrada: chave, token e endereço vêm só do servidor. Um webhook
 * diferente já cadastrado nunca é sobrescrito (ver o domínio).
 */
export async function cadastrarWebhookEfiAction() {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const resultado = await cadastrarWebhookEfi({ gestorId: gestor.id, ip: await ipDaRequisicao() })
  revalidatePath('/admin/integracao-pix')

  if (resultado.ok) {
    return {
      sucesso: true as const,
      mensagem: resultado.jaEstavaCadastrado
        ? 'O webhook da Vincis já estava cadastrado na Efí. Nada foi alterado.'
        : 'Webhook cadastrado e confirmado na Efí.',
    }
  }
  const s = resultado.situacao
  const mensagem =
    s.estado === 'conflito'
      ? 'Já existe outro webhook cadastrado para esta chave Pix. Ele não foi sobrescrito.'
      : s.estado === 'indisponivel'
        ? s.motivo
        : s.estado === 'erro'
          ? s.mensagem
          : 'A Efí não confirmou o cadastro. Consulte novamente.'
  return { sucesso: false as const, mensagem }
}
