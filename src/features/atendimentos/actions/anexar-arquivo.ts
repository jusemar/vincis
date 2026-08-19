'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { anexarArquivoNoAtendimento } from '../lib/anexar-arquivo'

const AtendimentoIdSchema = z.string().uuid('Atendimento inválido.')

/**
 * Anexa um arquivo enviado pelo formulário ao Atendimento.
 *
 * A ação só transporta: quem envia vem da sessão e a autorização é decidida
 * dentro de `anexarArquivoNoAtendimento`, junto da gravação. Nenhum id de
 * usuário é aceito do formulário.
 */
export async function anexarArquivoAoAtendimento(formData: FormData) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const atendimentoId = AtendimentoIdSchema.safeParse(
    formData.get('atendimentoId'),
  )
  const arquivo = formData.get('arquivo')

  if (!atendimentoId.success || !(arquivo instanceof File)) {
    return { sucesso: false as const, mensagem: 'Envie um arquivo válido.' }
  }

  try {
    const anexado = await anexarArquivoNoAtendimento({
      atendimentoId: atendimentoId.data,
      usuarioId: sessao.id,
      arquivo,
    })
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Arquivo anexado ao atendimento.',
      dados: anexado,
    }
  } catch (erro) {
    console.error('[ANEXAR_ARQUIVO_ATENDIMENTO]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem:
        erro instanceof Error
          ? erro.message
          : 'Não foi possível anexar o arquivo.',
    }
  }
}
