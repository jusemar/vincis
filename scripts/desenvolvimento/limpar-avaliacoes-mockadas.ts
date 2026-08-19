/**
 * Remove os números de avaliação de demonstração dos cadastros de prestador.
 *
 * `perfis_profissionais.avaliacao_media` e `total_avaliacoes` foram preenchidos
 * por script de demonstração e, até a etapa de Avaliações reais, eram o que o
 * card público, o perfil público e o painel exibiam. Hoje toda superfície lê a
 * agregação de `avaliacoes_atendimento`, calculada a cada consulta, e estas
 * duas colunas não alimentam mais nada.
 *
 * Este script apaga o resíduo — **de todos os cadastros, sem exceção**. A linha
 * da prestadora de referência (Ana) conservava os valores do modelo aprovado
 * (4,8 · 89) enquanto a comparação visual com o dado real estava em curso;
 * concluída a comparação, ela sai junto com as demais. A partir daqui, toda
 * avaliação exibida na plataforma vem de avaliação real de Atendimento
 * concluído.
 *
 * Nada além de avaliação é tocado: nome, foto, profissão, preço, anos de
 * experiência, especialidades, selo Premium, declarações e qualquer outro dado
 * de demonstração permanecem exatamente como estão.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/limpar-avaliacoes-mockadas.ts
 */
import { gt, isNotNull, or, sql } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { perfisProfissionais } from '../../src/db/schema'

if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
  throw new Error('Script de demonstração indisponível em produção.')
}

// Só linhas que ainda carregam resíduo: nota preenchida ou contador acima de
// zero. Um UPDATE sobre a tabela inteira mexeria em `updated_at` de cadastros
// que não têm nada a corrigir.
const comResiduo = or(
  isNotNull(perfisProfissionais.avaliacaoMedia),
  gt(perfisProfissionais.totalAvaliacoes, 0),
)

const limpos = await db
  .update(perfisProfissionais)
  .set({ avaliacaoMedia: null, totalAvaliacoes: 0 })
  .where(comResiduo)
  .returning({ usuarioId: perfisProfissionais.usuarioId })

const [restante] = await db
  .select({ total: sql<number>`count(*)::int` })
  .from(perfisProfissionais)
  .where(comResiduo)

console.log(`Cadastros com avaliação de demonstração limpos: ${limpos.length}`)
console.log(`Restantes com resíduo: ${restante?.total ?? 0}`)

await conexaoPostgres.end({ timeout: 5 })
