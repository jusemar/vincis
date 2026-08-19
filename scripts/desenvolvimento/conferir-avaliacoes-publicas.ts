/**
 * Confere, com dado real, o que as telas públicas e o painel vão exibir.
 *
 * Roda exatamente as mesmas consultas das telas — vitrine de `/profissionais`,
 * perfil público e painel do prestador — para que a comparação visual não
 * dependa de abrir o navegador para descobrir de onde veio cada número.
 *
 * Só leitura. Nada é gravado.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/conferir-avaliacoes-publicas.ts
 */
import { conexaoPostgres } from '../../src/db/connection'
import { obterPainelDeAvaliacoes } from '../../src/features/avaliacoes/queries/painel-de-avaliacoes'
import { listarAvaliacoesPublicas } from '../../src/features/avaliacoes/queries/reputacao'
import { pesquisarProfissionaisReais } from '../../src/features/profissionais/queries/pesquisar-profissionais'
import { obterIdentidadePublica } from '../../src/features/servicos/queries/identidade-publica'

const vitrine = await pesquisarProfissionaisReais({ porPagina: 30 })

console.log('— card de /profissionais (nota exibida · quantidade) —')
for (const item of vitrine.profissionais) {
  // Exatamente a mesma formatação do card: traço quando não há avaliação.
  const nota =
    item.totalAvaliacoes > 0
      ? ((item.avaliacaoMedia ?? 0) / 10).toFixed(1).replace('.', ',')
      : '—'
  console.log(`  ${nota} ★ (${item.totalAvaliacoes})  ${item.nome}`)
}

console.log('\n— perfil público e painel, por prestador com avaliação —')
for (const item of vitrine.profissionais) {
  if (!item.totalAvaliacoes) continue
  const perfil = await obterIdentidadePublica(item.id)
  const painel = await obterPainelDeAvaliacoes(item.id)
  const publicas = await listarAvaliacoesPublicas(item.id)
  console.log(`  ${item.nome}`)
  console.log(
    `    bloco de métricas: ${((perfil?.avaliacaoMedia ?? 0) / 10).toFixed(1).replace('.', ',')} · ${perfil?.totalAvaliacoes} avaliações`,
  )
  console.log(
    `    painel/Meu Perfil: média ${painel.reputacao.media} · ${painel.reputacao.total} avaliações`,
  )
  for (const publica of publicas) {
    console.log(`    ${'★'.repeat(publica.nota)} "${publica.comentario}" — ${publica.autor}`)
  }
}

await conexaoPostgres.end({ timeout: 5 })
