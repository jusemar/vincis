'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { VISIBILIDADES_CHECKLIST } from '../constants/atendimento'
import {
  adicionarItemDoChecklist,
  alternarItemDoChecklist,
  removerItemDoChecklist,
  renomearItemDoChecklist,
  reordenarChecklist,
  TAMANHO_MAXIMO_ETAPA,
  type ResultadoChecklist,
} from '../lib/checklist'
import { solicitarAoCliente } from '../lib/solicitar-ao-cliente'

const tituloDaEtapa = z
  .string()
  .trim()
  .min(1, 'Escreva a etapa.')
  .max(TAMANHO_MAXIMO_ETAPA)

const NovaEtapaSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  titulo: tituloDaEtapa,
  visibilidade: z.enum(VISIBILIDADES_CHECKLIST).default('cliente'),
})

const ItemSchema = z.object({
  itemId: z.string().uuid('Etapa inválida.'),
})

const AlternarSchema = ItemSchema.extend({ concluido: z.boolean() })
const RenomearSchema = ItemSchema.extend({ titulo: tituloDaEtapa })

const ReordenarSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  ordemDosItens: z.array(z.string().uuid()).min(1),
})

const SolicitacaoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  conteudo: z.string().trim().min(1, 'Escreva o que está sendo solicitado.').max(8000),
  etapaChecklist: z.string().trim().max(TAMANHO_MAXIMO_ETAPA).optional().nullable(),
})

/** Mensagem única para as recusas do checklist — todas dizem a mesma coisa. */
function recusa(resultado: Extract<ResultadoChecklist, { sucesso: false }>) {
  return {
    sucesso: false as const,
    mensagem:
      resultado.motivo === 'vazio'
        ? 'Escreva a etapa.'
        : resultado.motivo === 'limite'
          ? 'Este checklist já atingiu o limite de etapas.'
          : resultado.motivo === 'nao-encontrado'
            ? 'Esta etapa não existe mais.'
            : 'Você não tem autorização para alterar o checklist deste atendimento.',
  }
}

function atualizarTelas() {
  revalidatePath('/admin')
  revalidatePath('/cliente')
}

/**
 * Checklist do Atendimento.
 *
 * Todas as ações daqui são da equipe. O Cliente acompanha as etapas públicas no
 * portal, mas nenhuma destas funções aceita a sessão dele: a conferência está no
 * domínio, valendo inclusive para quem chamar a ação diretamente.
 */
export async function adicionarEtapaChecklist(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = NovaEtapaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Escreva a etapa.' }
  }

  const resultado = await adicionarItemDoChecklist({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    titulo: validacao.data.titulo,
    visibilidade: validacao.data.visibilidade,
    origem: 'equipe',
  })
  if (!resultado.sucesso) return recusa(resultado)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Etapa adicionada.' }
}

export async function alternarEtapaChecklist(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = AlternarSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Etapa inválida.' }
  }

  const resultado = await alternarItemDoChecklist({
    itemId: validacao.data.itemId,
    usuarioId: sessao.id,
    concluido: validacao.data.concluido,
  })
  if (!resultado.sucesso) return recusa(resultado)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: validacao.data.concluido ? 'Etapa concluída.' : 'Etapa reaberta.',
  }
}

export async function renomearEtapaChecklist(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = RenomearSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Escreva a etapa.' }
  }

  const resultado = await renomearItemDoChecklist({
    itemId: validacao.data.itemId,
    usuarioId: sessao.id,
    titulo: validacao.data.titulo,
  })
  if (!resultado.sucesso) return recusa(resultado)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Etapa atualizada.' }
}

export async function removerEtapaChecklist(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ItemSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Etapa inválida.' }
  }

  const resultado = await removerItemDoChecklist({
    itemId: validacao.data.itemId,
    usuarioId: sessao.id,
  })
  if (!resultado.sucesso) return recusa(resultado)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Etapa removida.' }
}

export async function reordenarEtapasChecklist(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ReordenarSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Ordem inválida.' }
  }

  const resultado = await reordenarChecklist({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    ordemDosItens: validacao.data.ordemDosItens,
  })
  if (!resultado.sucesso) return recusa(resultado)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Checklist reordenado.' }
}

/**
 * Solicitar ao cliente.
 *
 * O botão do painel passa por aqui: registra o pedido no Protocolo, cria a etapa
 * correspondente quando faz sentido e move o Atendimento para "Aguardando
 * cliente". Uma coisa só, do jeito que a operação já faz na prática.
 */
export async function solicitarAoClienteAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = SolicitacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: 'Escreva o que está sendo solicitado ao cliente.',
    }
  }

  const resultado = await solicitarAoCliente({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    conteudo: validacao.data.conteudo,
    etapaChecklist: validacao.data.etapaChecklist ?? null,
  })

  if (!resultado.sucesso) {
    return {
      sucesso: false as const,
      mensagem:
        resultado.motivo === 'vazia'
          ? 'Escreva o que está sendo solicitado ao cliente.'
          : resultado.motivo === 'transicao-invalida'
            ? 'Não é possível solicitar ao cliente a partir do status atual.'
            : 'Você não tem autorização para solicitar neste atendimento.',
    }
  }

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: resultado.itemChecklistId
      ? 'Solicitação registrada no protocolo e adicionada ao checklist.'
      : 'Solicitação registrada no protocolo.',
  }
}
