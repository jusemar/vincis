import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarCliente, listarMeusClientes } from '@/features/clientes/actions/clientes'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

let cenario: Cenario

const TELEFONE = '11987654321'
const NOME = 'Cliente Buscavel Por Telefone'
const EMAIL = 'buscavel@matriz.teste'

beforeAll(async () => {
  cenario = await montarCenario()
  entrarComo(cenario.tokens.proprietario)
  const criado = await criarCliente({
    nome: NOME,
    email: EMAIL,
    telefone: TELEFONE,
    empresaNome: 'Padaria Central',
    area: 'contabil',
    status: 'ativo',
    tipoAtendimento: 'mensal',
    valorReferencia: '1.000,00',
    observacoes: '',
    cep: '01310000',
    logradouro: 'Avenida Paulista',
    numero: '1000',
    complemento: '',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
  })
  expect(criado.sucesso).toBe(true)
})

afterAll(async () => {
  sairDaSessao()
  await limparCenario()
})

async function buscar(termo: string) {
  entrarComo(cenario.tokens.proprietario)
  const resultado = await listarMeusClientes({ busca: termo })
  expect(resultado.sucesso).toBe(true)
  return (resultado.dados?.clientes ?? []).map((cliente) => cliente.nome)
}

/**
 * O telefone entra como mais um critério da busca que já existia.
 *
 * A coluna guarda só dígitos, então o que precisa ser tolerante é o termo: as
 * três formas que uma pessoa digita o mesmo número têm de achar o mesmo
 * cliente, sem que nome e e-mail deixem de achar o que sempre acharam.
 */
describe('busca de clientes por WhatsApp', () => {
  it('acha pelo número sem máscara', async () => {
    expect(await buscar(TELEFONE)).toContain(NOME)
  })

  it('acha pelo número com máscara', async () => {
    expect(await buscar('(11) 98765-4321')).toContain(NOME)
  })

  it('acha pelo número com DDI', async () => {
    expect(await buscar('+55 11 98765-4321')).toContain(NOME)
  })

  it('acha por um pedaço do número', async () => {
    expect(await buscar('98765')).toContain(NOME)
  })

  it('número de outra pessoa não vira falso positivo', async () => {
    expect(await buscar('11912345678')).not.toContain(NOME)
  })

  it('continua achando por nome', async () => {
    expect(await buscar('Buscavel')).toContain(NOME)
  })

  it('continua achando por e-mail', async () => {
    expect(await buscar(EMAIL)).toContain(NOME)
  })

  it('continua achando por empresa', async () => {
    expect(await buscar('Padaria')).toContain(NOME)
  })

  /*
    O piso de dígitos existe para a busca textual não piorar: "Padaria 1" tem
    um número, mas quem digita isso procura um nome, não um telefone.
  */
  it('termo textual com um dígito solto não varre a coluna de telefone', async () => {
    expect(await buscar('Padaria 1')).not.toContain(NOME)
  })
})
