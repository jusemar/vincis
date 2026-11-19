'use server'

import { and, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
  cmsCardsHome,
  conhecimentoArtigos,
  conhecimentoDestaquesHome,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { registrarEventoConhecimento } from '../lib/auditoria'
import { obterModeradorDaSessao } from '../lib/autorizacao'
import { SEM_PERMISSAO, respostaDeErro, type RespostaAcao } from '../lib/respostas'
import { revalidarConhecimento } from '../lib/revalidacao'
import { condicaoPublicado } from '../queries/publico'

const Schema = z.object({
  cardId: z.string().uuid(),
  /** `null` restaura o conteúdo original do card. */
  artigoId: z.string().uuid().nullable(),
  /**
   * Editor do artigo: se o artigo já ocupa outro card, libera aquele card (que
   * volta ao original) na mesma transação. Sem a opção, a regra continua a da
   * Gestão: recusa e pede para restaurar o outro card primeiro.
   */
  liberarCardAnterior: z.boolean().optional().default(false),
})

/**
 * Gestão escolhe um artigo publicado para um card da Home, troca ou restaura o
 * original. Só o vínculo é gravado — o card do CMS segue intacto. O servidor
 * confere que o artigo está publicado agora (mesma regra da Central) e que não
 * ocupa outro card.
 */
export async function definirArtigoNoCardHome(entrada: unknown): Promise<RespostaAcao> {
  const gestor = await obterModeradorDaSessao()
  if (!gestor) return SEM_PERMISSAO
  const validacao = Schema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar destaque da Home')
  const { cardId, artigoId, liberarCardAnterior } = validacao.data

  try {
    const [card] = await db
      .select({ id: cmsCardsHome.id })
      .from(cmsCardsHome)
      .where(and(eq(cmsCardsHome.id, cardId), isNull(cmsCardsHome.excluidoEm)))
      .limit(1)
    if (!card) return { sucesso: false, mensagem: 'Card da Home não encontrado.' }

    let cardAnterior: string | null = null
    if (artigoId) {
      const [publicado] = await db
        .select({ id: conhecimentoArtigos.id })
        .from(conhecimentoArtigos)
        .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
        .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
        .where(and(eq(conhecimentoArtigos.id, artigoId), condicaoPublicado()))
        .limit(1)
      if (!publicado) return { sucesso: false, mensagem: 'Só artigos publicados podem aparecer na Home.' }
      const [emOutroCard] = await db
        .select({ cardId: conhecimentoDestaquesHome.cardId })
        .from(conhecimentoDestaquesHome)
        .where(and(eq(conhecimentoDestaquesHome.artigoId, artigoId), ne(conhecimentoDestaquesHome.cardId, cardId)))
        .limit(1)
      if (emOutroCard && !liberarCardAnterior) {
        return { sucesso: false, mensagem: 'Este artigo já está em outro card. Restaure aquele card primeiro.' }
      }
      cardAnterior = emOutroCard?.cardId ?? null
    }

    await db.transaction(async (tx) => {
      if (cardAnterior) {
        await tx
          .update(conhecimentoDestaquesHome)
          .set({ artigoId: null, definidoPorId: gestor.id, updatedAt: new Date() })
          .where(eq(conhecimentoDestaquesHome.cardId, cardAnterior))
      }
      await tx
        .insert(conhecimentoDestaquesHome)
        .values({ cardId, artigoId, definidoPorId: gestor.id, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: conhecimentoDestaquesHome.cardId,
          set: { artigoId, definidoPorId: gestor.id, updatedAt: new Date() },
        })
    })
    await registrarEventoConhecimento({
      acao: ACOES_AUDITORIA.conhecimentoDestaqueHomeAlterado,
      entidade: 'cms_card_home',
      registroAfetado: cardId,
      autorId: gestor.id,
      origem: 'gestao_vincis',
      metadados: { artigoId, cardAnterior, operacao: artigoId ? 'artigo_definido' : 'original_restaurado' },
    })
    revalidarConhecimento()
    return { sucesso: true, mensagem: artigoId ? 'Artigo exibido no card da Home.' : 'Conteúdo original do card restaurado.' }
  } catch (erro) {
    return respostaDeErro(erro, 'definir destaque da Home')
  }
}
