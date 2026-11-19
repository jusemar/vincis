import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaConfiguracoes, perfisProfissionais } from '@/db/schema'
import { salvarConsultoria } from '@/features/consultorias/actions/consultoria'
import { pesquisarProfissionaisPublicos } from '@/features/profissionais/actions/pesquisar-profissionais'
import { obterIdentidadePublica } from '@/features/servicos/queries/identidade-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao } from './setup/sessao'

/**
 * 1) Consultoria jurídica sem valor: a advocacia agenda sem preço (honorário
 *    combinado diretamente); as demais categorias continuam obrigadas a
 *    informar um valor positivo.
 * 2) Colaborador só é público por escolha (`vitrine_publica`): o colaborador
 *    interno de escritório não aparece na vitrine nem tem perfil público.
 * 3) "Perfil verificado" exige comprovante do registro guardado.
 */
const SUFIXO = '@consultoria-juridica-vitrine.teste'
let contas: Record<'advogado' | 'contador' | 'interno' | 'publico', ContaDeTeste>

const BASE = {
  titulo: 'Atendimento inicial',
  descricaoCurta: 'Conversa inicial de uma hora.',
  modalidade: 'online',
  duracaoMinutos: 60,
  intervaloMinutos: 0,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 30,
  timezone: 'America/Sao_Paulo',
  ativa: true,
}

async function valorGravado(conta: ContaDeTeste) {
  const [cfg] = await db
    .select({ valor: consultoriaConfiguracoes.valorCentavos })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, conta.id))
  return cfg?.valor
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      contador: { perfil: 'profissional', prestador: 'profissional' },
      interno: { perfil: 'colaborador', prestador: 'colaborador' },
      publico: { perfil: 'colaborador', prestador: 'colaborador' },
    },
    '119476',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia' })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
  // Vitrine pública também exige foto (regra de `profissionais/lib/vitrine-publica`).
  await db
    .update(perfisProfissionais)
    .set({ vitrinePublica: true, avatarUrl: '/api/armazenamento-local/perfis-profissionais/teste/avatar/foto.webp' })
    .where(eq(perfisProfissionais.usuarioId, contas.publico.id))
}, 120_000)

afterAll(async () => {
  await limparContas(SUFIXO)
})

describe('consultoria jurídica sem valor', () => {
  it('advocacia salva sem valor, e um valor enviado é descartado', async () => {
    const semValor = await comSessao(contas.advogado.token, () => salvarConsultoria({ ...BASE, valorCentavos: null }))
    expect(semValor.sucesso).toBe(true)
    expect(await valorGravado(contas.advogado)).toBeNull()

    const comValor = await comSessao(contas.advogado.token, () => salvarConsultoria({ ...BASE, valorCentavos: 30_000 }))
    expect(comValor.sucesso).toBe(true)
    expect(await valorGravado(contas.advogado)).toBeNull()
  })

  it('as demais categorias continuam exigindo valor positivo', async () => {
    const semValor = await comSessao(contas.contador.token, () => salvarConsultoria({ ...BASE, valorCentavos: null }))
    expect(semValor.sucesso).toBe(false)
    const zero = await comSessao(contas.contador.token, () => salvarConsultoria({ ...BASE, valorCentavos: 0 }))
    expect(zero.sucesso).toBe(false)
    const ok = await comSessao(contas.contador.token, () => salvarConsultoria({ ...BASE, valorCentavos: 15_000 }))
    expect(ok.sucesso).toBe(true)
    expect(await valorGravado(contas.contador)).toBe(15_000)
  })
})

describe('colaborador como prestador público', () => {
  it('só o colaborador com vitrine pública aparece na listagem — mesmo pedindo `todos`', async () => {
    const pesquisa = await pesquisarProfissionaisPublicos({ busca: SUFIXO.slice(1), porPagina: 30, tipoPrestador: 'todos' })
    const ids = (pesquisa.dados?.profissionais ?? []).map((p) => p.id)
    expect(ids).toContain(contas.publico.id)
    expect(ids).not.toContain(contas.interno.id)
  })

  it('perfil público: existe para o colaborador da vitrine, não para o interno', async () => {
    expect(await obterIdentidadePublica(contas.publico.id)).not.toBeNull()
    expect(await obterIdentidadePublica(contas.interno.id)).toBeNull()
  })
})

describe('estado de verificação', () => {
  it('aprovado sem comprovante não é registro verificado; com comprovante é', async () => {
    expect((await obterIdentidadePublica(contas.contador.id))?.registroVerificado).toBe(false)
    expect((await obterIdentidadePublica(contas.publico.id))?.registroVerificado).toBe(false)
    await db
      .update(perfisProfissionais)
      .set({ comprovanteRegistroChave: 'privado/teste/comprovante.pdf' })
      .where(eq(perfisProfissionais.usuarioId, contas.contador.id))
    expect((await obterIdentidadePublica(contas.contador.id))?.registroVerificado).toBe(true)
    // Chave fictícia das contas demo (sem arquivo) não comprova registro.
    await db
      .update(perfisProfissionais)
      .set({ comprovanteRegistroChave: 'demo/comprovante-teste.pdf' })
      .where(eq(perfisProfissionais.usuarioId, contas.contador.id))
    expect((await obterIdentidadePublica(contas.contador.id))?.registroVerificado).toBe(false)
  })
})
