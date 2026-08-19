import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import { notificacoes, usuarios } from '@/db/schema'
import {
  LIMITE_NOTIFICACOES_CARREGADAS,
  type DestinoNotificacao,
  type RecursoNotificacao,
} from '../constants/notificacao'

const autorConta = alias(usuarios, 'notificacao_autor')

export type NotificacaoDTO = {
  id: string
  tipo: string
  titulo: string
  resumo: string
  recursoTipo: RecursoNotificacao
  recursoId: string
  atendimentoId: string | null
  protocolo: string | null
  destino: DestinoNotificacao
  lida: boolean
  criadoEm: string
  autorNome: string | null
}

/**
 * A caixa de notificações de uma pessoa.
 *
 * O `where` por destinatário é a autorização inteira, e ela está no SQL: não
 * existe consulta que traga a caixa de outra pessoa, nem passando o id dela.
 * Nada aqui resolve o recurso apontado — o título e o protocolo foram
 * congelados na criação justamente para que listar avisos não vire uma leitura
 * de Atendimentos que a pessoa talvez já não alcance.
 */
export async function listarNotificacoesDoUsuario(
  usuarioId: string,
  limite = LIMITE_NOTIFICACOES_CARREGADAS,
): Promise<NotificacaoDTO[]> {
  const linhas = await db
    .select({
      id: notificacoes.id,
      tipo: notificacoes.tipo,
      titulo: notificacoes.titulo,
      resumo: notificacoes.resumo,
      recursoTipo: notificacoes.recursoTipo,
      recursoId: notificacoes.recursoId,
      atendimentoId: notificacoes.atendimentoId,
      protocolo: notificacoes.protocolo,
      destino: notificacoes.destino,
      lidaEm: notificacoes.lidaEm,
      criadoEm: notificacoes.createdAt,
      autorNome: autorConta.nome,
    })
    .from(notificacoes)
    .leftJoin(autorConta, eq(autorConta.id, notificacoes.autorId))
    .where(eq(notificacoes.destinatarioId, usuarioId))
    .orderBy(desc(notificacoes.createdAt))
    .limit(limite)

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo,
    titulo: linha.titulo,
    resumo: linha.resumo,
    recursoTipo: linha.recursoTipo as RecursoNotificacao,
    recursoId: linha.recursoId,
    atendimentoId: linha.atendimentoId,
    protocolo: linha.protocolo,
    destino: linha.destino as DestinoNotificacao,
    lida: linha.lidaEm !== null,
    criadoEm: linha.criadoEm.toISOString(),
    autorNome: linha.autorNome,
  }))
}

/**
 * Quantas notificações não lidas a pessoa tem.
 *
 * Conta o que está na caixa dela, e só isso. Um contador que somasse avisos de
 * recursos alheios revelaria que eles existem — por isso a contagem sai da
 * mesma cláusula por destinatário que a listagem usa.
 */
export async function contarNaoLidasDoUsuario(usuarioId: string) {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, usuarioId),
        isNull(notificacoes.lidaEm),
      ),
    )
  return linha?.total ?? 0
}
