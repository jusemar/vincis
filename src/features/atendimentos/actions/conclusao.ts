'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  LIMITE_ARQUIVOS_ENTREGA,
  TAMANHO_MAXIMO_OBSERVACAO_FINAL,
} from '../constants/atendimento'
import { concluirAtendimento } from '../lib/concluir-atendimento'

const ConclusaoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  /** Vazio é caso normal: nem todo serviço rende uma observação escrita. */
  observacaoFinal: z
    .string()
    .trim()
    .max(TAMANHO_MAXIMO_OBSERVACAO_FINAL)
    .optional()
    .nullable(),
  /** Arquivos já anexados que passam a valer como entrega. Pode vir vazio. */
  arquivoIds: z.array(z.string().uuid()).max(LIMITE_ARQUIVOS_ENTREGA).optional(),
  confirmarPendencias: z.boolean().optional(),
})

/**
 * Conclui o Atendimento.
 *
 * A ação só transporta: quem conclui vem da sessão, e autorização, transição,
 * pendências do checklist e concorrência são decididas dentro de
 * `concluirAtendimento`. Nenhum id de usuário é aceito do formulário.
 *
 * `checklist-pendente` volta como recusa com o número de etapas abertas — é o
 * que permite à tela perguntar antes de insistir, sem nunca marcar etapa
 * nenhuma por conta própria.
 */
export async function registrarConclusaoDoAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConclusaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const resultado = await concluirAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    observacaoFinal: validacao.data.observacaoFinal ?? null,
    arquivoIds: validacao.data.arquivoIds ?? [],
    confirmarPendencias: validacao.data.confirmarPendencias ?? false,
  })

  if (!resultado.sucesso) {
    if (resultado.motivo === 'checklist-pendente') {
      return {
        sucesso: false as const,
        motivo: 'checklist-pendente' as const,
        pendentes: resultado.pendentes ?? 0,
        mensagem:
          resultado.pendentes === 1
            ? 'Ainda há 1 etapa pendente no checklist.'
            : `Ainda há ${resultado.pendentes} etapas pendentes no checklist.`,
      }
    }
    return {
      sucesso: false as const,
      motivo: resultado.motivo,
      mensagem:
        resultado.motivo === 'ja-concluido'
          ? 'Este atendimento já está concluído.'
          : resultado.motivo === 'transicao-invalida'
            ? 'Não é possível concluir a partir do status atual.'
            : resultado.motivo === 'arquivo-invalido'
              ? 'Um dos arquivos escolhidos não faz parte deste atendimento.'
              : 'Você não tem autorização para concluir este atendimento.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: resultado.arquivosDeEntrega
      ? 'Atendimento concluído e entrega registrada.'
      : 'Atendimento concluído.',
    dados: {
      de: resultado.de,
      concluidoEm: resultado.concluidoEm.toISOString(),
      arquivosDeEntrega: resultado.arquivosDeEntrega,
    },
  }
}
