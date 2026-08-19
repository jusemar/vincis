/**
 * Remove mensagens repetidas geradas por execuções repetidas do roteiro de
 * teste de conversa.
 *
 * O roteiro (`testes-visuais-atendimentos-operacao.mjs`) envia sempre as mesmas
 * frases, e cada execução grava uma cópia — é o comportamento correto do chat,
 * mas polui a demonstração. Este script mantém a primeira ocorrência de cada
 * texto em cada canal e apaga as repetições.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/limpar-conversas-repetidas-teste.ts
 */
import { sql } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'

const removidas = await db.execute(sql`
  delete from atendimento_mensagens m
  where m.id not in (
    select distinct on (atendimento_id, escopo, conteudo) id
    from atendimento_mensagens
    order by atendimento_id, escopo, conteudo, created_at asc
  )
  returning m.id
`)
console.log('mensagens repetidas removidas:', removidas.length)

const restantes = await db.execute(sql`
  select a.protocolo, m.escopo, m.conteudo
  from atendimento_mensagens m
  join atendimentos a on a.id = m.atendimento_id
  order by a.protocolo, m.created_at
`)
for (const linha of restantes as unknown as Record<string, string>[]) {
  console.log(`${linha.protocolo}  [${linha.escopo}]  ${linha.conteudo}`)
}

await conexaoPostgres.end({ timeout: 5 })
