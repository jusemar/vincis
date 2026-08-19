'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  AnaliseDeAjusteSchema,
  MotivoDeAjusteSchema,
} from '../schemas/ajuste'
import {
  analisarSolicitacaoDeAjuste,
  solicitarAjusteNoAtendimento,
} from '../lib/solicitacoes-ajuste'

const AtendimentoIdSchema = z.string().uuid('Atendimento inválido.')

const MENSAGEM_SOLICITACAO: Record<string, string> = {
  'sem-acesso': 'Somente o cliente do atendimento pode solicitar um ajuste.',
  'nao-encontrado': 'Atendimento não encontrado.',
  'nao-concluido':
    'Só é possível solicitar ajuste em um atendimento concluído.',
  'motivo-vazio': 'Descreva o que precisa ser ajustado.',
  'ja-existe-pendente':
    'Já existe uma solicitação de ajuste em análise para este atendimento.',
}

const MENSAGEM_ANALISE: Record<string, string> = {
  'sem-acesso': 'Você não tem autorização para analisar esta solicitação.',
  'nao-encontrada': 'Solicitação não encontrada.',
  'ja-analisada': 'Esta solicitação já foi analisada.',
  'justificativa-obrigatoria': 'Explique brevemente o motivo da recusa.',
  'atendimento-nao-concluido':
    'O atendimento não está mais concluído e não pode ser reaberto.',
}

/**
 * O Cliente solicita um ajuste no Atendimento concluído.
 *
 * Chega como `FormData` porque pode trazer um arquivo — o mesmo formato que a
 * anexação de sempre usa. A ação só transporta: quem pede vem da sessão, e
 * propriedade do Atendimento, status concluído, unicidade do pedido pendente e
 * gravação são decididos dentro de `solicitarAjusteNoAtendimento`.
 *
 * **Não** muda o status do Atendimento. Isso é regra do domínio, não desta
 * camada — mas vale repetir aqui porque é o ponto inteiro desta etapa.
 */
export async function solicitarAjuste(formData: FormData) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const atendimentoId = AtendimentoIdSchema.safeParse(
    formData.get('atendimentoId'),
  )
  const motivo = MotivoDeAjusteSchema.safeParse(formData.get('motivo'))
  if (!atendimentoId.success || !motivo.success) {
    return {
      sucesso: false as const,
      mensagem: motivo.success
        ? 'Dados inválidos.'
        : (motivo.error.issues[0]?.message ??
          'Descreva o que precisa ser ajustado.'),
    }
  }

  const enviado = formData.get('arquivo')
  // Um `<input type="file">` vazio chega como File de tamanho zero: isso é
  // "não anexei nada", e não um arquivo a gravar.
  const arquivo =
    enviado instanceof File && enviado.size > 0 ? enviado : null

  try {
    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId: atendimentoId.data,
      usuarioId: sessao.id,
      motivo: motivo.data,
      arquivo,
    })

    if (!resultado.sucesso) {
      return {
        sucesso: false as const,
        motivo: resultado.motivo,
        mensagem:
          MENSAGEM_SOLICITACAO[resultado.motivo] ??
          'Não foi possível registrar a solicitação.',
      }
    }

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Solicitação enviada. O profissional vai analisar.',
      dados: {
        solicitacaoId: resultado.solicitacaoId,
        temAnexo: Boolean(resultado.arquivoId),
      },
    }
  } catch (erro) {
    console.error('[SOLICITAR_AJUSTE_ATENDIMENTO]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem:
        erro instanceof Error
          ? erro.message
          : 'Não foi possível registrar a solicitação.',
    }
  }
}

/**
 * O Prestador analisa a solicitação: aceita e reabre, ou recusa e mantém.
 *
 * A ação só transporta. Autorização, obrigatoriedade da justificativa,
 * reabertura e concorrência são decididas dentro de
 * `analisarSolicitacaoDeAjuste` — o formulário não envia, e portanto não pode
 * forjar, quem está decidindo.
 */
export async function analisarAjuste(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = AnaliseDeAjusteSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const resultado = await analisarSolicitacaoDeAjuste({
    solicitacaoId: validacao.data.solicitacaoId,
    usuarioId: sessao.id,
    decisao: validacao.data.decisao,
    resposta: validacao.data.resposta ?? null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      motivo: resultado.motivo,
      mensagem:
        MENSAGEM_ANALISE[resultado.motivo] ??
        'Não foi possível registrar a decisão.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: resultado.reaberto
      ? 'Solicitação aceita. O atendimento foi reaberto.'
      : 'Solicitação recusada. O atendimento permanece concluído.',
    dados: { decisao: resultado.decisao, reaberto: resultado.reaberto },
  }
}
