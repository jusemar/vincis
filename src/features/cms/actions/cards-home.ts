'use server'

import { and, asc, count, eq, isNull, max } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cmsCardsHome, cmsPaginas } from '@/db/schema'
import { ACOES_CMS, registrarEventoCms } from '../integracao/auditoria'
import { exigirAdministradorCms } from '../integracao/autorizacao'
import { LIMITES_CARD_HOME, type TipoDestinoCardHome } from '../integracao/cards-home/constantes'
import { resolverDestinoCardHome } from '../integracao/cards-home/destino'
import { schemasCardsHome } from '../integracao/cards-home/schemas'
import { CMS_SEM_AUTORIZACAO, falhaDeValidacao } from '../lib/respostas'
import { revalidarCms } from '../lib/revalidacao'
import { ordenacaoEhCompleta } from '../nucleo/lib/ordenacao'
import type { ResultadoCms, StatusPagina } from '../nucleo/types'

/**
 * Mutações dos Cards da Home.
 *
 * Mesma porta e mesma trilha do resto do CMS: Gestor conferido no servidor a
 * cada chamada, entrada validada aqui, gravação e auditoria na mesma transação.
 * Toda mudança gera `cms_card_home_alterado` com a `operacao` nos metadados (e
 * nunca o texto inteiro do card, que já está na tabela).
 *
 * Proteções:
 * - destino de página só se a página estiver publicada (travada na transação);
 * - ativar exige destino no ar — um card ativo nunca leva a link quebrado;
 * - excluir é lógico, pede confirmação explícita e só vale para card já
 *   desativado: tirar do ar e apagar são dois gestos, nunca um clique só.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const CARD_NAO_ENCONTRADO: ResultadoCms<never> = { sucesso: false, mensagem: 'Card não encontrado.' }

async function auditarCard(
  tx: Tx,
  autorId: string,
  registroAfetado: string,
  metadados: Record<string, unknown> & { operacao: string },
) {
  await registrarEventoCms(
    {
      acao: ACOES_CMS.cardHomeAlterado,
      entidade: 'cms_card_home',
      registroAfetado,
      autorId,
      metadados,
    },
    tx,
  )
}

/**
 * Confere a página de destino (travada até o fim da transação: um arquivamento
 * concorrente não passa entre a conferência e a gravação).
 */
async function conferirPaginaDestino(tx: Tx, paginaId: string | null) {
  if (!paginaId) return null
  const [pagina] = await tx
    .select({ status: cmsPaginas.status, slug: cmsPaginas.slug })
    .from(cmsPaginas)
    .where(eq(cmsPaginas.id, paginaId))
    .for('update')
    .limit(1)
  if (!pagina) return 'Página não encontrada.'
  if (pagina.status !== 'publicada')
    return 'Escolha uma página publicada. Rascunho e página arquivada não aparecem no site.'
  return null
}

/** Card não excluído, travado. */
async function carregarCard(tx: Tx, cardId: string) {
  const [card] = await tx
    .select()
    .from(cmsCardsHome)
    .where(and(eq(cmsCardsHome.id, cardId), isNull(cmsCardsHome.excluidoEm)))
    .for('update')
    .limit(1)
  return card ?? null
}

/** Endereço público atual de um card gravado (para conferir ao ativar). */
async function destinoNoAr(
  tx: Tx,
  card: { destinoTipo: string; rota: string | null; paginaId: string | null },
) {
  let paginaSlug: string | null = null
  let paginaStatus: StatusPagina | null = null
  if (card.paginaId) {
    const [pagina] = await tx
      .select({ slug: cmsPaginas.slug, status: cmsPaginas.status })
      .from(cmsPaginas)
      .where(eq(cmsPaginas.id, card.paginaId))
      .for('update')
      .limit(1)
    paginaSlug = pagina?.slug ?? null
    paginaStatus = (pagina?.status as StatusPagina | undefined) ?? null
  }
  return resolverDestinoCardHome({
    destinoTipo: card.destinoTipo as TipoDestinoCardHome,
    rota: card.rota,
    paginaSlug,
    paginaStatus,
  })
}

export async function criarCardHomeCms(entrada: unknown): Promise<ResultadoCms<{ id: string }>> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCardsHome.criarCard.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const dados = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const erroPagina = await conferirPaginaDestino(tx, dados.paginaId)
    if (erroPagina) return { tipo: 'recusado' as const, mensagem: erroPagina, campo: 'paginaId' }

    // Card novo entra no fim da fila, sem pedir que alguém informe a ordem.
    const [{ ultima, total }] = await tx
      .select({ ultima: max(cmsCardsHome.ordem), total: count() })
      .from(cmsCardsHome)
      .where(isNull(cmsCardsHome.excluidoEm))
    if (total >= LIMITES_CARD_HOME.quantidade)
      return {
        tipo: 'recusado' as const,
        mensagem: `Limite de ${LIMITES_CARD_HOME.quantidade} cards atingido. Exclua um card antes de criar outro.`,
        campo: undefined,
      }
    const [criado] = await tx
      .insert(cmsCardsHome)
      .values({ ...dados, ordem: (ultima ?? -1) + 1, atualizadoPorId: gestor.id })
      .returning({ id: cmsCardsHome.id })
    await auditarCard(tx, gestor.id, criado.id, {
      operacao: 'card_criado',
      estilo: dados.estilo,
      destinoTipo: dados.destinoTipo,
      paginaId: dados.paginaId,
      rota: dados.rota,
      ativo: dados.ativo,
    })
    return { tipo: 'criado' as const, criado }
  })

  if (resultado.tipo === 'recusado')
    return { sucesso: false, mensagem: resultado.mensagem, campo: resultado.campo }
  revalidarCms({ cardsHome: true })
  return { sucesso: true, mensagem: 'Card criado.', dados: resultado.criado }
}

export async function editarCardHomeCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCardsHome.editarCard.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { cardId, ...dados } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const atual = await carregarCard(tx, cardId)
    if (!atual) return 'nao_encontrado' as const
    const erroPagina = await conferirPaginaDestino(tx, dados.paginaId)
    if (erroPagina) return erroPagina

    await tx
      .update(cmsCardsHome)
      .set({ ...dados, atualizadoPorId: gestor.id, updatedAt: new Date() })
      .where(eq(cmsCardsHome.id, cardId))
    await auditarCard(tx, gestor.id, cardId, {
      operacao: 'card_editado',
      estilo: dados.estilo,
      destinoAnterior: atual.destinoTipo === 'pagina' ? { paginaId: atual.paginaId } : { rota: atual.rota },
      destino: dados.destinoTipo === 'pagina' ? { paginaId: dados.paginaId } : { rota: dados.rota },
      ativoAnterior: atual.ativo,
      ativo: dados.ativo,
    })
    return 'editado' as const
  })

  if (resultado === 'nao_encontrado') return CARD_NAO_ENCONTRADO
  if (resultado !== 'editado') return { sucesso: false, mensagem: resultado, campo: 'paginaId' }
  revalidarCms({ cardsHome: true })
  return { sucesso: true, mensagem: 'Card salvo.' }
}

export async function alterarAtivacaoCardHomeCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCardsHome.alterarAtivacao.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { cardId, ativo } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const card = await carregarCard(tx, cardId)
    if (!card) return 'nao_encontrado' as const
    if (ativo && !(await destinoNoAr(tx, card))) return 'destino_fora_do_ar' as const

    await tx
      .update(cmsCardsHome)
      .set({ ativo, atualizadoPorId: gestor.id, updatedAt: new Date() })
      .where(eq(cmsCardsHome.id, cardId))
    await auditarCard(tx, gestor.id, cardId, { operacao: ativo ? 'card_ativado' : 'card_desativado' })
    return 'alterado' as const
  })

  if (resultado === 'nao_encontrado') return CARD_NAO_ENCONTRADO
  if (resultado === 'destino_fora_do_ar')
    return {
      sucesso: false,
      mensagem: 'O destino deste card não está no ar. Edite o card e escolha um destino publicado antes de ativar.',
    }
  revalidarCms({ cardsHome: true })
  return { sucesso: true, mensagem: ativo ? 'Card ativado.' : 'Card desativado.' }
}

/**
 * Exclusão lógica: o card sai da Gestão e do site, o registro fica para a
 * auditoria. Só card desativado — o Gestor tira do ar antes de excluir.
 */
export async function excluirCardHomeCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCardsHome.excluirCard.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { cardId } = validacao.data

  const resultado = await db.transaction(async (tx) => {
    const card = await carregarCard(tx, cardId)
    if (!card) return 'nao_encontrado' as const
    if (card.ativo) return 'ativo' as const

    const agora = new Date()
    await tx
      .update(cmsCardsHome)
      .set({ excluidoEm: agora, atualizadoPorId: gestor.id, updatedAt: agora })
      .where(eq(cmsCardsHome.id, cardId))
    await auditarCard(tx, gestor.id, cardId, {
      operacao: 'card_excluido',
      titulo: card.titulo,
      ordem: card.ordem,
    })
    return 'excluido' as const
  })

  if (resultado === 'nao_encontrado') return CARD_NAO_ENCONTRADO
  if (resultado === 'ativo')
    return { sucesso: false, mensagem: 'Desative o card antes de excluir.' }
  revalidarCms({ cardsHome: true })
  return { sucesso: true, mensagem: 'Card excluído.' }
}

/**
 * Nova ordem completa dos cards. O primeiro é o destacado na Home. Só aceita a
 * lista exata dos cards atuais — uma lista parcial (outra aba aberta, card
 * criado no meio) é recusada em vez de embaralhar a vitrine.
 */
export async function reordenarCardsHomeCms(entrada: unknown): Promise<ResultadoCms> {
  const gestor = await exigirAdministradorCms()
  if (!gestor) return CMS_SEM_AUTORIZACAO

  const validacao = schemasCardsHome.reordenar.safeParse(entrada)
  if (!validacao.success) return falhaDeValidacao(validacao.error)
  const { idsOrdenados } = validacao.data

  const concluido = await db.transaction(async (tx) => {
    const atuais = await tx
      .select({ id: cmsCardsHome.id })
      .from(cmsCardsHome)
      .where(isNull(cmsCardsHome.excluidoEm))
      .orderBy(asc(cmsCardsHome.ordem))
      .for('update')
    if (!ordenacaoEhCompleta(atuais.map(({ id }) => id), idsOrdenados)) return false

    // Em sequência: a transação usa uma conexão só.
    const agora = new Date()
    for (const [ordem, id] of idsOrdenados.entries()) {
      await tx
        .update(cmsCardsHome)
        .set({ ordem, atualizadoPorId: gestor.id, updatedAt: agora })
        .where(eq(cmsCardsHome.id, id))
    }
    await auditarCard(tx, gestor.id, idsOrdenados[0], {
      operacao: 'cards_reordenados',
      ordem: idsOrdenados,
    })
    return true
  })

  if (!concluido)
    return {
      sucesso: false,
      mensagem: 'A nova ordem precisa conter todos os cards, sem repetir. Atualize a tela e tente de novo.',
    }
  revalidarCms({ cardsHome: true })
  return { sucesso: true, mensagem: 'Ordem dos cards salva.' }
}
