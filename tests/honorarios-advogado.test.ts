import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { pesquisarProfissionaisReais } from '@/features/profissionais/queries/pesquisar-profissionais'
import { obterIdentidadePublica } from '@/features/servicos/queries/identidade-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'

/**
 * Honorário de advogado não é exposto publicamente.
 *
 * O valor continua gravado (o advogado o vê no próprio perfil), mas a listagem
 * de `/profissionais` e o perfil público não o devolvem — o card mostra
 * "Consultar honorários". O contador continua com o preço por hora.
 */
const SUFIXO = '@honorarios-advogado.teste'
let contas: Record<'advogado' | 'contador', ContaDeTeste>

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      contador: { perfil: 'profissional', prestador: 'profissional' },
    },
    '119475',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia', valorHoraCentavos: 50_000 })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
  await db
    .update(perfisProfissionais)
    .set({ valorHoraCentavos: 13_000 })
    .where(eq(perfisProfissionais.usuarioId, contas.contador.id))
}, 120_000)

afterAll(async () => {
  await limparContas(SUFIXO)
})

describe('honorários de advogado', () => {
  it('a listagem pública não devolve o valor do advogado; o do contador continua', async () => {
    const { profissionais } = await pesquisarProfissionaisReais({ busca: SUFIXO.slice(1), porPagina: 30 })
    const advogado = profissionais.find((p) => p.id === contas.advogado.id)
    const contador = profissionais.find((p) => p.id === contas.contador.id)
    expect(advogado?.profissao).toBe('advocacia')
    expect(advogado?.valorHoraCentavos).toBeNull()
    expect(contador?.valorHoraCentavos).toBe(13_000)
  })

  it('o perfil público também não expõe; o banco continua com o valor', async () => {
    expect((await obterIdentidadePublica(contas.advogado.id))?.valorHoraCentavos).toBeNull()
    expect((await obterIdentidadePublica(contas.contador.id))?.valorHoraCentavos).toBe(13_000)
    const [gravado] = await db
      .select({ valor: perfisProfissionais.valorHoraCentavos })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
    expect(gravado.valor).toBe(50_000)
  })
})
