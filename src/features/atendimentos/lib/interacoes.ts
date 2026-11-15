import { and, eq, inArray, or, sql } from 'drizzle-orm'
import {
  atendimentoArquivos,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentos,
} from '@/db/schema'
import { TIPOS_EVENTO_ATENDIMENTO } from '../constants/atendimento'
import type { ResumoDeInteracoes } from './andamento'
import type { ExecutorDb } from './executor'

/**
 * A última interação **real** de cada lado, por Atendimento.
 *
 * As quatro fontes do que conta como interação (ver `andamento.ts`):
 *
 * - conversa com o Cliente (`escopo = 'cliente'`) — o lado é decidido pelo
 *   autor: o dono do Atendimento é "cliente"; qualquer outro, "profissional".
 *   A conversa interna da equipe fica de fora;
 * - manifestação do Protocolo — `papel_autor` já diz o lado;
 * - arquivo enviado pelo Cliente ou pela equipe (`origem = 'sistema'` fica de fora);
 * - o pedido explícito ao Cliente — o evento `solicitacao_ao_cliente` ou a troca
 *   de status para `aguardando_cliente`. É o único evento que conta, porque é
 *   uma pessoa se dirigindo ao Cliente, e não registro técnico.
 *
 * Agregado no banco (`max` por lado) — a lista do Cliente e a rotina diária
 * precisam só da última de cada lado, não do histórico inteiro.
 */
export async function resumirInteracoes(
  executor: ExecutorDb,
  ids: string[],
): Promise<Map<string, ResumoDeInteracoes>> {
  const resumo = new Map<string, ResumoDeInteracoes>()
  if (!ids.length) return resumo
  for (const id of ids) resumo.set(id, { ultimaDoCliente: null, ultimaDoProfissional: null })

  const anotar = (atendimentoId: string, doCliente: boolean, em: Date | null) => {
    const atual = resumo.get(atendimentoId)
    if (!atual || !em) return
    const chave = doCliente ? 'ultimaDoCliente' : 'ultimaDoProfissional'
    if (!atual[chave] || em.getTime() > atual[chave]!.getTime()) atual[chave] = em
  }

  const ladoDaMensagem = sql<boolean>`${atendimentoMensagens.autorId} = ${atendimentos.clienteUsuarioId}`
  const ladoDaManifestacao = sql<boolean>`${atendimentoManifestacoes.papelAutor} = 'cliente'`
  const ladoDoArquivo = sql<boolean>`${atendimentoArquivos.origem} = 'cliente'`

  const [mensagens, manifestacoes, arquivos, pedidos] = await Promise.all([
    executor
      .select({
        atendimentoId: atendimentoMensagens.atendimentoId,
        doCliente: ladoDaMensagem.mapWith(Boolean),
        em: sql<Date>`max(${atendimentoMensagens.createdAt})`.mapWith(atendimentoMensagens.createdAt),
      })
      .from(atendimentoMensagens)
      .innerJoin(atendimentos, eq(atendimentos.id, atendimentoMensagens.atendimentoId))
      .where(and(inArray(atendimentoMensagens.atendimentoId, ids), eq(atendimentoMensagens.escopo, 'cliente')))
      .groupBy(atendimentoMensagens.atendimentoId, ladoDaMensagem),
    executor
      .select({
        atendimentoId: atendimentoManifestacoes.atendimentoId,
        doCliente: ladoDaManifestacao.mapWith(Boolean),
        em: sql<Date>`max(${atendimentoManifestacoes.createdAt})`.mapWith(atendimentoManifestacoes.createdAt),
      })
      .from(atendimentoManifestacoes)
      .where(inArray(atendimentoManifestacoes.atendimentoId, ids))
      .groupBy(atendimentoManifestacoes.atendimentoId, ladoDaManifestacao),
    executor
      .select({
        atendimentoId: atendimentoArquivos.atendimentoId,
        doCliente: ladoDoArquivo.mapWith(Boolean),
        em: sql<Date>`max(${atendimentoArquivos.createdAt})`.mapWith(atendimentoArquivos.createdAt),
      })
      .from(atendimentoArquivos)
      .where(
        and(
          inArray(atendimentoArquivos.atendimentoId, ids),
          inArray(atendimentoArquivos.origem, ['cliente', 'prestador']),
        ),
      )
      .groupBy(atendimentoArquivos.atendimentoId, ladoDoArquivo),
    executor
      .select({
        atendimentoId: atendimentoEventos.atendimentoId,
        em: sql<Date>`max(${atendimentoEventos.createdAt})`.mapWith(atendimentoEventos.createdAt),
      })
      .from(atendimentoEventos)
      .where(
        and(
          inArray(atendimentoEventos.atendimentoId, ids),
          or(
            eq(atendimentoEventos.tipo, TIPOS_EVENTO_ATENDIMENTO.solicitacaoAoCliente),
            and(
              eq(atendimentoEventos.tipo, TIPOS_EVENTO_ATENDIMENTO.statusAlterado),
              sql`${atendimentoEventos.metadados}->>'para' = 'aguardando_cliente'`,
            ),
          ),
        ),
      )
      .groupBy(atendimentoEventos.atendimentoId),
  ])

  for (const linha of [...mensagens, ...manifestacoes, ...arquivos]) {
    anotar(linha.atendimentoId, linha.doCliente, linha.em)
  }
  for (const linha of pedidos) anotar(linha.atendimentoId, false, linha.em)
  return resumo
}
