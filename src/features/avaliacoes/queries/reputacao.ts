import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { avaliacoesAtendimento, atendimentos, usuarios } from '@/db/schema'
import { LIMITE_AVALIACOES_PUBLICAS } from '../constants/avaliacao'
import type {
  AvaliacaoPublicaDTO,
  DistribuicaoDeNotas,
  ReputacaoDoPrestador,
} from '../types/avaliacao'

/**
 * A reputação de um Prestador — **a** definição, não uma delas.
 *
 * Card de `/profissionais`, perfil público, Meu Perfil, Dashboard e a página de
 * Avaliações do painel leem daqui. Antes de existir esta função a nota vinha de
 * duas colunas guardadas em `perfis_profissionais`, escritas por script de
 * demonstração; a partir daqui ela é sempre a agregação das linhas reais.
 *
 * Nada é persistido: média guardada é média que um dia diverge das avaliações
 * que a formaram, e a divergência aparece justamente onde ninguém olha — o card
 * dizendo 4,8 ao lado de um perfil que soma 4,2. `count` e `avg` sobre um
 * índice por prestador custam menos do que a manutenção dessa coerência.
 *
 * O contrato é deliberadamente redundante:
 *
 * - `media` é o número exato (4.75), para quem quiser formatar por conta;
 * - `mediaEmDecimos` é o mesmo número arredondado e multiplicado por dez (48),
 *   que é a convenção que as telas aprovadas já usam (`valor / 10`). Assim os
 *   componentes visuais **não mudam nada** — só passam a receber o dado real;
 * - `total` é a contagem, e é ele que distingue "sem avaliações" de "nota
 *   zero". Nenhuma tela deve inferir isso da média.
 */
export type { ReputacaoDoPrestador }

const REPUTACAO_VAZIA: Omit<ReputacaoDoPrestador, 'prestadorId'> = {
  media: null,
  mediaEmDecimos: null,
  total: 0,
}

/**
 * Reputação de vários Prestadores de uma vez.
 *
 * Uma consulta agregada para a página inteira de `/profissionais`, e não uma
 * por card: nove cards renderizando nove consultas é o caminho conhecido para
 * uma vitrine lenta. Quem não tem avaliação nenhuma volta com `total: 0` — o
 * mapa é preenchido para todos os ids pedidos, para que a tela nunca precise
 * distinguir "não consultado" de "sem avaliações".
 */
export async function obterReputacaoDosPrestadores(
  prestadorIds: string[],
): Promise<Map<string, ReputacaoDoPrestador>> {
  const ids = Array.from(new Set(prestadorIds.filter(Boolean)))
  const mapa = new Map<string, ReputacaoDoPrestador>(
    ids.map((prestadorId) => [prestadorId, { prestadorId, ...REPUTACAO_VAZIA }]),
  )
  if (!ids.length) return mapa

  const linhas = await db
    .select({
      prestadorId: avaliacoesAtendimento.prestadorId,
      total: sql<number>`count(*)::int`,
      // `avg` devolve numeric (string no driver). O cast para float8 mantém o
      // número em ponto flutuante do lado do banco, onde ele é exato o bastante
      // para uma média de inteiros de 1 a 5.
      media: sql<number>`avg(${avaliacoesAtendimento.nota})::float8`,
    })
    .from(avaliacoesAtendimento)
    .where(inArray(avaliacoesAtendimento.prestadorId, ids))
    .groupBy(avaliacoesAtendimento.prestadorId)

  for (const linha of linhas) {
    if (!linha.total) continue
    mapa.set(linha.prestadorId, {
      prestadorId: linha.prestadorId,
      media: linha.media,
      mediaEmDecimos: Math.round(linha.media * 10),
      total: linha.total,
    })
  }
  return mapa
}

/** A mesma regra, para um Prestador só. */
export async function obterReputacaoDoPrestador(
  prestadorId: string,
): Promise<ReputacaoDoPrestador> {
  const mapa = await obterReputacaoDosPrestadores([prestadorId])
  return mapa.get(prestadorId) ?? { prestadorId, ...REPUTACAO_VAZIA }
}

/**
 * Comentários públicos de um Prestador, mais recentes primeiro.
 *
 * O que é público aqui é o mínimo que o card aprovado desenha: estrelas, texto
 * e o nome de quem escreveu. E-mail, WhatsApp, documento e id do Cliente não
 * são selecionados — o que não sai do banco não vaza da página.
 *
 * Avaliação sem comentário não entra: um card vazio com estrelas soltas não é
 * "comentário de cliente", e ela já conta na média e no total, que é onde ela
 * pertence.
 */
export async function listarAvaliacoesPublicas(
  prestadorId: string,
  limite = LIMITE_AVALIACOES_PUBLICAS,
): Promise<AvaliacaoPublicaDTO[]> {
  const linhas = await db
    .select({
      id: avaliacoesAtendimento.id,
      nota: avaliacoesAtendimento.nota,
      comentario: avaliacoesAtendimento.comentario,
      autor: usuarios.nome,
      criadoEm: avaliacoesAtendimento.createdAt,
    })
    .from(avaliacoesAtendimento)
    .innerJoin(usuarios, eq(usuarios.id, avaliacoesAtendimento.clienteUsuarioId))
    .where(
      and(
        eq(avaliacoesAtendimento.prestadorId, prestadorId),
        isNotNull(avaliacoesAtendimento.comentario),
        ne(avaliacoesAtendimento.comentario, ''),
      ),
    )
    .orderBy(desc(avaliacoesAtendimento.createdAt))
    .limit(limite)

  return linhas.map((linha) => ({
    id: linha.id,
    nota: linha.nota,
    comentario: linha.comentario ?? '',
    autor: linha.autor,
    criadoEm: linha.criadoEm.toISOString(),
  }))
}

/**
 * Quantas avaliações cada nota recebeu, de 5 a 1.
 *
 * Serve o gráfico de barras que a página de Avaliações do painel já desenha.
 * As cinco faixas sempre voltam, mesmo zeradas, porque o desenho tem cinco
 * linhas — omitir a faixa vazia mudaria o layout aprovado.
 */
export async function obterDistribuicaoDeNotas(
  prestadorId: string,
): Promise<DistribuicaoDeNotas[]> {
  const linhas = await db
    .select({
      nota: avaliacoesAtendimento.nota,
      total: sql<number>`count(*)::int`,
    })
    .from(avaliacoesAtendimento)
    .where(eq(avaliacoesAtendimento.prestadorId, prestadorId))
    .groupBy(avaliacoesAtendimento.nota)

  const porNota = new Map(linhas.map((linha) => [linha.nota, linha.total]))
  const total = linhas.reduce((soma, linha) => soma + linha.total, 0)

  return [5, 4, 3, 2, 1].map((nota) => {
    const quantidade = porNota.get(nota) ?? 0
    return {
      nota,
      total: quantidade,
      // Sem avaliação nenhuma a barra fica em zero, e não em `NaN`.
      percentual: total ? Math.round((quantidade / total) * 100) : 0,
    }
  })
}

/**
 * As avaliações que este Prestador recebeu, para a tela dele.
 *
 * Diferente da lista pública em dois pontos: traz também as que vieram sem
 * comentário (a nota conta, e ele tem o direito de ver de onde ela veio) e o
 * protocolo do Atendimento, que é o contexto que transforma "4 estrelas" em
 * algo sobre o que agir.
 */
export async function listarAvaliacoesRecebidas(
  prestadorId: string,
  limite = 50,
) {
  const linhas = await db
    .select({
      id: avaliacoesAtendimento.id,
      nota: avaliacoesAtendimento.nota,
      comentario: avaliacoesAtendimento.comentario,
      autor: usuarios.nome,
      criadoEm: avaliacoesAtendimento.createdAt,
      protocolo: atendimentos.protocolo,
      atendimentoTitulo: atendimentos.titulo,
    })
    .from(avaliacoesAtendimento)
    .innerJoin(usuarios, eq(usuarios.id, avaliacoesAtendimento.clienteUsuarioId))
    .innerJoin(
      atendimentos,
      eq(atendimentos.id, avaliacoesAtendimento.atendimentoId),
    )
    .where(eq(avaliacoesAtendimento.prestadorId, prestadorId))
    .orderBy(desc(avaliacoesAtendimento.createdAt))
    .limit(limite)

  return linhas.map((linha) => ({
    id: linha.id,
    nota: linha.nota,
    comentario: linha.comentario,
    autor: linha.autor,
    criadoEm: linha.criadoEm.toISOString(),
    protocolo: linha.protocolo,
    atendimentoTitulo: linha.atendimentoTitulo,
  }))
}
