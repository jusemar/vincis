import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
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
import {
  alternarServicoAtivo,
  atualizarServico,
  criarServico,
  excluirServico,
  listarMeusServicos,
} from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import {
  alterarStatusContratacao,
  listarContratacoesDoPrestador,
  listarMinhasContratacoes,
} from '@/features/servicos/actions/contratacoes'
import { listarServicosPublicos } from '@/features/servicos/queries/vitrine-publica'
import { LIMITE_SERVICOS_CATALOGO } from '@/features/servicos/schemas/servico'
import { limparAtendimentosDosPrestadores } from './setup/limpeza-atendimentos'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@servicos.teste'
type Chave = 'profA' | 'profB' | 'colab' | 'clienteA' | 'clienteB'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' | 'colaborador' }> = {
  profA: { perfil: 'profissional', prestador: 'profissional' },
  profB: { perfil: 'profissional', prestador: 'profissional' },
  colab: { perfil: 'colaborador', prestador: 'colaborador' },
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  // Os Atendimentos apontam para as contratações: saem primeiro.
  await limparAtendimentosDosPrestadores(ids)
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

async function montar() {
  await limpar()
  const criadas = {} as Record<Chave, Conta>
  let i = 0
  for (const chave of Object.keys(DEFINICOES) as Chave[]) {
    const def = DEFINICOES[chave]
    await db.insert(perfis).values({ nome: def.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, def.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Servico ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193100${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (def.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: def.prestador,
        tipoProfissional:
          def.prestador === 'colaborador' ? 'colaborador' : 'contabilidade',
        apresentacao: 'Conta de teste de serviços.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: def.prestador === 'colaborador' ? 'ativo' : 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'servicos-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

const BASE = {
  nome: 'Declaração de IRPF Teste',
  descricaoCurta: 'Para pessoa física com rendimentos simples.',
  descricaoDetalhada: 'Preço inicial para casos simples.',
  categoria: 'contabil' as const,
  itensIncluidos: ['Atendimento online', 'Entrega da declaração'],
  modeloPreco: 'fixo' as const,
  valor: '350,00',
  ativo: true,
  publico: true,
  ordem: 0,
}

async function criarComo(chave: Chave, dados: Partial<typeof BASE> = {}) {
  entrarComo(contas[chave].token)
  const resultado = await criarServico({ ...BASE, ...dados })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { id: string } }).dados.id
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('catálogo do prestador', () => {
  it('Profissional cadastra serviço com valor fixo', async () => {
    const id = await criarComo('profA')
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.nome).toBe('Declaração de IRPF Teste')
    expect(servico.valorCentavos).toBe(35000)
    expect(servico.modeloPreco).toBe('fixo')
  })

  it('Colaborador também possui catálogo próprio', async () => {
    const id = await criarComo('colab', { nome: 'Apoio contábil' })
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.prestadorId).toBe(contas.colab.id)
  })

  it('sem sessão de prestador não cadastra', async () => {
    entrarComo(contas.clienteA.token)
    expect((await criarServico(BASE)).sucesso).toBe(false)
    sairDaSessao()
    expect((await criarServico(BASE)).sucesso).toBe(false)
  })

  it('sob orçamento não aceita valor inventado', async () => {
    const id = await criarComo('profA', {
      nome: 'Regularização Teste',
      modeloPreco: 'sob_orcamento',
      valor: '',
    })
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.valorCentavos).toBeNull()
  })

  it('modelo com preço exige valor maior que zero', async () => {
    entrarComo(contas.profA.token)
    const resultado = await criarServico({ ...BASE, valor: '0' })
    expect(resultado.sucesso).toBe(false)
  })

  it('edita o próprio serviço', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profA.token)
    const resultado = await atualizarServico(id, { ...BASE, valor: '400,00' })
    expect(resultado.sucesso).toBe(true)

    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.valorCentavos).toBe(40000)
  })

  it('não edita serviço de outro prestador', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profB.token)
    const resultado = await atualizarServico(id, { ...BASE, valor: '999,00' })
    expect(resultado.sucesso).toBe(false)

    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.valorCentavos).toBe(35000)
  })

  it('ativa e desativa, e só o dono consegue', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profB.token)
    expect((await alternarServicoAtivo({ servicoId: id, ativo: false })).sucesso).toBe(false)

    entrarComo(contas.profA.token)
    expect((await alternarServicoAtivo({ servicoId: id, ativo: false })).sucesso).toBe(true)
    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.ativo).toBe(false)
  })

  it('cada prestador só lista o próprio catálogo', async () => {
    await criarComo('profA')
    await criarComo('profB', { nome: 'Serviço do B' })

    entrarComo(contas.profA.token)
    const listaA = await listarMeusServicos()
    expect(listaA.dados).toHaveLength(1)
    expect(listaA.dados![0].prestadorId).toBe(contas.profA.id)
  })
})

describe('vitrine pública', () => {
  it('lista apenas serviços ativos e públicos daquele prestador', async () => {
    const ativo = await criarComo('profA')
    const inativo = await criarComo('profA', { nome: 'Serviço inativo' })
    await criarComo('profB', { nome: 'Serviço do B' })

    entrarComo(contas.profA.token)
    await alternarServicoAtivo({ servicoId: inativo, ativo: false })

    const vitrine = await listarServicosPublicos(contas.profA.id)
    expect(vitrine.map((s) => s.id)).toEqual([ativo])
  })

  it('formata cada modelo de preço como a interface já exibia', async () => {
    await criarComo('profA', { nome: 'Fixo', modeloPreco: 'fixo', valor: '350,00' })
    await criarComo('profA', {
      nome: 'Base',
      modeloPreco: 'a_partir_de',
      valor: '100,00',
    })
    await criarComo('profA', { nome: 'Hora', modeloPreco: 'por_hora', valor: '180,00' })
    await criarComo('profA', {
      nome: 'Orcamento',
      modeloPreco: 'sob_orcamento',
      valor: '',
    })

    const vitrine = await listarServicosPublicos(contas.profA.id)
    const porNome = new Map(vitrine.map((s) => [s.title, s]))
    expect(porNome.get('Base')!.price).toContain('A partir de')
    expect(porNome.get('Hora')!.price).toContain('/h')
    expect(porNome.get('Orcamento')!.price).toBe('Sob orçamento')
    expect(porNome.get('Orcamento')!.cta).toBe('Solicitar orçamento')
    expect(porNome.get('Fixo')!.cta).toBe('Contratar agora')
  })

  it('ordenação é determinística', async () => {
    await criarComo('profA', { nome: 'Zebra', ordem: 1 })
    await criarComo('profA', { nome: 'Alfa', ordem: 0 })
    const vitrine = await listarServicosPublicos(contas.profA.id)
    expect(vitrine.map((s) => s.title)).toEqual(['Alfa', 'Zebra'])
  })
})

describe('contratação', () => {
  it('Cliente contrata e o preço é congelado', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)

    const resultado = await contratarServico({ servicoId: id })
    expect(resultado.sucesso).toBe(true)

    const [contratacao] = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, id))
    expect(contratacao.clienteUsuarioId).toBe(contas.clienteA.id)
    expect(contratacao.prestadorId).toBe(contas.profA.id)
    expect(contratacao.valorSnapshotCentavos).toBe(35000)
    expect(contratacao.status).toBe('pendente')
  })

  it('mudar o catálogo depois não altera a contratação antiga', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    entrarComo(contas.profA.token)
    await atualizarServico(id, { ...BASE, valor: '400,00' })

    const [contratacao] = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, id))
    expect(contratacao.valorSnapshotCentavos).toBe(35000)

    const vitrine = await listarServicosPublicos(contas.profA.id)
    expect(vitrine[0].price).toContain('400')
  })

  it('clicar duas vezes não cria duas contratações', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })
    const segunda = await contratarServico({ servicoId: id })
    expect(segunda.sucesso).toBe(true)

    const linhas = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, id))
    expect(linhas).toHaveLength(1)
  })

  it('sob orçamento nasce sem valor e aguardando orçamento', async () => {
    const id = await criarComo('profA', {
      nome: 'Regularização Teste',
      modeloPreco: 'sob_orcamento',
      valor: '',
    })
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    const [contratacao] = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, id))
    expect(contratacao.status).toBe('aguardando_orcamento')
    expect(contratacao.valorSnapshotCentavos).toBeNull()
  })

  it('a partir de e por hora preservam o modelo na contratação', async () => {
    const base = await criarComo('profA', {
      nome: 'Base',
      modeloPreco: 'a_partir_de',
      valor: '100,00',
    })
    const hora = await criarComo('profA', {
      nome: 'Hora',
      modeloPreco: 'por_hora',
      valor: '180,00',
    })
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: base })
    await contratarServico({ servicoId: hora })

    const linhas = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.clienteUsuarioId, contas.clienteA.id))
    const porNome = new Map(linhas.map((l) => [l.nomeServicoSnapshot, l]))
    expect(porNome.get('Base')!.modeloPrecoSnapshot).toBe('a_partir_de')
    expect(porNome.get('Base')!.valorSnapshotCentavos).toBe(10000)
    expect(porNome.get('Hora')!.modeloPrecoSnapshot).toBe('por_hora')
    expect(porNome.get('Hora')!.valorSnapshotCentavos).toBe(18000)
  })

  it('visitante sem sessão é encaminhado ao login', async () => {
    const id = await criarComo('profA')
    sairDaSessao()
    const resultado = await contratarServico({ servicoId: id })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(true)
    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
  })

  it('prestador não contrata fingindo ser cliente', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profB.token)
    const resultado = await contratarServico({ servicoId: id })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(false)
  })

  it('serviço inativo não é contratável', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profA.token)
    await alternarServicoAtivo({ servicoId: id, ativo: false })

    entrarComo(contas.clienteA.token)
    expect((await contratarServico({ servicoId: id })).sucesso).toBe(false)
  })
})

describe('vínculo com a carteira do prestador', () => {
  it('a primeira contratação cria o cliente na carteira por referência explícita', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    const carteira = await db
      .select()
      .from(clientes)
      .where(
        and(
          eq(clientes.profissionalId, contas.profA.id),
          eq(clientes.usuarioId, contas.clienteA.id),
        ),
      )
    expect(carteira).toHaveLength(1)
  })

  it('uma segunda contratação não duplica o cliente na carteira', async () => {
    const a = await criarComo('profA', { nome: 'Serviço 1' })
    const b = await criarComo('profA', { nome: 'Serviço 2' })
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: a })
    await contratarServico({ servicoId: b })

    const carteira = await db
      .select()
      .from(clientes)
      .where(eq(clientes.usuarioId, contas.clienteA.id))
    expect(carteira).toHaveLength(1)
  })
})

describe('painel do prestador e área do cliente', () => {
  it('a contratação aparece para o prestador certo e some para o outro', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    entrarComo(contas.profA.token)
    const doA = await listarContratacoesDoPrestador()
    expect(doA.dados).toHaveLength(1)
    expect(doA.dados![0].clienteNome).toBe('Servico clienteA')
    expect(doA.dados![0].valorCentavos).toBe(35000)
    expect(doA.dados![0].status).toBe('pendente')

    entrarComo(contas.profB.token)
    expect((await listarContratacoesDoPrestador()).dados).toHaveLength(0)
  })

  it('cada Cliente vê apenas as próprias contratações', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    const deA = await listarMinhasContratacoes()
    expect(deA.dados).toHaveLength(1)
    expect(deA.dados![0].prestadorNome).toBe('Servico profA')

    entrarComo(contas.clienteB.token)
    expect((await listarMinhasContratacoes()).dados).toEqual([])
  })

  it('só o prestador dono avança o status', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })
    const [contratacao] = await db.select().from(contratacoesServico)

    entrarComo(contas.profB.token)
    expect(
      (
        await alterarStatusContratacao({
          contratacaoId: contratacao.id,
          status: 'concluido',
        })
      ).sucesso,
    ).toBe(false)

    entrarComo(contas.clienteA.token)
    expect(
      (
        await alterarStatusContratacao({
          contratacaoId: contratacao.id,
          status: 'concluido',
        })
      ).sucesso,
    ).toBe(false)

    entrarComo(contas.profA.token)
    expect(
      (
        await alterarStatusContratacao({
          contratacaoId: contratacao.id,
          status: 'em_andamento',
        })
      ).sucesso,
    ).toBe(true)
  })
})

describe('separação entre catálogo e contratações', () => {
  it('serviço só cadastrado NÃO aparece em Admin → Serviços', async () => {
    await criarComo('profA')
    entrarComo(contas.profA.token)
    const admin = await listarContratacoesDoPrestador()
    // O catálogo existe, mas ninguém contratou: a tela operacional fica vazia.
    expect((await listarMeusServicos()).dados).toHaveLength(1)
    expect(admin.dados).toEqual([])
  })

  it('passa a aparecer somente depois que um Cliente contrata', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    entrarComo(contas.profA.token)
    const admin = await listarContratacoesDoPrestador()
    expect(admin.dados).toHaveLength(1)
    expect(admin.dados![0].nomeServico).toBe('Declaração de IRPF Teste')
  })

  it('solicitação de orçamento também entra na tela operacional', async () => {
    const id = await criarComo('profA', {
      nome: 'Regularização Teste',
      modeloPreco: 'sob_orcamento',
      valor: '',
    })
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    entrarComo(contas.profA.token)
    const admin = await listarContratacoesDoPrestador()
    expect(admin.dados).toHaveLength(1)
    expect(admin.dados![0].status).toBe('aguardando_orcamento')
  })
})

describe('exclusão do catálogo', () => {
  it('serviço nunca contratado é removido de fato', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profA.token)
    const resultado = await excluirServico(id)
    expect(resultado.sucesso).toBe(true)
    expect((resultado as { arquivado: boolean }).arquivado).toBe(false)
    expect(await db.select().from(servicos).where(eq(servicos.id, id))).toEqual([])
  })

  it('serviço com contratação é arquivado e o histórico sobrevive', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.clienteA.token)
    await contratarServico({ servicoId: id })

    entrarComo(contas.profA.token)
    const resultado = await excluirServico(id)
    expect(resultado.sucesso).toBe(true)
    expect((resultado as { arquivado: boolean }).arquivado).toBe(true)

    const [servico] = await db.select().from(servicos).where(eq(servicos.id, id))
    expect(servico.ativo).toBe(false)
    expect(servico.publico).toBe(false)

    // O snapshot da contratação continua intacto.
    const contratacoes = await db
      .select()
      .from(contratacoesServico)
      .where(eq(contratacoesServico.servicoId, id))
    expect(contratacoes).toHaveLength(1)
    expect(contratacoes[0].valorSnapshotCentavos).toBe(35000)

    // E some da vitrine pública.
    expect(await listarServicosPublicos(contas.profA.id)).toEqual([])
  })

  it('não exclui serviço de outro prestador', async () => {
    const id = await criarComo('profA')
    entrarComo(contas.profB.token)
    expect((await excluirServico(id)).sucesso).toBe(false)
    expect(await db.select().from(servicos).where(eq(servicos.id, id))).toHaveLength(1)
  })
})

describe('limite de 5 serviços no catálogo', () => {
  it('permite cinco e bloqueia o sexto no servidor', async () => {
    entrarComo(contas.profA.token)
    for (let i = 1; i <= LIMITE_SERVICOS_CATALOGO; i += 1) {
      const resultado = await criarServico({ ...BASE, nome: `Serviço ${i}` })
      expect(resultado.sucesso, `serviço ${i}`).toBe(true)
    }

    // Chamada direta à action, sem passar pelo botão desabilitado.
    const sexto = await criarServico({ ...BASE, nome: 'Serviço 6' })
    expect(sexto.sucesso).toBe(false)
    expect(sexto.mensagem).toContain('limite')
    expect((await listarMeusServicos()).dados).toHaveLength(LIMITE_SERVICOS_CATALOGO)
  })

  it('serviço inativo continua ocupando vaga', async () => {
    entrarComo(contas.profA.token)
    const ids: string[] = []
    for (let i = 1; i <= LIMITE_SERVICOS_CATALOGO; i += 1) {
      const r = await criarServico({ ...BASE, nome: `Serviço ${i}` })
      ids.push((r as { dados: { id: string } }).dados.id)
    }
    await alternarServicoAtivo({ servicoId: ids[0], ativo: false })

    const sexto = await criarServico({ ...BASE, nome: 'Serviço 6' })
    expect(sexto.sucesso).toBe(false)
  })

  it('excluir serviço sem histórico libera vaga', async () => {
    entrarComo(contas.profA.token)
    const ids: string[] = []
    for (let i = 1; i <= LIMITE_SERVICOS_CATALOGO; i += 1) {
      const r = await criarServico({ ...BASE, nome: `Serviço ${i}` })
      ids.push((r as { dados: { id: string } }).dados.id)
    }
    expect((await criarServico({ ...BASE, nome: 'Extra' })).sucesso).toBe(false)

    await excluirServico(ids[0])
    expect((await criarServico({ ...BASE, nome: 'Extra' })).sucesso).toBe(true)
  })

  it('o limite é por prestador', async () => {
    entrarComo(contas.profA.token)
    for (let i = 1; i <= LIMITE_SERVICOS_CATALOGO; i += 1) {
      await criarServico({ ...BASE, nome: `Serviço ${i}` })
    }
    // O outro prestador começa do zero.
    entrarComo(contas.profB.token)
    expect((await criarServico({ ...BASE, nome: 'Do B' })).sucesso).toBe(true)
  })
})
