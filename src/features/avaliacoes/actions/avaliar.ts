'use server'

import { revalidatePath } from 'next/cache'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { AvaliacaoSchema } from '../schemas/avaliacao'
import { registrarAvaliacao } from '../lib/registrar-avaliacao'

const MENSAGEM_POR_MOTIVO: Record<string, string> = {
  'sem-acesso': 'Somente o cliente do atendimento pode avaliá-lo.',
  'nao-encontrado': 'Atendimento não encontrado.',
  'nao-concluido': 'Só é possível avaliar um atendimento concluído.',
  'nota-invalida': 'Selecione de 1 a 5 estrelas.',
}

/**
 * Avalia um Atendimento concluído.
 *
 * A action só transporta. Quem avalia vem da sessão — o formulário não envia,
 * e portanto não pode forjar, o id do Cliente. Propriedade do Atendimento,
 * status, faixa da nota e unicidade são decididos dentro de
 * `registrarAvaliacao` e, no caso da unicidade, pelo próprio banco.
 *
 * Criar e editar são a mesma chamada de propósito: do ponto de vista do Cliente
 * existe **uma** avaliação daquele Atendimento, e reenviá-la é corrigi-la. Uma
 * action separada de edição abriria a porta para as duas divergirem em regra.
 */
export async function avaliarAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = AvaliacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? 'Selecione de 1 a 5 estrelas.',
    }
  }

  const resultado = await registrarAvaliacao({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    nota: validacao.data.nota,
    comentario: validacao.data.comentario ?? null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      motivo: resultado.motivo,
      mensagem:
        MENSAGEM_POR_MOTIVO[resultado.motivo] ??
        'Não foi possível registrar a avaliação.',
    }
  }

  // A nota entra na média pública na mesma hora: a vitrine e o perfil do
  // Prestador são calculados a cada renderização, então basta invalidar o cache
  // das rotas que os desenham.
  revalidatePath('/cliente')
  revalidatePath('/admin')
  revalidatePath('/profissionais')
  revalidatePath('/perfil-profissional')

  return {
    sucesso: true as const,
    mensagem: resultado.criada
      ? 'Avaliação enviada com sucesso.'
      : 'Avaliação atualizada com sucesso.',
    dados: {
      avaliacaoId: resultado.avaliacaoId,
      nota: resultado.nota,
      criada: resultado.criada,
      criadoEm: resultado.criadoEm.toISOString(),
      atualizadoEm: resultado.atualizadoEm.toISOString(),
    },
  }
}
