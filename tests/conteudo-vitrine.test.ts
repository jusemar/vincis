import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfilCasosSucesso, perfilExperiencias, perfilPerguntasFrequentes, perfisProfissionais } from '@/db/schema'
import {
  salvarCasosSucesso,
  salvarExperiencias,
  salvarPerguntasFrequentes,
} from '@/features/perfis/actions/salvar-conteudo-vitrine'
import { salvarVitrineProfissional } from '@/features/usuarios/actions/salvar-vitrine-profissional'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@conteudo-vitrine.teste'

let contas: Record<'dono' | 'outro', ContaDeTeste>

beforeEach(async () => {
  contas = await criarContas(SUFIXO, {
    dono: { perfil: 'profissional', prestador: 'profissional' },
    outro: { perfil: 'profissional', prestador: 'profissional' },
  })
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('salvarVitrineProfissional — bloco Sobre', () => {
  function payloadVitrine(extra: Record<string, unknown> = {}) {
    return {
      apresentacao: 'Atendimento consultivo para pessoas físicas e pequenas empresas há mais de dez anos.',
      especialidades: [],
      certificacoes: [],
      formacao: '',
      instituicaoEnsino: '',
      anoFormacao: null,
      areasAtuacao: [],
      cidade: '',
      estado: '',
      disponivelAtendimento: true,
      regimesAtendidos: [],
      sobreTitulo: 'Especialista em regularização fiscal',
      sobreTexto: 'Atuo com foco em MEIs e pequenas empresas, sempre priorizando clareza.',
      ...extra,
    }
  }

  it('persiste título e texto do bloco Sobre', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarVitrineProfissional(payloadVitrine())
    expect(resultado.sucesso).toBe(true)

    const [perfil] = await db
      .select({ sobreTitulo: perfisProfissionais.sobreTitulo, sobreTexto: perfisProfissionais.sobreTexto })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    expect(perfil.sobreTitulo).toBe('Especialista em regularização fiscal')
    expect(perfil.sobreTexto).toContain('MEIs e pequenas empresas')
  })

  it('título e texto vazios gravam null, não string vazia', async () => {
    entrarComo(contas.dono.token)
    await salvarVitrineProfissional(payloadVitrine({ sobreTitulo: '', sobreTexto: '' }))

    const [perfil] = await db
      .select({ sobreTitulo: perfisProfissionais.sobreTitulo, sobreTexto: perfisProfissionais.sobreTexto })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    expect(perfil.sobreTitulo).toBeNull()
    expect(perfil.sobreTexto).toBeNull()
  })
})

describe('salvarCasosSucesso / salvarExperiencias / salvarPerguntasFrequentes', () => {
  it('dono cria a lista completa, na ordem enviada', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarCasosSucesso([
      { tipo: 'IRPF', titulo: 'Primeiro caso', descricao: 'Descrição do primeiro caso.' },
      { tipo: 'MEI', titulo: 'Segundo caso', descricao: 'Descrição do segundo caso.' },
    ])
    expect(resultado.sucesso).toBe(true)

    const linhas = await db
      .select({ titulo: perfilCasosSucesso.titulo, ordem: perfilCasosSucesso.ordem })
      .from(perfilCasosSucesso)
      .where(eq(perfilCasosSucesso.prestadorId, contas.dono.id))
      .orderBy(asc(perfilCasosSucesso.ordem))
    expect(linhas.map((l) => l.titulo)).toEqual(['Primeiro caso', 'Segundo caso'])
    expect(linhas.map((l) => l.ordem)).toEqual([0, 1])
  })

  it('reenviar a lista reordenada substitui a ordem gravada', async () => {
    entrarComo(contas.dono.token)
    await salvarExperiencias([
      { periodo: '2018', titulo: 'A', descricao: 'Descrição A.' },
      { periodo: '2020', titulo: 'B', descricao: 'Descrição B.' },
    ])
    const [a, b] = await db
      .select({ id: perfilExperiencias.id, titulo: perfilExperiencias.titulo })
      .from(perfilExperiencias)
      .where(eq(perfilExperiencias.prestadorId, contas.dono.id))
      .orderBy(asc(perfilExperiencias.ordem))

    // Reenvia com os mesmos ids, mas trocados de posição — simula o
    // "mover para cima/baixo" do modo edição.
    await salvarExperiencias([
      { id: b.id, periodo: '2020', titulo: 'B', descricao: 'Descrição B.' },
      { id: a.id, periodo: '2018', titulo: 'A', descricao: 'Descrição A.' },
    ])

    const depois = await db
      .select({ titulo: perfilExperiencias.titulo })
      .from(perfilExperiencias)
      .where(eq(perfilExperiencias.prestadorId, contas.dono.id))
      .orderBy(asc(perfilExperiencias.ordem))
    expect(depois.map((l) => l.titulo)).toEqual(['B', 'A'])
  })

  it('lista vazia apaga todos os itens do prestador', async () => {
    entrarComo(contas.dono.token)
    await salvarPerguntasFrequentes([
      { pergunta: 'Pergunta 1?', resposta: 'Resposta 1.' },
      { pergunta: 'Pergunta 2?', resposta: 'Resposta 2.' },
    ])
    const resultado = await salvarPerguntasFrequentes([])
    expect(resultado.sucesso).toBe(true)

    const linhas = await db
      .select({ id: perfilPerguntasFrequentes.id })
      .from(perfilPerguntasFrequentes)
      .where(eq(perfilPerguntasFrequentes.prestadorId, contas.dono.id))
    expect(linhas).toHaveLength(0)
  })

  it('sem sessão, nada é salvo', async () => {
    sairDaSessao()
    const resultado = await salvarCasosSucesso([
      { tipo: 'IRPF', titulo: 'X', descricao: 'Y' },
    ])
    expect(resultado.sucesso).toBe(false)

    const linhas = await db
      .select({ id: perfilCasosSucesso.id })
      .from(perfilCasosSucesso)
      .where(eq(perfilCasosSucesso.prestadorId, contas.dono.id))
    expect(linhas).toHaveLength(0)
  })

  it('editar logado como "outro" não afeta a lista do dono', async () => {
    entrarComo(contas.dono.token)
    await salvarCasosSucesso([{ tipo: 'IRPF', titulo: 'Caso do dono', descricao: 'Descrição.' }])

    entrarComo(contas.outro.token)
    await salvarCasosSucesso([{ tipo: 'MEI', titulo: 'Caso de outro', descricao: 'Descrição.' }])

    const doDono = await db
      .select({ titulo: perfilCasosSucesso.titulo })
      .from(perfilCasosSucesso)
      .where(eq(perfilCasosSucesso.prestadorId, contas.dono.id))
    expect(doDono.map((l) => l.titulo)).toEqual(['Caso do dono'])
  })

  it('rejeita item com campo obrigatório vazio, sem gravar nada', async () => {
    entrarComo(contas.dono.token)
    const resultado = await salvarExperiencias([
      { periodo: '', titulo: 'Sem período', descricao: 'Descrição.' },
    ])
    expect(resultado.sucesso).toBe(false)

    const linhas = await db
      .select({ id: perfilExperiencias.id })
      .from(perfilExperiencias)
      .where(eq(perfilExperiencias.prestadorId, contas.dono.id))
    expect(linhas).toHaveLength(0)
  })
})
