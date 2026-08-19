import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clienteAtribuicoes, empresaMembros } from '@/db/schema'
import {
  alterarAtribuicaoCliente,
  alterarPapelMembro,
  carregarEquipe,
  enviarConviteEmpresa,
  listarClientesParaAtribuicao,
  pesquisarProfissionais,
  removerMembroEquipe,
} from '@/features/empresas/actions/equipe'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

let cenario: Cenario

beforeAll(async () => {
  cenario = await montarCenario()
})

afterAll(async () => {
  sairDaSessao()
  await limparCenario()
})

async function papelGravado(persona: keyof Cenario['ids']) {
  const [membro] = await db
    .select({ funcao: empresaMembros.funcao, status: empresaMembros.status })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, cenario.empresaId),
        eq(empresaMembros.usuarioId, cenario.ids[persona]),
      ),
    )
    .limit(1)
  return membro ?? null
}

describe('permissões devolvidas à interface', () => {
  it('Proprietário recebe a matriz completa', async () => {
    entrarComo(cenario.tokens.proprietario)
    const resultado = await carregarEquipe()
    const escritorio = resultado.dados?.escritorios[0]
    expect(escritorio?.papel).toBe('proprietario')
    expect(escritorio?.permissoes.convidarMembro).toBe(true)
    expect(escritorio?.permissoes.transferirPropriedade).toBe(true)
  })

  it('Administrador Colaborador administra, mas não transfere propriedade', async () => {
    entrarComo(cenario.tokens.adminColaborador)
    const escritorio = (await carregarEquipe()).dados?.escritorios[0]
    expect(escritorio?.papel).toBe('administrador')
    expect(escritorio?.permissoes.convidarMembro).toBe(true)
    expect(escritorio?.permissoes.removerMembro).toBe(true)
    expect(escritorio?.permissoes.transferirPropriedade).toBe(false)
  })

  it('Profissional membro vê a equipe sem poder administrá-la', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const dados = (await carregarEquipe()).dados
    expect(dados?.membros.length).toBeGreaterThan(0)
    const escritorio = dados?.escritorios[0]
    expect(escritorio?.permissoes.administrar).toBe(false)
    expect(escritorio?.permissoes.convidarMembro).toBe(false)
  })

  it('Colaborador membro segue o mesmo princípio', async () => {
    entrarComo(cenario.tokens.colaboradorMembro)
    const escritorio = (await carregarEquipe()).dados?.escritorios[0]
    expect(escritorio?.papel).toBe('colaborador')
    expect(escritorio?.permissoes.administrar).toBe(false)
  })

  it('quem atua sozinho não tem escritório algum', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    const dados = (await carregarEquipe()).dados
    expect(dados?.atuaIndividualmente).toBe(true)
    expect(dados?.escritorios).toEqual([])
  })

  it('o Gestor Vincis não entra na área de equipe', async () => {
    entrarComo(cenario.tokens.gestor)
    expect((await carregarEquipe()).sucesso).toBe(false)
  })
})

describe('convite de vínculo permanente', () => {
  it('Profissional membro não convida', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.estranho,
      funcao: 'profissional',
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('Colaborador membro não convida', async () => {
    entrarComo(cenario.tokens.colaboradorMembro)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.estranho,
      funcao: 'colaborador',
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('nem a pesquisa de candidatos abre para membro comum', async () => {
    entrarComo(cenario.tokens.colaboradorMembro)
    const resultado = await pesquisarProfissionais({
      empresaId: cenario.empresaId,
      busca: '',
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('Proprietário convida um Profissional', async () => {
    entrarComo(cenario.tokens.proprietario)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.estranho,
      funcao: 'profissional',
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('Administrador Colaborador convida um Colaborador', async () => {
    entrarComo(cenario.tokens.adminColaborador)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.colaboradorSozinho,
      funcao: 'colaborador',
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('convite incompatível é recusado no servidor', async () => {
    entrarComo(cenario.tokens.proprietario)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.profissionalSozinho,
      funcao: 'colaborador',
    })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('Colaborador')
  })

  it('quem não é do escritório não convida para ele', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await enviarConviteEmpresa({
      empresaId: cenario.empresaId,
      destinatarioId: cenario.ids.estranho,
      funcao: 'profissional',
    })
    expect(resultado.sucesso).toBe(false)
  })
})

describe('atribuição de clientes', () => {
  it('membro comum não atribui nem lista candidatos', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    expect((await listarClientesParaAtribuicao(cenario.empresaId)).sucesso).toBe(
      false,
    )
    const resultado = await alterarAtribuicaoCliente({
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteB,
      profissionalId: cenario.ids.colaboradorMembro,
      atribuir: true,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('Administrador Colaborador atribui e remove atribuição', async () => {
    entrarComo(cenario.tokens.adminColaborador)
    const atribuir = await alterarAtribuicaoCliente({
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteB,
      profissionalId: cenario.ids.profissionalMembro,
      atribuir: true,
    })
    expect(atribuir.sucesso).toBe(true)

    const remover = await alterarAtribuicaoCliente({
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteB,
      profissionalId: cenario.ids.profissionalMembro,
      atribuir: false,
    })
    expect(remover.sucesso).toBe(true)
  })
})

describe('alteração de papel', () => {
  it('o Proprietário não tem o papel alterado nem pelo Administrador', async () => {
    entrarComo(cenario.tokens.adminProfissional)
    const resultado = await alterarPapelMembro({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.proprietario,
      funcao: 'colaborador',
    })
    expect(resultado.sucesso).toBe(false)
    expect((await papelGravado('proprietario'))?.funcao).toBe('proprietario')
  })

  it('Colaborador membro vira Administrador e continua Colaborador', async () => {
    entrarComo(cenario.tokens.proprietario)
    const resultado = await alterarPapelMembro({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.colaboradorMembro,
      funcao: 'administrador',
    })
    expect(resultado.sucesso).toBe(true)
    expect((await papelGravado('colaboradorMembro'))?.funcao).toBe('administrador')

    // Volta ao estado original para não contaminar os testes seguintes.
    await alterarPapelMembro({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.colaboradorMembro,
      funcao: 'colaborador',
    })
  })

  it('Colaborador não assume o papel técnico de Profissional', async () => {
    entrarComo(cenario.tokens.proprietario)
    const resultado = await alterarPapelMembro({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.colaboradorMembro,
      funcao: 'profissional',
    })
    expect(resultado.sucesso).toBe(false)
    expect((await papelGravado('colaboradorMembro'))?.funcao).toBe('colaborador')
  })

  it('membro comum não altera função de ninguém', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const resultado = await alterarPapelMembro({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.colaboradorMembro,
      funcao: 'administrador',
    })
    expect(resultado.sucesso).toBe(false)
  })
})

describe('remoção de membro', () => {
  it('o Proprietário não é removido', async () => {
    entrarComo(cenario.tokens.adminProfissional)
    const resultado = await removerMembroEquipe({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.proprietario,
    })
    expect(resultado.sucesso).toBe(false)
    expect((await papelGravado('proprietario'))?.status).toBe('ativo')
  })

  it('membro comum não remove ninguém', async () => {
    entrarComo(cenario.tokens.colaboradorMembro)
    const resultado = await removerMembroEquipe({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.profissionalMembro,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('remover o membro derruba as atribuições dele na hora', async () => {
    entrarComo(cenario.tokens.proprietario)
    const antes = await db
      .select({ id: clienteAtribuicoes.id })
      .from(clienteAtribuicoes)
      .where(
        eq(clienteAtribuicoes.profissionalId, cenario.ids.profissionalMembro),
      )
    expect(antes.length).toBeGreaterThan(0)

    const resultado = await removerMembroEquipe({
      empresaId: cenario.empresaId,
      usuarioId: cenario.ids.profissionalMembro,
    })
    expect(resultado.sucesso).toBe(true)
    expect((await papelGravado('profissionalMembro'))?.status).toBe('removido')

    const depois = await db
      .select({ id: clienteAtribuicoes.id })
      .from(clienteAtribuicoes)
      .where(
        eq(clienteAtribuicoes.profissionalId, cenario.ids.profissionalMembro),
      )
    expect(depois).toEqual([])
  })
})
