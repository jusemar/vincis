'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cmsPaginas } from '@/db/schema'
import { ACOES_CMS, registrarEventoCms } from '../integracao/auditoria'
import { exigirAdministradorCms } from '../integracao/autorizacao'
import { schemasCms } from '../integracao/schemas'
import { CMS_SEM_AUTORIZACAO, falhaDeValidacao, violouRestricaoUnica } from '../lib/respostas'
import { revalidarCms } from '../lib/revalidacao'
import { idPaginaSchema } from '../nucleo/schemas'
import {
  aplicarTransicao,
  paginaEhEditavel,
  resolverPublicadaEm,
  type TransicaoPagina,
} from '../nucleo/lib/publicacao'
import type { ResultadoCms, StatusPagina } from '../nucleo/types'

/**
 * Mutações de páginas do CMS.
 *
 * Toda action começa pela mesma porta (`exigirAdministradorCms`): só o Gestor
 * da Plataforma passa, e esconder o botão não substitui isso. Depois vem a
 * validação no servidor — a do formulário é conforto, esta é a que vale — e a
 * gravação junto com o evento de auditoria, na mesma transação: ou os dois
 * acontecem, ou nenhum.
 *
 * Não existe exclusão física. "Excluir" é `arquivarPaginaCms`.
 */

const SLUG_EM_USO: ResultadoCms<never> = {
  sucesso: false,
  mensagem: 'Este endereço já está em uso por outra página.',
  campo: 'slug',
}
const NAO_ENCONTRADA: ResultadoCms<never> = { sucesso: false, mensagem: 'Página não encontrada.' }

export async function criarPaginaCms(entrada: unknown): Promise<ResultadoCms<{ id: string }>> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.criarPagina.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const dados = validacao.data

  try {
    const criada = await db.transaction(async (tx) => {
      const [pagina] = await tx
        .insert(cmsPaginas)
        .values({
          ...dados,
          status: 'rascunho',
          autorId: gestor.id,
          atualizadoPorId: gestor.id,
        })
        .returning({ id: cmsPaginas.id })
      await registrarEventoCms(
        {
          acao: ACOES_CMS.paginaCriada,
          entidade: 'cms_pagina',
          registroAfetado: pagina.id,
          autorId: gestor.id,
          metadados: { slug: dados.slug },
        },
        tx,
      )
      return pagina
    })
    // Rascunho não é público: só a Gestão precisa ver a página nova.
    revalidarCms({})
    return { sucesso: true, mensagem: 'Página criada como rascunho.', dados: criada }
  } catch (erro) {
    if (violouRestricaoUnica(erro, 'cms_paginas_slug_unique')) return SLUG_EM_USO
    throw erro
  }
}

export async function editarPaginaCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCms.editarPagina.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { paginaId, ...dados } = validacao.data

  try {
    const resultado = await db.transaction(async (tx) => {
      const [atual] = await tx
        .select({ slug: cmsPaginas.slug, status: cmsPaginas.status })
        .from(cmsPaginas)
        .where(eq(cmsPaginas.id, paginaId))
        .for('update')
        .limit(1)
      if (!atual) return { tipo: 'nao_encontrada' as const }
      const status = atual.status as StatusPagina
      if (!paginaEhEditavel(status)) return { tipo: 'arquivada' as const }

      await tx
        .update(cmsPaginas)
        .set({ ...dados, atualizadoPorId: gestor.id, updatedAt: new Date() })
        .where(eq(cmsPaginas.id, paginaId))
      await registrarEventoCms(
        {
          acao: ACOES_CMS.paginaEditada,
          entidade: 'cms_pagina',
          registroAfetado: paginaId,
          autorId: gestor.id,
          metadados: {
            slug: dados.slug,
            ...(atual.slug !== dados.slug ? { slugAnterior: atual.slug } : {}),
            status,
          },
        },
        tx,
      )
      return { tipo: 'editada' as const, slugAnterior: atual.slug, status }
    })

    if (resultado.tipo === 'nao_encontrada') return NAO_ENCONTRADA
    if (resultado.tipo === 'arquivada')
      return { sucesso: false, mensagem: 'Página arquivada não pode ser editada.' }

    // Só página publicada está no ar: é a única cuja edição o público vê,
    // inclusive no texto do link da navegação.
    const publicada = resultado.status === 'publicada'
    revalidarCms({
      slugs: publicada ? [resultado.slugAnterior, dados.slug] : [],
      publicadas: publicada && resultado.slugAnterior !== dados.slug,
      navegacao: publicada,
    })
    return { sucesso: true, mensagem: 'Página salva.' }
  } catch (erro) {
    if (violouRestricaoUnica(erro, 'cms_paginas_slug_unique')) return SLUG_EM_USO
    throw erro
  }
}

const EVENTO_DA_TRANSICAO = {
  publicar: ACOES_CMS.paginaPublicada,
  despublicar: ACOES_CMS.paginaDespublicada,
  arquivar: ACOES_CMS.paginaArquivada,
} as const

const MENSAGEM_DA_TRANSICAO: Record<TransicaoPagina, { feito: string; recusado: string }> = {
  publicar: { feito: 'Página publicada.', recusado: 'Só um rascunho pode ser publicado.' },
  despublicar: {
    feito: 'Página despublicada. Ela voltou a ser rascunho.',
    recusado: 'Só uma página publicada pode ser despublicada.',
  },
  arquivar: { feito: 'Página arquivada.', recusado: 'Esta página já está arquivada.' },
}

/** Os três movimentos de status passam por aqui: mesma porta, mesma trilha. */
async function moverPagina(entrada: unknown, transicao: TransicaoPagina): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = idPaginaSchema.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { paginaId } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const [atual] = await tx
      .select({
        slug: cmsPaginas.slug,
        status: cmsPaginas.status,
        publicadaEm: cmsPaginas.publicadaEm,
      })
      .from(cmsPaginas)
      .where(eq(cmsPaginas.id, paginaId))
      .for('update')
      .limit(1)
    if (!atual) return { tipo: 'nao_encontrada' as const }

    const anterior = atual.status as StatusPagina
    const destino = aplicarTransicao(anterior, transicao)
    if (!destino) return { tipo: 'recusada' as const }

    const agora = new Date()
    await tx
      .update(cmsPaginas)
      .set({
        status: destino,
        ...(transicao === 'publicar'
          ? { publicadaEm: resolverPublicadaEm(atual.publicadaEm, agora) }
          : {}),
        atualizadoPorId: gestor.id,
        updatedAt: agora,
      })
      .where(eq(cmsPaginas.id, paginaId))
    await registrarEventoCms(
      {
        acao: EVENTO_DA_TRANSICAO[transicao],
        entidade: 'cms_pagina',
        registroAfetado: paginaId,
        autorId: gestor.id,
        metadados: { slug: atual.slug, statusAnterior: anterior, status: destino },
      },
      tx,
    )
    return { tipo: 'movida' as const, slug: atual.slug }
  })

  if (resultado.tipo === 'nao_encontrada') return NAO_ENCONTRADA
  if (resultado.tipo === 'recusada')
    return { sucesso: false, mensagem: MENSAGEM_DA_TRANSICAO[transicao].recusado }

  // Entrar ou sair do ar muda a página e os links que apontam para ela.
  revalidarCms({ slugs: [resultado.slug], publicadas: true, navegacao: true })
  return { sucesso: true, mensagem: MENSAGEM_DA_TRANSICAO[transicao].feito }
}

export async function publicarPaginaCms(entrada: unknown) {
  return moverPagina(entrada, 'publicar')
}

export async function despublicarPaginaCms(entrada: unknown) {
  return moverPagina(entrada, 'despublicar')
}

/** "Excluir" no CMS: a página sai do ar e da navegação, e o registro fica. */
export async function arquivarPaginaCms(entrada: unknown) {
  return moverPagina(entrada, 'arquivar')
}
