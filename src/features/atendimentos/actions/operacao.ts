'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  ESCOPOS_MENSAGEM,
  PRIORIDADES_ATENDIMENTO,
  STATUS_ATENDIMENTO,
  ROTULO_STATUS_ATENDIMENTO,
} from '../constants/atendimento'
import {
  definirPrazoDoAtendimento,
  definirPrioridadeDoAtendimento,
  interpretarPrazo,
} from '../lib/ajustes-operacionais'
import { alterarStatusDoAtendimento } from '../lib/alterar-status'
import {
  publicarManifestacaoNoAtendimento,
  TAMANHO_MAXIMO_MANIFESTACAO,
} from '../lib/manifestacoes'
import { enviarMensagemNoAtendimento, TAMANHO_MAXIMO_MENSAGEM } from '../lib/mensagens'

const StatusSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  destino: z.enum(STATUS_ATENDIMENTO),
  motivo: z.string().trim().max(240).optional(),
})

const MensagemSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  escopo: z.enum(ESCOPOS_MENSAGEM),
  conteudo: z.string().trim().min(1, 'Escreva uma mensagem.').max(TAMANHO_MAXIMO_MENSAGEM),
})

const PrioridadeSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  prioridade: z.enum(PRIORIDADES_ATENDIMENTO),
})

/** `prazoEm` nulo é intencional: significa devolver o Atendimento a "sem prazo". */
const PrazoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  prazoEm: z
    .string()
    .trim()
    .min(1)
    .refine((valor) => !Number.isNaN(new Date(valor).getTime()), 'Data inválida.')
    .nullable(),
})

const ManifestacaoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  conteudo: z
    .string()
    .trim()
    .min(1, 'Escreva o conteúdo da manifestação.')
    .max(TAMANHO_MAXIMO_MANIFESTACAO),
  respondeManifestacaoId: z.string().uuid().optional().nullable(),
  arquivoId: z.string().uuid().optional().nullable(),
})

/**
 * Avança o Atendimento no fluxo operacional.
 *
 * A ação não decide nada: quem valida vínculo e transição é a regra de domínio.
 * Aqui só entram a sessão e a revalidação das telas que mostram o quadro.
 */
export async function alterarStatusAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = StatusSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const resultado = await alterarStatusDoAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    destino: validacao.data.destino,
    motivo: validacao.data.motivo ?? null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem:
        resultado.motivo === 'transicao-invalida'
          ? 'Esta mudança de status não é permitida a partir do status atual.'
          : 'Você não tem autorização para alterar este atendimento.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: `Atendimento movido para ${ROTULO_STATUS_ATENDIMENTO[resultado.para]}.`,
    dados: { de: resultado.de, para: resultado.para },
  }
}

/**
 * Envia uma mensagem na conversa do Atendimento.
 *
 * Serve os dois lados — Cliente e equipe — porque a conversa é a mesma. Quem
 * pode escrever em qual canal é decidido pelo vínculo, no servidor.
 */
export async function enviarMensagemAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = MensagemSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Escreva uma mensagem válida.' }
  }

  const resultado = await enviarMensagemNoAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    escopo: validacao.data.escopo,
    conteudo: validacao.data.conteudo,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem:
        resultado.motivo === 'vazia'
          ? 'Escreva uma mensagem válida.'
          : 'Você não tem autorização para enviar nesta conversa.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: 'Mensagem enviada.',
    dados: { id: resultado.id },
  }
}

/**
 * Publica uma manifestação no Protocolo.
 *
 * A ação não recebe papel nem visibilidade: quem escreve só informa o texto. O
 * papel é derivado do vínculo no servidor — é isso que impede um participante
 * de publicar a própria resposta como se fosse manifestação do Cliente e, com
 * isso, torná-la legível para os demais.
 *
 * Publicar **não** muda o status: mensagem que chega não decide o andamento do
 * serviço. Quem move o Atendimento é a equipe, explicitamente.
 */
export async function publicarManifestacao(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ManifestacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Escreva um texto válido.' }
  }

  const resultado = await publicarManifestacaoNoAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    conteudo: validacao.data.conteudo,
    respondeManifestacaoId: validacao.data.respondeManifestacaoId ?? null,
    arquivoId: validacao.data.arquivoId ?? null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem:
        resultado.motivo === 'vazia'
          ? 'Escreva um texto válido.'
          : resultado.motivo === 'referencia-invalida'
            ? 'A manifestação respondida não faz parte deste protocolo.'
            : resultado.motivo === 'arquivo-invalido'
              ? 'O arquivo citado não faz parte deste atendimento.'
              : 'Você não tem autorização para escrever neste protocolo.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem:
      resultado.papelAutor === 'cliente'
        ? 'Manifestação registrada no protocolo.'
        : 'Resposta registrada no protocolo.',
    dados: { id: resultado.id },
  }
}

/**
 * Define a prioridade do Atendimento.
 *
 * A prioridade é da equipe. O Cliente chega até aqui pelo mesmo caminho de
 * qualquer outra ação — e é recusado no servidor, não pela ausência do botão na
 * tela dele.
 */
export async function definirPrioridadeAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = PrioridadeSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Prioridade inválida.' }
  }

  const resultado = await definirPrioridadeDoAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    prioridade: validacao.data.prioridade,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem: 'Você não tem autorização para alterar a prioridade deste atendimento.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: resultado.alterado
      ? 'Prioridade atualizada.'
      : 'A prioridade já era essa.',
  }
}

/**
 * Define o prazo operacional do Atendimento.
 *
 * Mesma regra da prioridade: prazo é compromisso que a equipe assume, e por
 * isso o Cliente não o escolhe. O que ele contratou pode dar o prazo inicial —
 * isso acontece na criação do Atendimento, a partir do catálogo.
 */
export async function definirPrazoAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = PrazoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Informe uma data válida.' }
  }

  const resultado = await definirPrazoDoAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    prazoEm: validacao.data.prazoEm
      ? interpretarPrazo(validacao.data.prazoEm)
      : null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem: 'Você não tem autorização para alterar o prazo deste atendimento.',
    }
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: resultado.alterado
      ? validacao.data.prazoEm
        ? 'Prazo atualizado.'
        : 'Prazo removido.'
      : 'O prazo já era esse.',
  }
}
