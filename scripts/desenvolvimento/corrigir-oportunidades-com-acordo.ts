/**
 * Fecha solicitações que já têm acordo mas ficaram `aberta`.
 *
 * Correção pontual de dados deixados pela inconsistência entre os dois caminhos
 * do acordo: aceitar a proposta direta encerrava a solicitação, aceitar a
 * **contraproposta** registrava o acordo e deixava a solicitação no ar — ainda
 * recebendo propostas de quem já tinha perdido a disputa. O código passou a
 * tratar os dois caminhos igual (`fecharAcordoComercial`), mas as linhas
 * gravadas antes disso continuam erradas no banco.
 *
 * O que faz, e só isso: para cada oportunidade `aberta` que tem uma proposta
 * `aceita`, grava `status = 'encerrada'` e `encerrada_em`. Nenhuma proposta é
 * alterada, nenhuma linha é apagada, nenhum valor é recalculado e nada é
 * criado. Idempotente: rodar de novo não encontra mais nada.
 *
 * `encerrada_em` recebe a data do **aceite**, não a de agora: o acordo foi
 * fechado naquele momento, e carimbar hoje mentiria sobre quando a solicitação
 * saiu do ar.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/corrigir-oportunidades-com-acordo.ts [--aplicar]
 */
import { and, eq, isNull } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { oportunidadePropostas, oportunidades } from '../../src/db/schema'

const aplicar = process.argv.includes('--aplicar')

const pendentes = await db
  .select({
    id: oportunidades.id,
    titulo: oportunidades.titulo,
    status: oportunidades.status,
    aceitaEm: oportunidadePropostas.aceitaEm,
  })
  .from(oportunidades)
  .innerJoin(
    oportunidadePropostas,
    eq(oportunidadePropostas.oportunidadeId, oportunidades.id),
  )
  .where(
    and(
      eq(oportunidadePropostas.status, 'aceita'),
      eq(oportunidades.status, 'aberta'),
      isNull(oportunidades.encerradaEm),
    ),
  )

if (!pendentes.length) {
  console.log('Nada a corrigir: nenhuma solicitação aberta com acordo fechado.')
} else {
  console.table(
    pendentes.map((linha) => ({
      titulo: linha.titulo.slice(0, 50),
      status: linha.status,
      acordoEm: linha.aceitaEm?.toISOString() ?? '(sem data)',
    })),
  )

  if (!aplicar) {
    console.log(
      `\n${pendentes.length} solicitação(ões) a corrigir. Rode com --aplicar para gravar.`,
    )
  } else {
    for (const linha of pendentes) {
      await db
        .update(oportunidades)
        .set({
          status: 'encerrada',
          encerradaEm: linha.aceitaEm ?? new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oportunidades.id, linha.id),
            eq(oportunidades.status, 'aberta'),
          ),
        )
    }
    console.log(`\n${pendentes.length} solicitação(ões) encerrada(s).`)
  }
}

await conexaoPostgres.end()
