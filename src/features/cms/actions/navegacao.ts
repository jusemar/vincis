'use server'

import { and, asc, eq, max } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cmsGruposNavegacao, cmsItensNavegacao, cmsPaginas } from '@/db/schema'
import { ACOES_CMS, registrarEventoCms } from '../integracao/auditoria'
import { exigirAdministradorCms } from '../integracao/autorizacao'
import { schemasCms } from '../integracao/schemas'
import { CMS_SEM_AUTORIZACAO, falhaDeValidacao, violouRestricaoUnica } from '../lib/respostas'
import { revalidarCms } from '../lib/revalidacao'
import {
  irmaos,
  MENSAGEM_ERRO_POSICAO,
  validarPosicaoItem,
  type NoArvore,
} from '../nucleo/lib/arvore-navegacao'
import { ordenacaoEhCompleta } from '../nucleo/lib/ordenacao'
import { paginaPodeSerAssociada } from '../nucleo/lib/publicacao'
import type { LocalNavegacao, ResultadoCms, StatusPagina } from '../nucleo/types'

/**
 * Mutações da navegação do CMS: grupos (colunas do rodapé) e os itens deles.
 *
 * Mesma porta e mesma trilha das páginas: Gestor conferido no servidor, entrada
 * validada aqui, gravação e auditoria na mesma transação. Toda mudança gera
 * `cms_navegacao_alterada` com a `operacao` nos metadados — é um assunto só
 * para quem consulta a trilha, e a operação diz o que mudou.
 *
 * Tirar um item do site é desligá-lo (`ativo = false`) ou removê-lo — o que
 * apaga só o vínculo de navegação; a página nunca é apagada.
 *
 * Árvore (agrupador, submenu, um nível só, sem ciclo): regras do núcleo,
 * conferidas aqui com o grupo e os itens travados na transação.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const IDENTIFICADOR_EM_USO: ResultadoCms<never> = {
  sucesso: false,
  mensagem: 'Este identificador já está em uso por outro grupo.',
  campo: 'identificador',
}
const GRUPO_NAO_ENCONTRADO: ResultadoCms<never> = {
  sucesso: false,
  mensagem: 'Grupo não encontrado.',
}

async function auditarNavegacao(
  tx: Tx,
  autorId: string,
  entidade: 'cms_grupo_navegacao' | 'cms_item_navegacao',
  registroAfetado: string,
  metadados: Record<string, unknown> & { operacao: string },
) {
  await registrarEventoCms(
    { acao: ACOES_CMS.navegacaoAlterada, entidade, registroAfetado, autorId, metadados },
    tx,
  )
}

export async function criarGrupoNavegacaoCms(
  entrada: unknown,
): Promise<ResultadoCms<{ id: string }>> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.criarGrupo.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const dados = validacao.data

  try {
    const grupo = await db.transaction(async (tx) => {
      // Grupo novo entra no fim do local, sem pedir que alguém informe a ordem.
      const [{ ultima }] = await tx
        .select({ ultima: max(cmsGruposNavegacao.ordem) })
        .from(cmsGruposNavegacao)
        .where(eq(cmsGruposNavegacao.local, dados.local))
      const [criado] = await tx
        .insert(cmsGruposNavegacao)
        .values({ ...dados, ordem: (ultima ?? -1) + 1, atualizadoPorId: gestor.id })
        .returning({ id: cmsGruposNavegacao.id })
      await auditarNavegacao(tx, gestor.id, 'cms_grupo_navegacao', criado.id, {
        operacao: 'grupo_criado',
        identificador: dados.identificador,
        local: dados.local,
        ativo: dados.ativo,
      })
      return criado
    })
    revalidarCms({ navegacao: true })
    return { sucesso: true, mensagem: 'Grupo criado.', dados: grupo }
  } catch (erro) {
    if (violouRestricaoUnica(erro, 'cms_grupos_navegacao_identificador_unique'))
      return IDENTIFICADOR_EM_USO
    throw erro
  }
}

export async function editarGrupoNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.editarGrupo.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { grupoId, ...dados } = validacao.data

  try {
    const editado = await db.transaction(async (tx) => {
      const [grupo] = await tx
        .update(cmsGruposNavegacao)
        .set({ ...dados, atualizadoPorId: gestor.id, updatedAt: new Date() })
        .where(eq(cmsGruposNavegacao.id, grupoId))
        .returning({ id: cmsGruposNavegacao.id })
      if (!grupo) return false
      await auditarNavegacao(tx, gestor.id, 'cms_grupo_navegacao', grupoId, {
        operacao: 'grupo_editado',
        identificador: dados.identificador,
        ativo: dados.ativo,
      })
      return true
    })
    if (!editado) return GRUPO_NAO_ENCONTRADO
    revalidarCms({ navegacao: true })
    return { sucesso: true, mensagem: 'Grupo salvo.' }
  } catch (erro) {
    if (violouRestricaoUnica(erro, 'cms_grupos_navegacao_identificador_unique'))
      return IDENTIFICADOR_EM_USO
    throw erro
  }
}

export async function alterarAtivacaoGrupoNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.alterarAtivacaoGrupo.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { grupoId, ativo } = validacao.data

  const alterado = await db.transaction(async (tx) => {
    const [grupo] = await tx
      .update(cmsGruposNavegacao)
      .set({ ativo, atualizadoPorId: gestor.id, updatedAt: new Date() })
      .where(eq(cmsGruposNavegacao.id, grupoId))
      .returning({ id: cmsGruposNavegacao.id })
    if (!grupo) return false
    await auditarNavegacao(tx, gestor.id, 'cms_grupo_navegacao', grupoId, {
      operacao: ativo ? 'grupo_ativado' : 'grupo_desativado',
    })
    return true
  })
  if (!alterado) return GRUPO_NAO_ENCONTRADO
  revalidarCms({ navegacao: true })
  return { sucesso: true, mensagem: ativo ? 'Grupo ativado.' : 'Grupo desativado.' }
}

/** Grupo e todos os itens dele, travados até o fim da transação. */
async function carregarGrupoComItens(tx: Tx, grupoId: string) {
  const [grupo] = await tx
    .select({ id: cmsGruposNavegacao.id, local: cmsGruposNavegacao.local })
    .from(cmsGruposNavegacao)
    .where(eq(cmsGruposNavegacao.id, grupoId))
    .for('update')
    .limit(1)
  if (!grupo) return null
  const itens = await tx
    .select({
      id: cmsItensNavegacao.id,
      grupoId: cmsItensNavegacao.grupoId,
      paiId: cmsItensNavegacao.paiId,
      paginaId: cmsItensNavegacao.paginaId,
      ordem: cmsItensNavegacao.ordem,
    })
    .from(cmsItensNavegacao)
    .where(eq(cmsItensNavegacao.grupoId, grupoId))
    .for('update')
  return { grupo: { ...grupo, local: grupo.local as LocalNavegacao }, itens }
}

/** Próxima posição no fim da lista de irmãos. */
function proximaOrdem(
  itens: readonly (NoArvore & { ordem: number })[],
  grupoId: string,
  paiId: string | null,
) {
  const ordens = irmaos(itens, grupoId, paiId).map(({ ordem }) => ordem)
  return ordens.length ? Math.max(...ordens) + 1 : 0
}

export async function adicionarItemNavegacaoCms(
  entrada: unknown,
): Promise<ResultadoCms<{ id: string }>> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.adicionarItem.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const dados = validacao.data

  try {
    const resultado = await db.transaction(async (tx) => {
      const carregado = await carregarGrupoComItens(tx, dados.grupoId)
      if (!carregado) return { tipo: 'recusado' as const, mensagem: 'Grupo não encontrado.' }

      let slug: string | null = null
      if (dados.paginaId) {
        // A página fica travada até o fim: um arquivamento concorrente não pode
        // passar entre a conferência do status e a criação do item.
        const [pagina] = await tx
          .select({ status: cmsPaginas.status, slug: cmsPaginas.slug })
          .from(cmsPaginas)
          .where(eq(cmsPaginas.id, dados.paginaId))
          .for('update')
          .limit(1)
        if (!pagina) return { tipo: 'recusado' as const, mensagem: 'Página não encontrada.' }
        if (!paginaPodeSerAssociada(pagina.status as StatusPagina))
          return {
            tipo: 'recusado' as const,
            mensagem: 'Página arquivada não pode entrar na navegação.',
          }
        slug = pagina.slug
      }

      const erro = validarPosicaoItem({
        item: { grupoId: dados.grupoId, paginaId: dados.paginaId },
        paiId: dados.paiId,
        local: carregado.grupo.local,
        itens: carregado.itens,
      })
      if (erro) return { tipo: 'recusado' as const, mensagem: MENSAGEM_ERRO_POSICAO[erro] }

      const [item] = await tx
        .insert(cmsItensNavegacao)
        .values({
          ...dados,
          ordem: proximaOrdem(carregado.itens, dados.grupoId, dados.paiId),
        })
        .returning({ id: cmsItensNavegacao.id })
      await auditarNavegacao(tx, gestor.id, 'cms_item_navegacao', item.id, {
        operacao: dados.paginaId ? 'item_adicionado' : 'agrupador_adicionado',
        grupoId: dados.grupoId,
        paiId: dados.paiId,
        paginaId: dados.paginaId,
        slug,
      })
      return { tipo: 'criado' as const, item }
    })

    if (resultado.tipo === 'recusado') return { sucesso: false, mensagem: resultado.mensagem }
    revalidarCms({ navegacao: true })
    return {
      sucesso: true,
      mensagem: dados.paginaId ? 'Página adicionada ao grupo.' : 'Agrupador criado.',
      dados: resultado.item,
    }
  } catch (erro) {
    if (violouRestricaoUnica(erro, 'cms_itens_navegacao_grupo_pagina_unique'))
      return { sucesso: false, mensagem: 'Esta página já está neste grupo.' }
    throw erro
  }
}

export async function editarItemNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.editarItem.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { itemId, texto, ativo } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const [atual] = await tx
      .select({ paginaId: cmsItensNavegacao.paginaId })
      .from(cmsItensNavegacao)
      .where(eq(cmsItensNavegacao.id, itemId))
      .for('update')
      .limit(1)
    if (!atual) return 'nao_encontrado' as const
    // Agrupador não tem página de onde herdar o nome.
    if (!atual.paginaId && !texto) return 'agrupador_sem_texto' as const
    await tx
      .update(cmsItensNavegacao)
      .set({ texto, ativo, updatedAt: new Date() })
      .where(eq(cmsItensNavegacao.id, itemId))
    await auditarNavegacao(tx, gestor.id, 'cms_item_navegacao', itemId, {
      operacao: 'item_editado',
      ativo,
    })
    return 'editado' as const
  })
  if (resultado === 'nao_encontrado') return { sucesso: false, mensagem: 'Item não encontrado.' }
  if (resultado === 'agrupador_sem_texto')
    return { sucesso: false, mensagem: 'O agrupador precisa de um nome.', campo: 'texto' }
  revalidarCms({ navegacao: true })
  return { sucesso: true, mensagem: 'Item salvo.' }
}

/**
 * Leva o item para a raiz (`paiId` nulo) ou para o submenu de um agrupador.
 *
 * As regras são as do núcleo — mesmo grupo, pai agrupador, um nível só, sem
 * ciclo —, conferidas com a árvore atual travada. O item entra no fim da nova
 * lista de irmãos.
 */
export async function moverItemNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.moverItem.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { itemId, paiId } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const [alvo] = await tx
      .select({ grupoId: cmsItensNavegacao.grupoId })
      .from(cmsItensNavegacao)
      .where(eq(cmsItensNavegacao.id, itemId))
      .limit(1)
    if (!alvo) return { tipo: 'recusado' as const, mensagem: 'Item não encontrado.' }
    const carregado = await carregarGrupoComItens(tx, alvo.grupoId)
    const item = carregado?.itens.find(({ id }) => id === itemId)
    if (!carregado || !item) return { tipo: 'recusado' as const, mensagem: 'Item não encontrado.' }
    if (item.paiId === paiId) return { tipo: 'sem_mudanca' as const }

    const erro = validarPosicaoItem({
      item: { id: item.id, grupoId: item.grupoId, paginaId: item.paginaId },
      paiId,
      local: carregado.grupo.local,
      itens: carregado.itens,
    })
    if (erro) return { tipo: 'recusado' as const, mensagem: MENSAGEM_ERRO_POSICAO[erro] }

    await tx
      .update(cmsItensNavegacao)
      .set({
        paiId,
        ordem: proximaOrdem(carregado.itens, item.grupoId, paiId),
        updatedAt: new Date(),
      })
      .where(eq(cmsItensNavegacao.id, itemId))
    await auditarNavegacao(tx, gestor.id, 'cms_item_navegacao', itemId, {
      operacao: 'item_movido',
      paiAnterior: item.paiId,
      paiId,
    })
    return { tipo: 'movido' as const }
  })

  if (resultado.tipo === 'recusado') return { sucesso: false, mensagem: resultado.mensagem }
  if (resultado.tipo === 'sem_mudanca') return { sucesso: true, mensagem: 'O item já está aí.' }
  revalidarCms({ navegacao: true })
  return {
    sucesso: true,
    mensagem: paiId ? 'Item movido para o submenu.' : 'Item movido para o menu principal.',
  }
}

/**
 * Remove o vínculo de navegação — só o item; a página não é tocada.
 *
 * Agrupador com filhos não sai: os filhos precisariam de outro lugar, e apagar
 * em cascata faria links sumirem sem o Gestor ver. Ele esvazia (ou move) o
 * submenu antes. A trilha guarda o que o item era, para a remoção poder ser
 * explicada depois.
 */
export async function removerItemNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.removerItem.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { itemId } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(cmsItensNavegacao)
      .where(eq(cmsItensNavegacao.id, itemId))
      .for('update')
      .limit(1)
    if (!item) return 'nao_encontrado' as const
    const [filho] = await tx
      .select({ id: cmsItensNavegacao.id })
      .from(cmsItensNavegacao)
      .where(eq(cmsItensNavegacao.paiId, itemId))
      .limit(1)
    if (filho) return 'tem_filhos' as const

    await tx.delete(cmsItensNavegacao).where(eq(cmsItensNavegacao.id, itemId))
    await auditarNavegacao(tx, gestor.id, 'cms_item_navegacao', itemId, {
      operacao: 'item_removido',
      grupoId: item.grupoId,
      paiId: item.paiId,
      paginaId: item.paginaId,
      texto: item.texto,
      ativo: item.ativo,
    })
    return 'removido' as const
  })

  if (resultado === 'nao_encontrado') return { sucesso: false, mensagem: 'Item não encontrado.' }
  if (resultado === 'tem_filhos')
    return {
      sucesso: false,
      mensagem: 'Este agrupador tem itens no submenu. Mova ou remova esses itens antes.',
    }
  revalidarCms({ navegacao: true })
  return { sucesso: true, mensagem: 'Item removido da navegação. A página continua existindo.' }
}

const ORDEM_INCOMPLETA = (conjunto: string): ResultadoCms<never> => ({
  sucesso: false,
  mensagem: `A nova ordem precisa conter todos os ${conjunto}, sem repetir. Atualize a tela e tente de novo.`,
})

export async function reordenarGruposNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.reordenarGrupos.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { local, idsOrdenados } = validacao.data

  const concluido = await db.transaction(async (tx) => {
    const atuais = await tx
      .select({ id: cmsGruposNavegacao.id })
      .from(cmsGruposNavegacao)
      .where(eq(cmsGruposNavegacao.local, local))
      .orderBy(asc(cmsGruposNavegacao.ordem))
      .for('update')
    if (!ordenacaoEhCompleta(atuais.map(({ id }) => id), idsOrdenados)) return false

    // Em sequência, e não em paralelo: a transação usa uma conexão só.
    const agora = new Date()
    for (const [ordem, id] of idsOrdenados.entries()) {
      await tx
        .update(cmsGruposNavegacao)
        .set({ ordem, atualizadoPorId: gestor.id, updatedAt: agora })
        .where(eq(cmsGruposNavegacao.id, id))
    }
    await auditarNavegacao(tx, gestor.id, 'cms_grupo_navegacao', idsOrdenados[0], {
      operacao: 'grupos_reordenados',
      local,
      ordem: idsOrdenados,
    })
    return true
  })
  if (!concluido) return ORDEM_INCOMPLETA('grupos do local')
  revalidarCms({ navegacao: true })
  return { sucesso: true, mensagem: 'Ordem dos grupos salva.' }
}

/**
 * Reordena um conjunto de irmãos: as raízes do grupo (`paiId` nulo) ou os
 * filhos de um agrupador. A ordem de cada submenu é independente.
 */
export async function reordenarItensNavegacaoCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.reordenarItens.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { grupoId, paiId, idsOrdenados } = validacao.data

  const concluido = await db.transaction(async (tx) => {
    const carregado = await carregarGrupoComItens(tx, grupoId)
    if (!carregado) return false
    const atuais = irmaos(carregado.itens, grupoId, paiId)
    if (!ordenacaoEhCompleta(atuais.map(({ id }) => id), idsOrdenados)) return false

    const agora = new Date()
    for (const [ordem, id] of idsOrdenados.entries()) {
      await tx
        .update(cmsItensNavegacao)
        .set({ ordem, updatedAt: agora })
        .where(and(eq(cmsItensNavegacao.id, id), eq(cmsItensNavegacao.grupoId, grupoId)))
    }
    await auditarNavegacao(tx, gestor.id, 'cms_grupo_navegacao', grupoId, {
      operacao: 'itens_reordenados',
      paiId,
      ordem: idsOrdenados,
    })
    return true
  })
  if (!concluido) return ORDEM_INCOMPLETA(paiId ? 'itens do submenu' : 'itens do grupo')
  revalidarCms({ navegacao: true })
  return { sucesso: true, mensagem: 'Ordem dos itens salva.' }
}
