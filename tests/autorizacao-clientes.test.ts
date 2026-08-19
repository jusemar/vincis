import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  arquivarCliente,
  atualizarCliente,
  criarCliente,
  listarMeusClientes,
  obterMeuCliente,
  restaurarCliente,
} from '@/features/clientes/actions/clientes'
import { resolverAcessoCliente } from '@/features/clientes/lib/acesso-cliente'
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

/** Dados válidos de edição, para não esbarrar na validação Zod. */
function dadosEdicao(nome: string) {
  return {
    nome,
    email: 'editado@matriz.teste',
    telefone: '11988887777',
    empresaNome: '',
    area: 'contabil' as const,
    status: 'ativo' as const,
    tipoAtendimento: 'mensal' as const,
    valorReferencia: '1.000,00',
    observacoes: '',
    cep: '01310000',
    logradouro: 'Avenida Paulista',
    numero: '1000',
    complemento: '',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
  }
}

async function idsVisiveisPara(persona: keyof Cenario['tokens']) {
  entrarComo(cenario.tokens[persona])
  const resultado = await listarMeusClientes({})
  expect(resultado.sucesso).toBe(true)
  return (resultado.dados?.clientes ?? []).map(({ id }) => id)
}

describe('níveis de acesso resolvidos no servidor', () => {
  it('proprietário do cliente', async () => {
    const acesso = await resolverAcessoCliente(
      cenario.ids.proprietario,
      cenario.clienteA,
    )
    expect(acesso?.nivel).toBe('proprietario')
  })

  it('administrador do escritório — Profissional e Colaborador', async () => {
    for (const persona of ['adminProfissional', 'adminColaborador'] as const) {
      const acesso = await resolverAcessoCliente(
        cenario.ids[persona],
        cenario.clienteA,
      )
      expect(acesso?.nivel).toBe('escritorio_admin')
    }
  })

  it('membro com o cliente atribuído', async () => {
    for (const persona of ['profissionalMembro', 'colaboradorMembro'] as const) {
      const acesso = await resolverAcessoCliente(
        cenario.ids[persona],
        cenario.clienteA,
      )
      expect(acesso?.nivel).toBe('atribuido')
    }
  })

  it('colaborador externo com colaboração aceita', async () => {
    const acesso = await resolverAcessoCliente(
      cenario.ids.colaboradorExterno,
      cenario.clienteA,
    )
    expect(acesso?.nivel).toBe('colaborador_externo')
  })

  it('sem vínculo, sem acesso', async () => {
    expect(
      await resolverAcessoCliente(cenario.ids.estranho, cenario.clienteA),
    ).toBeNull()
  })
})

describe('listagem e URL direta concordam', () => {
  it('membro atribuído vê o Cliente A e não vê o Cliente B', async () => {
    const visiveis = await idsVisiveisPara('profissionalMembro')
    expect(visiveis).toContain(cenario.clienteA)
    expect(visiveis).not.toContain(cenario.clienteB)
  })

  it('colaborador membro vê o Cliente A e não vê o Cliente B', async () => {
    const visiveis = await idsVisiveisPara('colaboradorMembro')
    expect(visiveis).toContain(cenario.clienteA)
    expect(visiveis).not.toContain(cenario.clienteB)
  })

  it('colaborador externo vê apenas o cliente compartilhado', async () => {
    const visiveis = await idsVisiveisPara('colaboradorExterno')
    expect(visiveis).toEqual([cenario.clienteA])
  })

  it('administrador do escritório enxerga os clientes do escritório', async () => {
    const visiveis = await idsVisiveisPara('adminColaborador')
    expect(visiveis).toEqual(
      expect.arrayContaining([cenario.clienteA, cenario.clienteB]),
    )
  })

  it('id copiado à mão não alcança cliente fora da lista', async () => {
    for (const persona of [
      'profissionalMembro',
      'colaboradorMembro',
      'colaboradorExterno',
      'estranho',
      'profissionalSozinho',
      'colaboradorSozinho',
    ] as const) {
      entrarComo(cenario.tokens[persona])
      const resultado = await obterMeuCliente(cenario.clienteB)
      expect(resultado.sucesso, `${persona} não deveria abrir o Cliente B`).toBe(
        false,
      )
      expect(resultado.dados).toBeNull()
    }
  })

  it('o que aparece na lista abre pela ação de detalhe', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const detalhe = await obterMeuCliente(cenario.clienteA)
    expect(detalhe.sucesso).toBe(true)
    expect(detalhe.dados?.permissoes.visualizar).toBe(true)
    expect(detalhe.dados?.permissoes.editar).toBe(false)
  })
})

describe('edição', () => {
  it('membro atribuído edita o cliente atribuído', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const resultado = await atualizarCliente(
      cenario.clienteA,
      dadosEdicao('Cliente A editado pelo membro'),
    )
    expect(resultado.sucesso).toBe(true)
  })

  it('colaborador externo não edita', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const resultado = await atualizarCliente(
      cenario.clienteA,
      dadosEdicao('Tentativa do colaborador externo'),
    )
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('permissão')
  })

  it('estranho não edita cliente que não enxerga', async () => {
    entrarComo(cenario.tokens.estranho)
    const resultado = await atualizarCliente(
      cenario.clienteB,
      dadosEdicao('Tentativa do estranho'),
    )
    expect(resultado.sucesso).toBe(false)
  })

  it('administrador do escritório edita cliente do escritório', async () => {
    entrarComo(cenario.tokens.adminColaborador)
    const resultado = await atualizarCliente(
      cenario.clienteB,
      dadosEdicao('Cliente B editado pelo administrador'),
    )
    expect(resultado.sucesso).toBe(true)
  })
})

describe('arquivamento', () => {
  it('membro atribuído não arquiva', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const resultado = await arquivarCliente(cenario.clienteA)
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('permissão')
  })

  it('colaborador externo não arquiva', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    expect((await arquivarCliente(cenario.clienteA)).sucesso).toBe(false)
  })

  it('proprietário arquiva e restaura o próprio cliente', async () => {
    entrarComo(cenario.tokens.proprietario)
    expect((await arquivarCliente(cenario.clienteB)).sucesso).toBe(true)
    expect((await restaurarCliente(cenario.clienteB)).sucesso).toBe(true)
  })

  it('administrador do escritório arquiva e restaura', async () => {
    entrarComo(cenario.tokens.adminProfissional)
    expect((await arquivarCliente(cenario.clienteB)).sucesso).toBe(true)
    expect((await restaurarCliente(cenario.clienteB)).sucesso).toBe(true)
  })
})

describe('prestadores que atuam sozinhos', () => {
  it('Profissional sozinho é dono do próprio cliente', async () => {
    const visiveis = await idsVisiveisPara('profissionalSozinho')
    expect(visiveis).toEqual([cenario.clienteSozinho])
    const acesso = await resolverAcessoCliente(
      cenario.ids.profissionalSozinho,
      cenario.clienteSozinho,
    )
    expect(acesso?.nivel).toBe('proprietario')
  })

  it('Colaborador sozinho tem carteira própria sem virar Profissional', async () => {
    const visiveis = await idsVisiveisPara('colaboradorSozinho')
    expect(visiveis).toEqual([cenario.clienteColaboradorSozinho])

    entrarComo(cenario.tokens.colaboradorSozinho)
    const criado = await criarCliente({
      ...dadosEdicao('Cliente avulso do Colaborador'),
      email: 'avulso.colaborador@matriz.teste',
      tipoAtendimento: 'avulso',
    })
    expect(criado.sucesso).toBe(true)

    const depois = await idsVisiveisPara('colaboradorSozinho')
    expect(depois).toHaveLength(2)
  })

  it('quem atua sozinho não enxerga clientes do escritório alheio', async () => {
    const visiveis = await idsVisiveisPara('profissionalSozinho')
    expect(visiveis).not.toContain(cenario.clienteA)
    expect(visiveis).not.toContain(cenario.clienteB)
  })
})

describe('sem sessão', () => {
  it('nenhuma ação de cliente responde sem sessão', async () => {
    sairDaSessao()
    expect((await listarMeusClientes({})).sucesso).toBe(false)
    expect((await obterMeuCliente(cenario.clienteA)).sucesso).toBe(false)
    expect((await arquivarCliente(cenario.clienteA)).sucesso).toBe(false)
  })

  it('o Gestor Vincis não opera a área de clientes', async () => {
    entrarComo(cenario.tokens.gestor)
    expect((await listarMeusClientes({})).sucesso).toBe(false)
    expect((await obterMeuCliente(cenario.clienteA)).sucesso).toBe(false)
    expect((await arquivarCliente(cenario.clienteA)).sucesso).toBe(false)
  })
})
