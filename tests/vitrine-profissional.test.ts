import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { salvarVitrineProfissional } from '@/features/usuarios/actions/salvar-vitrine-profissional'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@vitrine.teste'

let contas: Record<'dono' | 'outro', ContaDeTeste>

/** Payload equivalente ao que o modo edição inline envia. */
function payload(extra: Record<string, unknown> = {}) {
  return {
    apresentacao:
      'Atendimento consultivo para pessoas físicas e pequenas empresas há mais de dez anos.',
    especialidades: ['IRPF', 'MEI'],
    certificacoes: ['Pós em Direito Tributário'],
    formacao: 'Ciências Contábeis',
    instituicaoEnsino: 'USP',
    anoFormacao: 2015,
    areasAtuacao: ['contabil'],
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    disponivelAtendimento: false,
    regimesAtendidos: ['simples_nacional'],
    ...extra,
  }
}

beforeEach(async () => {
  // `criarContas` cria dois profissionais já aprovados (statusAnalise
  // 'aprovado'), cada um com cidade 'São Paulo' / estado 'SP' de fábrica — é
  // esse valor de fábrica que os testes de bloqueio de localização comparam.
  contas = await criarContas(SUFIXO, {
    dono: { perfil: 'profissional', prestador: 'profissional' },
    outro: { perfil: 'profissional', prestador: 'profissional' },
  })
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('salvarVitrineProfissional', () => {
  it('dono salva os campos de vitrine permitidos', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarVitrineProfissional(payload())
    expect(resultado.sucesso).toBe(true)

    const [perfil] = await db
      .select()
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))

    expect(perfil.apresentacao).toContain('Atendimento consultivo')
    expect(perfil.especialidades).toEqual(['IRPF', 'MEI'])
    expect(perfil.certificacoes).toEqual(['Pós em Direito Tributário'])
    expect(perfil.formacao).toBe('Ciências Contábeis')
    expect(perfil.instituicaoEnsino).toBe('USP')
    expect(perfil.anoFormacao).toBe(2015)
    expect(perfil.areasAtuacao).toEqual(['contabil'])
    expect(perfil.disponivelAtendimento).toBe(false)
    expect(perfil.regimesAtendidos).toEqual(['simples_nacional'])
  })

  it('cidade e estado ficam travados quando o cadastro já está aprovado', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarVitrineProfissional(
      payload({ cidade: 'Outra Cidade', estado: 'XX' }),
    )
    expect(resultado.sucesso).toBe(true)
    expect(resultado.mensagem).toContain('Cidade e estado não podem ser alterados')

    const [perfil] = await db
      .select({ cidade: perfisProfissionais.cidade, estado: perfisProfissionais.estado })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    expect(perfil.cidade).toBe('São Paulo')
    expect(perfil.estado).toBe('SP')
  })

  it('campos administrativos fora da whitelist são descartados, nada muda', async () => {
    entrarComo(contas.dono.token)
    const [antes] = await db
      .select({
        status: perfisProfissionais.statusAnalise,
        tipo: perfisProfissionais.tipoProfissional,
        enviadoEm: perfisProfissionais.enviadoEm,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))

    const resultado = await salvarVitrineProfissional(
      payload({
        statusAnalise: 'rejeitado',
        tipoProfissional: 'advocacia',
        avaliacaoMedia: 999,
        totalAvaliacoes: 999,
        numeroRegistro: 'FORJADO-1',
        enviadoEm: new Date(0).toISOString(),
        analisadoEm: new Date(0).toISOString(),
        observacaoAnalise: 'tentativa de burlar a análise',
      }),
    )
    expect(resultado.sucesso).toBe(true)

    const [depois] = await db
      .select({
        status: perfisProfissionais.statusAnalise,
        tipo: perfisProfissionais.tipoProfissional,
        numeroRegistro: perfisProfissionais.numeroRegistro,
        enviadoEm: perfisProfissionais.enviadoEm,
        observacaoAnalise: perfisProfissionais.observacaoAnalise,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))

    expect(depois.status).toBe(antes.status)
    expect(depois.tipo).toBe(antes.tipo)
    expect(depois.numeroRegistro).not.toBe('FORJADO-1')
    expect(depois.enviadoEm?.getTime()).toBe(antes.enviadoEm?.getTime())
    expect(depois.observacaoAnalise).toBeNull()
  })

  it('sem sessão, nada é salvo', async () => {
    sairDaSessao()
    const resultado = await salvarVitrineProfissional(payload())
    expect(resultado.sucesso).toBe(false)
  })

  it('editar logado como outro profissional não toca no perfil do dono', async () => {
    entrarComo(contas.outro.token)
    await salvarVitrineProfissional(
      payload({ apresentacao: 'Texto de outro profissional, nada a ver com o dono do outro perfil.' }),
    )

    const [perfilDono] = await db
      .select({ apresentacao: perfisProfissionais.apresentacao })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    // Valor de fábrica de `criarContas`, intocado pela edição de "outro".
    expect(perfilDono.apresentacao).toBe('Conta criada por teste automatizado.')
  })

  it('rejeita apresentação abaixo do tamanho mínimo', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarVitrineProfissional(payload({ apresentacao: 'curta' }))
    expect(resultado.sucesso).toBe(false)
  })

  it('rejeita regime tributário fora do enum aceito', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarVitrineProfissional(
      payload({ regimesAtendidos: ['regime-inventado'] }),
    )
    expect(resultado.sucesso).toBe(false)
  })
})
