import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidadePropostas, oportunidades } from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import { avisarEmTempoReal } from './difundir-oportunidade'

/**
 * Quantas solicitações vencidas cada volta processa.
 *
 * Um teto existe para que a consulta nunca cresça sem limite — hoje o volume é
 * de dezenas, mas uma varredura horária que um dia encontrasse dez mil linhas
 * não pode carregá-las todas na memória de uma função serverless. Duzentas por
 * volta é folgado para o volume real e pequeno o bastante para caber em
 * qualquer execução.
 */
export const LOTE_OPORTUNIDADES_VENCIDAS = 200

/**
 * Teto de voltas por execução.
 *
 * Sem ele, um erro de lógica viraria laço infinito dentro do agendador. Com
 * ele, o pior caso é sobrar trabalho para a execução seguinte — que virá em uma
 * hora, e é exatamente para isso que o agendador é periódico.
 */
const MAXIMO_DE_VOLTAS = 25

export type ResumoExpiracao = {
  expiradas: number
  avisos: number
}

/**
 * Materializa o vencimento das solicitações e avisa quem precisa saber.
 *
 * ## Por que isto existe além de `expirarOportunidadesVencidas`
 *
 * Aquela função é um `UPDATE` mudo — ela existia para que uma leitura pudesse
 * consertar o estado de passagem, sem efeito colateral nenhum. Esta é a rotina
 * do **agendador**: ela também avisa, e avisar é um efeito que não pode
 * acontecer durante a renderização de uma página.
 *
 * ## Idempotência
 *
 * Duas garantias, nenhuma delas no código de aplicação:
 *
 * 1. o `UPDATE` filtra por `status = 'aberta'` e devolve as linhas que **ele**
 *    alterou. Duas execuções concorrentes disputam as mesmas linhas e apenas
 *    uma delas as recebe de volta — a outra recebe lista vazia e não avisa
 *    ninguém;
 * 2. a notificação leva `chaveDedupe`, e o índice único de `notificacoes`
 *    recusa a repetida mesmo que o passo 1 falhasse.
 *
 * ## Quem é avisado
 *
 * O Cliente dono, sempre: a solicitação dele morreu sem acordo e ele precisa
 * saber para decidir o que fazer. E quem **enviou proposta**, porque ficou
 * esperando resposta de algo que não vai responder. Ninguém mais: os demais
 * prestadores da categoria apenas viram a solicitação passar, e avisá-los seria
 * transformar o sino em mural de coisas que não lhes dizem respeito.
 */
export async function processarOportunidadesVencidas(
  agora = new Date(),
): Promise<ResumoExpiracao> {
  let expiradas = 0
  let avisos = 0

  for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta += 1) {
    /**
     * O `UPDATE` é a trava.
     *
     * O subselect escolhe o lote; o `where` externo repete `status = 'aberta'`
     * porque entre o subselect e a escrita outra execução pode ter chegado
     * primeiro. Quem alterou a linha é quem a recebe em `returning` — e só quem
     * a recebeu avisa.
     */
    const lote = await db
      .update(oportunidades)
      .set({ status: 'expirada', updatedAt: agora })
      .where(
        and(
          eq(oportunidades.status, 'aberta'),
          isNotNull(oportunidades.expiraEm),
          lte(oportunidades.expiraEm, agora),
          inArray(
            oportunidades.id,
            db
              .select({ id: oportunidades.id })
              .from(oportunidades)
              .where(
                and(
                  eq(oportunidades.status, 'aberta'),
                  isNotNull(oportunidades.expiraEm),
                  lte(oportunidades.expiraEm, agora),
                ),
              )
              .limit(LOTE_OPORTUNIDADES_VENCIDAS),
          ),
        ),
      )
      .returning({
        id: oportunidades.id,
        titulo: oportunidades.titulo,
        clienteUsuarioId: oportunidades.clienteUsuarioId,
      })

    if (!lote.length) break
    expiradas += lote.length

    const ids = lote.map(({ id }) => id)
    // Quem chegou a propor. Uma consulta para o lote inteiro — uma por
    // solicitação seria uma ida ao banco por linha vencida.
    const propostas = await db
      .select({
        oportunidadeId: oportunidadePropostas.oportunidadeId,
        prestadorId: oportunidadePropostas.prestadorId,
      })
      .from(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, ids))

    const proponentes = new Map<string, string[]>()
    for (const linha of propostas) {
      const lista = proponentes.get(linha.oportunidadeId) ?? []
      lista.push(linha.prestadorId)
      proponentes.set(linha.oportunidadeId, lista)
    }

    for (const solicitacao of lote) {
      const destinatarios = [
        solicitacao.clienteUsuarioId,
        ...(proponentes.get(solicitacao.id) ?? []),
      ]
      avisos += await emitirNotificacoes(db, {
        destinatarios,
        // Ninguém provocou: o relógio andou. Um autor aqui faria a própria
        // pessoa deixar de receber o aviso do próprio prazo.
        autorId: null,
        tipo: TIPOS_NOTIFICACAO.oportunidadeExpirada,
        titulo: 'Uma solicitação de orçamento expirou',
        resumo: resumirTexto(solicitacao.titulo, 200),
        recursoTipo: 'oportunidade',
        recursoId: solicitacao.id,
        atendimentoId: null,
        protocolo: null,
        // Um aviso por pessoa para este vencimento, para sempre: a solicitação
        // expira uma vez só, e o índice único é quem garante.
        chaveDedupe: `${TIPOS_NOTIFICACAO.oportunidadeExpirada}:${solicitacao.id}`,
        destino: { pagina: 'oportunidades', oportunidadeId: solicitacao.id },
      })

      // Depois do commit do lote: a tela recebe "algo mudou" e refaz a
      // consulta, que aplica autorização. Nenhum dado da solicitação viaja.
      await avisarEmTempoReal({
        destinatarios,
        titulo: 'Uma solicitação de orçamento expirou',
        oportunidadeId: solicitacao.id,
      })
    }

    // Lote incompleto significa que não sobrou nada para a próxima volta.
    if (lote.length < LOTE_OPORTUNIDADES_VENCIDAS) break
  }

  return { expiradas, avisos }
}

/** Quantas solicitações estão vencidas e ainda marcadas como abertas. */
export async function contarOportunidadesPendentesDeExpiracao(
  agora = new Date(),
) {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(oportunidades)
    .where(
      and(
        eq(oportunidades.status, 'aberta'),
        isNotNull(oportunidades.expiraEm),
        lte(oportunidades.expiraEm, agora),
      ),
    )
  return linha?.total ?? 0
}
