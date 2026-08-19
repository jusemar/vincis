import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listarMeusClientes, obterMeuCliente } from '@/features/clientes/actions/clientes'
import {
  carregarColaboracoes,
  enviarConviteColaboracao,
  listarClientesElegiveisColaboracao,
  pesquisarProfissionaisColaboracao,
  revogarColaboracao,
} from '@/features/clientes/actions/colaboracoes'
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

describe('quem pode conceder colaboração externa', () => {
  it('membro atribuído pode pedir ajuda no cliente atribuído', async () => {
    entrarComo(cenario.tokens.profissionalMembro)
    const elegiveis = await listarClientesElegiveisColaboracao()
    expect(elegiveis.dados?.map(({ id }) => id)).toContain(cenario.clienteA)

    const resultado = await enviarConviteColaboracao({
      clienteId: cenario.clienteA,
      destinatarioId: cenario.ids.profissionalSozinho,
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('Profissional sozinho compartilha o próprio cliente', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await enviarConviteColaboracao({
      clienteId: cenario.clienteSozinho,
      destinatarioId: cenario.ids.colaboradorSozinho,
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('Colaborador sozinho também pode solicitar ajuda', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    const resultado = await enviarConviteColaboracao({
      clienteId: cenario.clienteColaboradorSozinho,
      destinatarioId: cenario.ids.estranho,
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('quem não tem acesso ao cliente não compartilha', async () => {
    entrarComo(cenario.tokens.estranho)
    const resultado = await enviarConviteColaboracao({
      clienteId: cenario.clienteB,
      destinatarioId: cenario.ids.profissionalSozinho,
    })
    expect(resultado.sucesso).toBe(false)
  })
})

describe('colaborador externo não repassa acesso', () => {
  it('não envia convite de colaboração no cliente recebido', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const resultado = await enviarConviteColaboracao({
      clienteId: cenario.clienteA,
      destinatarioId: cenario.ids.estranho,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('nem pesquisa candidatos para aquele cliente', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const resultado = await pesquisarProfissionaisColaboracao({
      clienteId: cenario.clienteA,
      busca: '',
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('o cliente compartilhado não aparece como elegível para ele', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const elegiveis = await listarClientesElegiveisColaboracao()
    expect(elegiveis.dados).toEqual([])
  })

  it('não vira membro da equipe do escritório de origem', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const colaboracoes = await carregarColaboracoes()
    expect(colaboracoes.dados?.recebidas).toHaveLength(1)
    const { carregarEquipe } = await import('@/features/empresas/actions/equipe')
    const equipe = await carregarEquipe()
    expect(equipe.dados?.escritorios).toEqual([])
    expect(equipe.dados?.atuaIndividualmente).toBe(true)
  })
})

describe('revogação', () => {
  it('o colaborador externo não revoga a própria colaboração para se manter', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const resultado = await revogarColaboracao({
      colaboracaoId: cenario.colaboracaoAId,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('quem responde pelo cliente revoga, e o acesso cai no mesmo instante', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    expect((await obterMeuCliente(cenario.clienteA)).sucesso).toBe(true)

    entrarComo(cenario.tokens.proprietario)
    const revogacao = await revogarColaboracao({
      colaboracaoId: cenario.colaboracaoAId,
    })
    expect(revogacao.sucesso).toBe(true)

    // Sem cache intermediário: a condição de acesso é reavaliada por consulta.
    expect(
      await resolverAcessoCliente(
        cenario.ids.colaboradorExterno,
        cenario.clienteA,
      ),
    ).toBeNull()

    entrarComo(cenario.tokens.colaboradorExterno)
    expect((await obterMeuCliente(cenario.clienteA)).sucesso).toBe(false)
    expect((await listarMeusClientes({})).dados?.clientes).toEqual([])
  })
})
