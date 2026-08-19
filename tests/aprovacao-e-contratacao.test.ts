import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clientes,
  contratacoesServico,
  perfis,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { limparAtendimentosDosPrestadores } from './setup/limpeza-atendimentos'
import { entrarComo, sairDaSessao } from './setup/sessao'

vi.mock('@/features/usuarios/lib/comprovante-profissional', () => ({
  enviarComprovantePrivado: vi.fn(),
  removerComprovantePrivado: vi.fn(),
}))

const { analisarPerfilProfissional } = await import(
  '@/features/usuarios/actions/analisar-perfil-profissional'
)
const { contratarServico } = await import(
  '@/features/servicos/actions/contratar'
)
const { listarContratacoesDoPrestador, listarMinhasContratacoes } = await import(
  '@/features/servicos/actions/contratacoes'
)
const { criarServico } = await import('@/features/servicos/actions/catalogo')

const SUFIXO = '@aprovacao.teste'
type Caso = 'gestor' | 'profCompleto' | 'profIncompleto' | 'cliente' | 'colaborador'

const PERFIL_DE: Record<Caso, string> = {
  gestor: 'gestor_vincis',
  profCompleto: 'profissional',
  profIncompleto: 'profissional',
  cliente: 'cliente',
  colaborador: 'colaborador',
}

let ids: Record<Caso, string>
let tokens: Record<Caso, string>

const ENDERECO_COMPLETO = {
  cep: '01310100',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  estado: 'SP',
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const uids = alvos.map(({ id }) => id)
  if (!uids.length) return
  // Os Atendimentos apontam para as contratações: saem primeiro.
  await limparAtendimentosDosPrestadores(uids)
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, uids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, uids))
  // A primeira contratação vincula o Cliente à carteira do prestador.
  await db.delete(clientes).where(inArray(clientes.profissionalId, uids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, uids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, uids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, uids))
  await db.delete(usuarios).where(inArray(usuarios.id, uids))
}

beforeEach(async () => {
  await limpar()
  const criados = {} as Record<Caso, string>
  const criadosTokens = {} as Record<Caso, string>
  let i = 0

  for (const caso of Object.keys(PERFIL_DE) as Caso[]) {
    const nomePerfil = PERFIL_DE[caso]
    await db.insert(perfis).values({ nome: nomePerfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, nomePerfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Aprovacao ${caso}`,
        email: `${caso}${SUFIXO}`,
        whatsapp: `1190100${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })
    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (nomePerfil === 'profissional' || nomePerfil === 'colaborador') {
      const completo = caso !== 'profIncompleto'
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: nomePerfil === 'colaborador' ? 'colaborador' : 'profissional',
        tipoProfissional:
          nomePerfil === 'colaborador' ? 'colaborador' : 'contabilidade',
        apresentacao: 'Cadastro de teste de aprovação.',
        nomeAtuacao: `Aprovacao ${caso}`,
        modalidadeAtuacao: 'individual',
        ...(completo ? ENDERECO_COMPLETO : { cidade: 'São Paulo', estado: 'SP' }),
        numeroRegistro: completo && nomePerfil === 'profissional' ? 'CRC-1234' : null,
        comprovanteRegistroChave:
          completo && nomePerfil === 'profissional' ? 'demo/comp.pdf' : null,
        telefoneContato: '11999998888',
        emailProfissional: `${caso}${SUFIXO}`,
        statusAnalise:
          caso === 'profIncompleto'
            ? 'aguardando_analise'
            : nomePerfil === 'colaborador'
              ? 'ativo'
              : 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'aprovacao-teste',
    })
    criados[caso] = usuario.id
    criadosTokens[caso] = token
    i += 1
  }
  ids = criados
  tokens = criadosTokens
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('aprovação exige cadastro completo', () => {
  it('recusa aprovar cadastro sem endereço e sem registro', async () => {
    entrarComo(tokens.gestor)
    const resultado = await analisarPerfilProfissional({
      usuarioId: ids.profIncompleto,
      decisao: 'aprovado',
      mensagem: '',
    })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('CEP')

    const [perfil] = await db
      .select({ status: perfisProfissionais.statusAnalise })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, ids.profIncompleto))
    // Continua aguardando: nenhuma conta fica presa por aprovação indevida.
    expect(perfil.status).toBe('aguardando_analise')
  })

  it('aprova quando o cadastro está completo', async () => {
    await db
      .update(perfisProfissionais)
      .set({
        ...ENDERECO_COMPLETO,
        numeroRegistro: 'CRC-9999',
        comprovanteRegistroChave: 'demo/comp.pdf',
      })
      .where(eq(perfisProfissionais.usuarioId, ids.profIncompleto))

    entrarComo(tokens.gestor)
    const resultado = await analisarPerfilProfissional({
      usuarioId: ids.profIncompleto,
      decisao: 'aprovado',
      mensagem: '',
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('correção e rejeição não dependem do cadastro estar completo', async () => {
    entrarComo(tokens.gestor)
    const resultado = await analisarPerfilProfissional({
      usuarioId: ids.profIncompleto,
      decisao: 'correcao_solicitada',
      mensagem: 'Envie o comprovante e o endereço.',
    })
    expect(resultado.sucesso).toBe(true)
  })
})

describe('quem pode contratar', () => {
  async function criarServicoDaAna() {
    entrarComo(tokens.profCompleto)
    const resultado = await criarServico({
      nome: 'Serviço para contratação',
      descricaoCurta: 'Serviço de teste para validar a contratação.',
      descricaoDetalhada: '',
      categoria: 'contabil',
      itensIncluidos: [],
      modeloPreco: 'fixo',
      valor: '350,00',
      ativo: true,
      publico: true,
      ordem: 0,
    })
    return (resultado as { dados: { id: string } }).dados.id
  }

  it('Cliente real contrata normalmente', async () => {
    const servicoId = await criarServicoDaAna()
    entrarComo(tokens.cliente)

    const resultado = await contratarServico({ servicoId })
    expect(resultado.sucesso).toBe(true)

    const [contratacao] = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, servicoId))
    expect(contratacao.clienteUsuarioId).toBe(ids.cliente)
    expect(contratacao.valorSnapshotCentavos).toBe(35000)
    expect(contratacao.status).toBe('pendente')
  })

  it('duplo clique não cria duas contratações', async () => {
    const servicoId = await criarServicoDaAna()
    entrarComo(tokens.cliente)
    await Promise.all([
      contratarServico({ servicoId }),
      contratarServico({ servicoId }),
    ])
    const linhas = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, servicoId))
    expect(linhas).toHaveLength(1)
  })

  it('Profissional, Colaborador e Gestor não contratam', async () => {
    const servicoId = await criarServicoDaAna()
    for (const caso of ['profCompleto', 'colaborador', 'gestor'] as const) {
      entrarComo(tokens[caso])
      const resultado = await contratarServico({ servicoId })
      expect(resultado.sucesso, caso).toBe(false)
      expect(resultado.precisaEntrar).toBe(false)
    }
    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
  })

  it('visitante sem sessão é encaminhado ao login', async () => {
    const servicoId = await criarServicoDaAna()
    sairDaSessao()
    const resultado = await contratarServico({ servicoId })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(true)
  })

  it('a contratação chega ao prestador e ao Cliente, isolada dos demais', async () => {
    const servicoId = await criarServicoDaAna()
    entrarComo(tokens.cliente)
    await contratarServico({ servicoId })

    entrarComo(tokens.profCompleto)
    const doPrestador = await listarContratacoesDoPrestador()
    expect(doPrestador.dados).toHaveLength(1)
    expect(doPrestador.dados![0].clienteNome).toBe('Aprovacao cliente')

    entrarComo(tokens.cliente)
    const doCliente = await listarMinhasContratacoes()
    expect(doCliente.dados).toHaveLength(1)
    expect(doCliente.dados![0].prestadorNome).toBe('Aprovacao profCompleto')

    // O colaborador não enxerga a contratação de ninguém.
    entrarComo(tokens.colaborador)
    expect((await listarContratacoesDoPrestador()).dados).toEqual([])
  })
})
