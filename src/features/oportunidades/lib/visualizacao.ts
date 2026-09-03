import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoLeituras } from '@/db/schema'
import { registrarLeitura } from '@/features/atendimentos/lib/leitura'

/**
 * "O profissional abriu a solicitação."
 *
 * ## Por que isto não é uma coluna nova
 *
 * `atendimento_leituras` já responde exatamente esta pergunta — *até quando
 * fulano leu tal coisa* — e foi escrita para receber recursos diferentes:
 * `escopo` diz de que tipo de recurso se trata e `recurso_id` aponta para ele.
 * Bastou um terceiro escopo. Uma coluna `visualizada_em` na oportunidade seria
 * mais curta de escrever e erraria a semântica: leitura é **por pessoa**, e a
 * mesma solicitação pode ter sido aberta por um e não pelo outro.
 *
 * A marca nunca anda para trás (`greatest` no `on conflict`, dentro de
 * `registrarLeitura`), então reabrir a solicitação não move a data que o
 * Cliente já viu.
 *
 * ## O que o Cliente lê a partir disto
 *
 * Só a marca **do destinatário**, e só nas solicitações privadas. Numa pública
 * não existe um destinatário de quem falar, e contar quantos prestadores
 * abriram seria expor a fila de trabalho de terceiros a quem pediu orçamento.
 */
export const ESCOPO_LEITURA_OPORTUNIDADE = 'oportunidade' as const

/** Canal único do escopo: a solicitação em si, não uma conversa dentro dela. */
export const CANAL_LEITURA_OPORTUNIDADE = 'solicitacao' as const

/** Grava que esta pessoa abriu esta solicitação. Idempotente por natureza. */
export async function registrarVisualizacao(
  usuarioId: string,
  oportunidadeId: string,
  quando: Date = new Date(),
) {
  await registrarLeitura(db, {
    usuarioId,
    escopo: ESCOPO_LEITURA_OPORTUNIDADE,
    recursoId: oportunidadeId,
    canal: CANAL_LEITURA_OPORTUNIDADE,
    lidoAte: quando,
  })
}

/**
 * Quando cada destinatário abriu a solicitação dele, em lote.
 *
 * Recebe pares `(oportunidade, destinatário)` porque a pergunta do Cliente é
 * sempre sobre **aquele** profissional: uma consulta por `recurso_id` sozinha
 * devolveria também a marca de quem não é o destinatário, e a lista do Cliente
 * passaria a afirmar "visualizada" por causa de alguém que ele não escolheu.
 */
export async function visualizacoesDosDestinatarios(
  pares: { oportunidadeId: string; destinatarioId: string }[],
): Promise<Map<string, Date>> {
  const marcas = new Map<string, Date>()
  if (!pares.length) return marcas

  const linhas = await db
    .select({
      recursoId: atendimentoLeituras.recursoId,
      usuarioId: atendimentoLeituras.usuarioId,
      lidoAte: atendimentoLeituras.lidoAte,
    })
    .from(atendimentoLeituras)
    .where(
      and(
        eq(atendimentoLeituras.escopo, ESCOPO_LEITURA_OPORTUNIDADE),
        eq(atendimentoLeituras.canal, CANAL_LEITURA_OPORTUNIDADE),
        inArray(
          atendimentoLeituras.recursoId,
          pares.map((par) => par.oportunidadeId),
        ),
        inArray(
          atendimentoLeituras.usuarioId,
          Array.from(new Set(pares.map((par) => par.destinatarioId))),
        ),
      ),
    )

  // O par é conferido de novo em memória: o `inArray` cruzado acima pode trazer
  // a marca de um destinatário de **outra** oportunidade da mesma lista.
  const esperado = new Set(
    pares.map((par) => `${par.oportunidadeId}:${par.destinatarioId}`),
  )
  for (const linha of linhas) {
    if (!esperado.has(`${linha.recursoId}:${linha.usuarioId}`)) continue
    marcas.set(linha.recursoId, linha.lidoAte)
  }

  return marcas
}
