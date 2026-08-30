'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { comunicados } from '@/db/schema'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import {
  AtualizarComunicadoSchema,
  ComunicadoIdSchema,
  ComunicadoSchema,
} from '../schemas/comunicado'
import { listarComunicadosDaGestao } from '../queries/listar-comunicados'
import type { ComunicadoGestaoDTO } from '../types/comunicado'

type Resultado<T = undefined> =
  | { sucesso: true; mensagem: string; dados?: T }
  | { sucesso: false; mensagem: string; dados?: undefined }

/**
 * Comunicado é conteúdo da Vincis, e só a Vincis publica.
 *
 * A porta é uma só, chamada no início de **todas** as ações deste arquivo:
 * Profissional, Colaborador e Cliente não têm caminho até aqui, nem escondendo
 * o botão nem chamando a action direto. Esconder botão não é autorização.
 */
async function exigirGestor() {
  return validarGestorVincis()
}

/** Data de publicação a gravar: a informada, ou agora. */
function resolverPublicacao(texto: string, agora: Date) {
  return texto ? new Date(texto) : agora
}

export async function criarComunicado(
  entrada: unknown,
  /** `true` já nasce publicado; `false` fica em rascunho. */
  publicarAgora = false,
): Promise<Resultado<{ id: string }>> {
  const gestor = await exigirGestor()
  if (!gestor) return SEM_AUTORIZACAO

  const validacao = ComunicadoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const agora = new Date()
  const dados = validacao.data
  const [criado] = await db
    .insert(comunicados)
    .values({
      tipo: dados.tipo,
      titulo: dados.titulo,
      resumo: dados.resumo,
      audiencia: dados.audiencia,
      status: publicarAgora ? 'publicado' : 'rascunho',
      // Rascunho guarda a data escolhida quando existe: é o agendamento
      // esperando o clique em Publicar, e perdê-la obrigaria a redigitar.
      publicadoEm: publicarAgora
        ? resolverPublicacao(dados.publicadoEm, agora)
        : dados.publicadoEm
          ? new Date(dados.publicadoEm)
          : null,
      autorId: gestor.id,
    })
    .returning({ id: comunicados.id })

  revalidatePath('/admin/comunicados')
  revalidatePath('/admin')
  return {
    sucesso: true,
    mensagem: publicarAgora ? 'Comunicado publicado.' : 'Rascunho salvo.',
    dados: { id: criado.id },
  }
}

export async function atualizarComunicado(
  entrada: unknown,
): Promise<Resultado> {
  const gestor = await exigirGestor()
  if (!gestor) return SEM_AUTORIZACAO

  const validacao = AtualizarComunicadoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Dados inválidos.',
    }
  }

  const { comunicadoId, ...dados } = validacao.data
  const [alterado] = await db
    .update(comunicados)
    .set({
      tipo: dados.tipo,
      titulo: dados.titulo,
      resumo: dados.resumo,
      audiencia: dados.audiencia,
      publicadoEm: dados.publicadoEm ? new Date(dados.publicadoEm) : null,
      updatedAt: new Date(),
    })
    .where(eq(comunicados.id, comunicadoId))
    .returning({ id: comunicados.id })

  if (!alterado) {
    return { sucesso: false, mensagem: 'Comunicado não encontrado.' }
  }

  revalidatePath('/admin/comunicados')
  revalidatePath('/admin')
  return { sucesso: true, mensagem: 'Comunicado atualizado.' }
}

/**
 * Move o comunicado entre os três estados.
 *
 * Publicar sem data marcada carimba o instante do clique: o mural filtra por
 * `publicado_em`, e um publicado sem data ficaria invisível para sempre — o
 * pior tipo de bug, porque parece que a ação simplesmente não funcionou.
 */
async function mudarStatus(
  entrada: unknown,
  destino: 'publicado' | 'rascunho' | 'arquivado',
  mensagem: string,
): Promise<Resultado> {
  const gestor = await exigirGestor()
  if (!gestor) return SEM_AUTORIZACAO

  const validacao = ComunicadoIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: 'Comunicado inválido.' }
  }

  const agora = new Date()
  const [atual] = await db
    .select({ publicadoEm: comunicados.publicadoEm })
    .from(comunicados)
    .where(eq(comunicados.id, validacao.data.comunicadoId))
    .limit(1)

  if (!atual) return { sucesso: false, mensagem: 'Comunicado não encontrado.' }

  await db
    .update(comunicados)
    .set({
      status: destino,
      publicadoEm:
        destino === 'publicado' ? (atual.publicadoEm ?? agora) : atual.publicadoEm,
      updatedAt: agora,
    })
    .where(eq(comunicados.id, validacao.data.comunicadoId))

  revalidatePath('/admin/comunicados')
  revalidatePath('/admin')
  return { sucesso: true, mensagem }
}

export async function publicarComunicado(entrada: unknown) {
  return mudarStatus(entrada, 'publicado', 'Comunicado publicado.')
}

export async function despublicarComunicado(entrada: unknown) {
  return mudarStatus(entrada, 'rascunho', 'Comunicado despublicado.')
}

export async function arquivarComunicado(entrada: unknown) {
  return mudarStatus(entrada, 'arquivado', 'Comunicado arquivado.')
}

/**
 * Lista para a tela da gestão.
 *
 * Existe como action, e não só como query no servidor da página, porque a tela
 * precisa recarregar depois de cada mudança sem um refresh inteiro.
 */
export async function carregarComunicadosDaGestao(): Promise<
  Resultado<ComunicadoGestaoDTO[]>
> {
  const gestor = await exigirGestor()
  if (!gestor) return SEM_AUTORIZACAO

  return {
    sucesso: true,
    mensagem: 'Comunicados carregados.',
    dados: await listarComunicadosDaGestao(),
  }
}
