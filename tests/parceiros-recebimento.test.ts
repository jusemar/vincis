import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  contratacoesServico,
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroIndicacoes,
  parceiroRecebimentos,
  parceiroSaqueItens,
  parceiroSaques,
  servicos,
} from '@/db/schema'
import { cnpjValido, cpfValido, evpValida } from '@/features/parceiros/lib/documento'
import { mascararChavePix } from '@/features/parceiros/constants/recebimento'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { ativarParceiro } = await import('@/features/parceiros/actions/ativar-parceiro')
const { salvarRecebimento } = await import(
  '@/features/parceiros/actions/salvar-recebimento'
)
const { solicitarSaque } = await import('@/features/parceiros/actions/solicitar-saque')
const { obterRecebimentoDoParceiro } = await import(
  '@/features/parceiros/queries/obter-recebimento'
)
const { listarSaquesParaGestao } = await import(
  '@/features/parceiros/queries/listar-saques-gestao'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)

const SUFIXO = '@parceiros.recebimento.teste'
type Chave = 'joao' | 'maria' | 'cliente' | 'prestador'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let maria: { id: string; codigo: string }

/** Uma comissão disponível, sustentada por linhas reais do domínio. */
async function darComissao(parceiroId: string, valorCentavos: number) {
  const [servico] = await db
    .insert(servicos)
    .values({
      prestadorId: contas.prestador.id,
      nome: `Serviço ${valorCentavos}`,
      descricaoCurta: 'Fixture de recebimento.',
      categoria: 'contabil',
      modeloPreco: 'fixo',
      valorCentavos: valorCentavos * 10,
    })
    .returning({ id: servicos.id })

  const [contratacao] = await db
    .insert(contratacoesServico)
    .values({
      servicoId: servico.id,
      prestadorId: contas.prestador.id,
      clienteUsuarioId: contas.cliente.id,
      nomeServicoSnapshot: `Serviço ${valorCentavos}`,
      modeloPrecoSnapshot: 'fixo',
      valorSnapshotCentavos: valorCentavos * 10,
      status: 'pendente',
    })
    .returning({ id: contratacoesServico.id })

  const [indicacao] = await db
    .insert(parceiroIndicacoes)
    .values({
      parceiroId,
      visitanteHash: crypto.randomUUID().replace(/-/g, ''),
      usuarioId: contas.cliente.id,
    })
    .returning({ id: parceiroIndicacoes.id })

  const [atribuicao] = await db
    .insert(parceiroAtribuicoes)
    .values({
      indicacaoId: indicacao.id,
      parceiroId,
      usuarioId: contas.cliente.id,
      contratacaoId: contratacao.id,
      resolvidaPor: 'conta',
    })
    .returning({ id: parceiroAtribuicoes.id })

  await db.insert(parceiroComissoes).values({
    parceiroId,
    atribuicaoId: atribuicao.id,
    contratacaoId: contratacao.id,
    clienteUsuarioId: contas.cliente.id,
    profissionalId: contas.prestador.id,
    valorBaseCentavos: valorCentavos * 10,
    percentual: '10.00',
    valorCentavos,
    status: 'disponivel',
    disponivelEm: new Date(),
  })
}

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      maria: { perfil: 'cliente' },
      cliente: { perfil: 'cliente' },
      prestador: { perfil: 'profissional', prestador: 'profissional' },
    },
    '119493',
  )) as Record<Chave, { id: string; token: string }>

  for (const chave of ['joao', 'maria'] as const) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
  }
  sairDaSessao()
  joao = (await obterParceiroDoUsuario(contas.joao.id))!
  maria = (await obterParceiroDoUsuario(contas.maria.id))!
})

afterAll(async () => {
  sairDaSessao()
  const ids = [joao.id, maria.id]
  const saques = await db
    .select({ id: parceiroSaques.id })
    .from(parceiroSaques)
    .where(inArray(parceiroSaques.parceiroId, ids))
  if (saques.length) {
    await db.delete(parceiroSaqueItens).where(
      inArray(
        parceiroSaqueItens.saqueId,
        saques.map((s) => s.id),
      ),
    )
    await db.delete(parceiroSaques).where(inArray(parceiroSaques.parceiroId, ids))
  }
  await db
    .delete(parceiroRecebimentos)
    .where(inArray(parceiroRecebimentos.parceiroId, ids))
  await db.delete(parceiroComissoes).where(inArray(parceiroComissoes.parceiroId, ids))
  await db.delete(parceiroAtribuicoes).where(inArray(parceiroAtribuicoes.parceiroId, ids))
  await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.parceiroId, ids))
  await db
    .delete(contratacoesServico)
    .where(eq(contratacoesServico.prestadorId, contas.prestador.id))
  await db.delete(servicos).where(eq(servicos.prestadorId, contas.prestador.id))
  await db.delete(eventosAuditoria).where(
    inArray(
      eventosAuditoria.autorId,
      Object.values(contas).map((c) => c.id),
    ),
  )
  await limparContas(SUFIXO)
})

/** Um CPF e um CNPJ com dígito verificador correto, para os casos felizes. */
const CPF_OK = '52998224725'
const CNPJ_OK = '11222333000181'
const EVP_OK = '123e4567-e89b-42d3-a456-426614174000'

describe('validação da chave Pix', () => {
  it('reconhece documento bem formado', () => {
    expect(cpfValido(CPF_OK)).toBe(true)
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cnpjValido(CNPJ_OK)).toBe(true)
    expect(evpValida(EVP_OK)).toBe(true)
  })

  it('recusa dígito verificador errado e repetições', () => {
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(evpValida('nao-e-uuid')).toBe(false)
  })

  it('a máscara mostra o suficiente para reconhecer, e não mais', () => {
    expect(mascararChavePix('cpf', CPF_OK).endsWith('4725')).toBe(true)
    expect(mascararChavePix('cpf', CPF_OK)).not.toContain('52998')
    expect(mascararChavePix('email', 'parceiro@vincis.com')).toBe(
      'pa••••••@vincis.com',
    )
  })
})

describe('dados de recebimento do parceiro', () => {
  it('recusa cada tipo mal formado, sem gravar nada', async () => {
    const invalidos = [
      { tipoChave: 'cpf', chave: '11111111111' },
      { tipoChave: 'cnpj', chave: '11222333000182' },
      { tipoChave: 'email', chave: 'nao-e-email' },
      { tipoChave: 'telefone', chave: '1199' },
      { tipoChave: 'aleatoria', chave: 'abc' },
    ]

    entrarComo(contas.joao.token)
    for (const invalido of invalidos) {
      const resultado = await salvarRecebimento({ ...invalido, titular: 'João' })
      expect(resultado.sucesso).toBe(false)
    }
    sairDaSessao()

    expect(await obterRecebimentoDoParceiro(joao.id)).toBeNull()
  })

  it('grava a chave normalizada e devolve mascarada', async () => {
    entrarComo(contas.joao.token)
    const resultado = await salvarRecebimento({
      tipoChave: 'cpf',
      chave: '529.982.247-25',
      titular: '  João da Silva  ',
    })
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)

    const [linha] = await db
      .select({ chave: parceiroRecebimentos.chave, titular: parceiroRecebimentos.titular })
      .from(parceiroRecebimentos)
      .where(eq(parceiroRecebimentos.parceiroId, joao.id))
    // Guardada só com dígitos: uma chave, uma escrita.
    expect(linha.chave).toBe(CPF_OK)
    expect(linha.titular).toBe('João da Silva')

    const visao = await obterRecebimentoDoParceiro(joao.id)
    expect(visao?.chaveMascarada).not.toBe(CPF_OK)
    expect(visao?.chaveMascarada.endsWith('4725')).toBe(true)
  })

  it('editar sobrescreve, sem criar segunda linha', async () => {
    entrarComo(contas.joao.token)
    const trocou = await salvarRecebimento({
      tipoChave: 'email',
      chave: 'JOAO@Vincis.com',
      titular: 'João da Silva',
    })
    sairDaSessao()
    expect(trocou.sucesso).toBe(true)

    const linhas = await db
      .select({ chave: parceiroRecebimentos.chave })
      .from(parceiroRecebimentos)
      .where(eq(parceiroRecebimentos.parceiroId, joao.id))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].chave).toBe('joao@vincis.com')
  })

  it('a trilha registra a troca sem a chave inteira', async () => {
    const eventos = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, 'recebimento_parceiro_alterado'))

    expect(eventos.length).toBeGreaterThan(0)
    for (const evento of eventos) {
      const texto = JSON.stringify(evento.metadados)
      expect(texto).not.toContain(CPF_OK)
      expect(texto).not.toContain('joao@vincis.com')
    }
  })

  it('quem não é parceiro não grava dados de recebimento', async () => {
    entrarComo(contas.cliente.token)
    const negado = await salvarRecebimento({
      tipoChave: 'cpf',
      chave: CPF_OK,
      titular: 'Alguém',
    })
    sairDaSessao()
    expect(negado.sucesso).toBe(false)
  })

  it('um parceiro não enxerga nem altera os dados do outro', async () => {
    // Maria grava os dela; a de João continua sendo a dele.
    entrarComo(contas.maria.token)
    await salvarRecebimento({
      tipoChave: 'aleatoria',
      chave: EVP_OK,
      titular: 'Maria Souza',
    })
    sairDaSessao()

    const daMaria = await obterRecebimentoDoParceiro(maria.id)
    const doJoao = await obterRecebimentoDoParceiro(joao.id)
    expect(daMaria?.titular).toBe('Maria Souza')
    expect(doJoao?.titular).toBe('João da Silva')
    expect(daMaria?.chaveMascarada).not.toBe(doJoao?.chaveMascarada)
  })
})

describe('saque exige destino, e o congela', () => {
  it('sem dados de recebimento, o saque é recusado e nada é reservado', async () => {
    // Um parceiro novo, com saldo e sem chave.
    const [semChave] = await db
      .select({ id: parceiroRecebimentos.id })
      .from(parceiroRecebimentos)
      .where(eq(parceiroRecebimentos.parceiroId, maria.id))
    expect(semChave).toBeDefined()

    await db
      .delete(parceiroRecebimentos)
      .where(eq(parceiroRecebimentos.parceiroId, maria.id))
    await darComissao(maria.id, 5000)

    entrarComo(contas.maria.token)
    const recusado = await solicitarSaque()
    sairDaSessao()

    expect(recusado.sucesso).toBe(false)
    expect(recusado.mensagem).toMatch(/dados para recebimento/i)

    const saques = await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, maria.id))
    const itens = await db
      .select({ id: parceiroSaqueItens.id })
      .from(parceiroSaqueItens)
      .innerJoin(parceiroSaques, eq(parceiroSaques.id, parceiroSaqueItens.saqueId))
      .where(eq(parceiroSaques.parceiroId, maria.id))
    // Nenhum pedido, nenhuma reserva: o saldo ficou intacto.
    expect(saques).toHaveLength(0)
    expect(itens).toHaveLength(0)
  })

  it('com dados cadastrados, o saque nasce com o destino congelado', async () => {
    entrarComo(contas.maria.token)
    await salvarRecebimento({
      tipoChave: 'telefone',
      chave: '(11) 98888-7777',
      titular: 'Maria Souza',
    })
    const pedido = await solicitarSaque()
    sairDaSessao()
    expect(pedido.sucesso).toBe(true)

    const [saque] = await db
      .select({
        id: parceiroSaques.id,
        metodo: parceiroSaques.recebimentoMetodo,
        tipo: parceiroSaques.recebimentoTipoChave,
        chave: parceiroSaques.recebimentoChave,
        titular: parceiroSaques.recebimentoTitular,
      })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, maria.id))

    expect(saque.metodo).toBe('pix')
    expect(saque.tipo).toBe('telefone')
    expect(saque.chave).toBe('11988887777')
    expect(saque.titular).toBe('Maria Souza')
  })

  it('trocar a chave depois não muda o saque já pedido', async () => {
    const [antes] = await db
      .select({ id: parceiroSaques.id, chave: parceiroSaques.recebimentoChave })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, maria.id))

    entrarComo(contas.maria.token)
    const trocou = await salvarRecebimento({
      tipoChave: 'cnpj',
      chave: CNPJ_OK,
      titular: 'Maria Souza ME',
    })
    sairDaSessao()
    expect(trocou.sucesso).toBe(true)

    const [depois] = await db
      .select({ chave: parceiroSaques.recebimentoChave, titular: parceiroSaques.recebimentoTitular })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, antes.id))

    // O pedido pendente não muda de destino porque a configuração mudou.
    expect(depois.chave).toBe(antes.chave)
    expect(depois.titular).toBe('Maria Souza')

    // E a configuração atual, sim, é a nova.
    const atual = await obterRecebimentoDoParceiro(maria.id)
    expect(atual?.tipoChave).toBe('cnpj')
  })

  it('o Gestor enxerga o destino congelado daquele saque', async () => {
    const saques = await listarSaquesParaGestao()
    const daMaria = saques.find((s) => s.parceiroId === maria.id)!

    expect(daMaria.recebimento).not.toBeNull()
    expect(daMaria.recebimento?.tipoChave).toBe('telefone')
    expect(daMaria.recebimento?.chave).toBe('11988887777')
    expect(daMaria.recebimento?.titular).toBe('Maria Souza')
  })

  it('saque antigo sem retrato continua íntegro', async () => {
    // Um pedido anterior à funcionalidade: colunas nulas, e nada inventado.
    const [antigo] = await db
      .insert(parceiroSaques)
      .values({ parceiroId: joao.id, valorCentavos: 1234 })
      .returning({ id: parceiroSaques.id })

    const saques = await listarSaquesParaGestao()
    const semDados = saques.find((s) => s.id === antigo.id)!
    expect(semDados.recebimento).toBeNull()
    expect(semDados.valorCentavos).toBe(1234)

    await db.delete(parceiroSaques).where(eq(parceiroSaques.id, antigo.id))
  })

  it('a trilha do saque não carrega a chave inteira', async () => {
    const eventos = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.acao, 'saque_parceiro_solicitado'),
          eq(eventosAuditoria.autorId, contas.maria.id),
        ),
      )

    for (const evento of eventos) {
      expect(JSON.stringify(evento.metadados)).not.toContain('11988887777')
    }
  })
})
