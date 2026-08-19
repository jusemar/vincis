/**
 * Mostra os Atendimentos que estão em execução, com o que a conclusão precisa.
 *
 * Só leitura: serve para escolher, com dado real na frente, qual Atendimento
 * usar no teste de conclusão com entrega e qual usar no teste sem entrega.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/inspecionar-atendimentos-para-conclusao.ts
 */
import { desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentos,
  usuarios,
} from '../../src/db/schema'

const prestadorConta = alias(usuarios, 'prestador_conta')
const clienteConta = alias(usuarios, 'cliente_conta')

const emExecucao = await db
  .select({
    id: atendimentos.id,
    protocolo: atendimentos.protocolo,
    titulo: atendimentos.titulo,
    status: atendimentos.status,
    prestador: prestadorConta.nome,
    prestadorEmail: prestadorConta.email,
    cliente: clienteConta.nome,
    clienteEmail: clienteConta.email,
  })
  .from(atendimentos)
  .innerJoin(prestadorConta, eq(prestadorConta.id, atendimentos.prestadorId))
  .innerJoin(clienteConta, eq(clienteConta.id, atendimentos.clienteUsuarioId))
  .where(inArray(atendimentos.status, ['em_andamento', 'aguardando_assinatura']))
  .orderBy(desc(atendimentos.createdAt))

if (!emExecucao.length) {
  console.log('Nenhum Atendimento em execução.')
} else {
  const ids = emExecucao.map(({ id }) => id)
  const arquivos = await db
    .select({
      atendimentoId: atendimentoArquivos.atendimentoId,
      id: atendimentoArquivos.id,
      nome: atendimentoArquivos.nome,
      finalidade: atendimentoArquivos.finalidade,
    })
    .from(atendimentoArquivos)
    .where(inArray(atendimentoArquivos.atendimentoId, ids))
  const etapas = await db
    .select({
      atendimentoId: atendimentoChecklistItens.atendimentoId,
      titulo: atendimentoChecklistItens.titulo,
      concluido: atendimentoChecklistItens.concluido,
    })
    .from(atendimentoChecklistItens)
    .where(inArray(atendimentoChecklistItens.atendimentoId, ids))

  for (const atendimento of emExecucao) {
    const meus = arquivos.filter((a) => a.atendimentoId === atendimento.id)
    const pendentes = etapas.filter(
      (e) => e.atendimentoId === atendimento.id && !e.concluido,
    )
    console.log(`\n${atendimento.protocolo} — ${atendimento.titulo} [${atendimento.status}]`)
    console.log(`  id: ${atendimento.id}`)
    console.log(`  prestador: ${atendimento.prestador} <${atendimento.prestadorEmail}>`)
    console.log(`  cliente: ${atendimento.cliente} <${atendimento.clienteEmail}>`)
    console.log(
      `  arquivos: ${meus.length ? meus.map((a) => `${a.nome} (${a.finalidade}) ${a.id}`).join(' | ') : '(nenhum)'}`,
    )
    console.log(
      `  etapas pendentes: ${pendentes.length ? pendentes.map((e) => e.titulo).join(' | ') : '(nenhuma)'}`,
    )
  }
}

await conexaoPostgres.end({ timeout: 5 })
