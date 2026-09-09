import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroIndicacoes,
  parceiroRecebimentos,
  parceiroSaqueItens,
  parceiroSaques,
  contratacoesServico,
  servicos,
} from '@/db/schema'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { ativarParceiro } = await import('@/features/parceiros/actions/ativar-parceiro')
const { solicitarSaque } = await import('@/features/parceiros/actions/solicitar-saque')
const { salvarRecebimento } = await import(
  '@/features/parceiros/actions/salvar-recebimento'
)
const { marcarSaquePago } = await import(
  '@/features/parceiros/actions/marcar-saque-pago'
)
const { recusarSaque } = await import(
  '@/features/parceiros/actions/recusar-saque'
)
const { listarSaquesParaGestao } = await import(
  '@/features/parceiros/queries/listar-saques-gestao'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { listarComissoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-comissoes'
)

const SUFIXO = '@parceiros.saque.teste'
type Chave = 'joao' | 'maria' | 'cliente' | 'prestador' | 'gestor'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let maria: { id: string; codigo: string }

/**
 * Uma comissão sustentada por linhas reais.
 *
 * Nada de atalho: a atribuição exige exatamente uma origem e a comissão exige
 * contratação — as duas travas do esquema. Fabricar a contratação de verdade é
 * mais curto do que contorná-las, e mantém o cenário fiel ao banco de produção.
 */
async function darComissao(
  parceiroId: string,
  valorCentavos: number,
  status = 'disponivel',
) {
  const [servico] = await db
    .insert(servicos)
    .values({
      prestadorId: contas.prestador.id,
      nome: `Serviço ${valorCentavos}`,
      descricaoCurta: 'Fixture de saque.',
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
    status,
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
      gestor: { perfil: 'gestor_vincis' },
    },
    '119492',
  )) as Record<Chave, { id: string; token: string }>

  /*
    Parceiro sem dados de recebimento não solicita saque — regra da fatia de
    recebimento. Cadastrar aqui mantém estes cenários falando do que eles
    testam: reserva, concorrência e isolamento do saldo.
  */
  for (const chave of ['joao', 'maria'] as const) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
    await salvarRecebimento({
      tipoChave: 'email',
      chave: `${chave}.saque@vincis.local`,
      titular: `Titular ${chave}`,
    })
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
    await db
      .delete(parceiroSaqueItens)
      .where(inArray(parceiroSaqueItens.saqueId, saques.map((s) => s.id)))
    await db.delete(parceiroSaques).where(inArray(parceiroSaques.id, ids.length ? saques.map((s) => s.id) : []))
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
  await db
    .delete(eventosAuditoria)
    .where(inArray(eventosAuditoria.autorId, Object.values(contas).map((c) => c.id)))
  await limparContas(SUFIXO)
})

/**
 * O saque reserva dinheiro real. O que os testes protegem, acima de tudo, é a
 * impossibilidade de o mesmo saldo sair duas vezes.
 */
describe('solicitação de saque do parceiro', () => {
  it('reserva o saldo disponível e abre a solicitação', async () => {
    await darComissao(joao.id, 10000)
    await darComissao(joao.id, 5000, 'gerada')

    const antes = await listarComissoesDoParceiro(joao.id)
    expect(antes.resumo.livreCentavos).toBe(10000)

    entrarComo(contas.joao.token)
    const resultado = await solicitarSaque()
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)

    const depois = await listarComissoesDoParceiro(joao.id)
    // O saldo saiu do livre, mas a comissão não virou paga.
    expect(depois.resumo.livreCentavos).toBe(0)
    expect(depois.resumo.reservadoCentavos).toBe(10000)
    expect(depois.resumo.disponivelCentavos).toBe(10000)
    expect(depois.saques).toHaveLength(1)
    expect(depois.saques[0].valorCentavos).toBe(10000)
    expect(depois.saques[0].status).toBe('solicitado')
    // Comissão em `gerada` não é sacável e ficou de fora.
    expect(depois.resumo.geradaCentavos).toBe(5000)
  })

  it('o valor do saque é exatamente a soma das comissões reservadas', async () => {
    const [saque] = await db
      .select({ id: parceiroSaques.id, valor: parceiroSaques.valorCentavos })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, joao.id))

    const itens = await db
      .select({ valor: parceiroSaqueItens.valorCentavos })
      .from(parceiroSaqueItens)
      .where(eq(parceiroSaqueItens.saqueId, saque.id))

    expect(itens.reduce((t, i) => t + i.valor, 0)).toBe(saque.valor)
  })

  it('sem saldo livre, o pedido é recusado sem criar registro', async () => {
    const antes = await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, joao.id))

    entrarComo(contas.joao.token)
    const resultado = await solicitarSaque()
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    const depois = await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, joao.id))
    expect(depois).toHaveLength(antes.length)
  })

  it('dois pedidos simultâneos reservam o saldo uma vez só', async () => {
    await darComissao(joao.id, 7000)
    const antes = await listarComissoesDoParceiro(joao.id)
    expect(antes.resumo.livreCentavos).toBe(7000)

    entrarComo(contas.joao.token)
    const [a, b] = await Promise.all([solicitarSaque(), solicitarSaque()])
    sairDaSessao()

    // Um vence, o outro não. Nunca os dois.
    expect([a.sucesso, b.sucesso].filter(Boolean)).toHaveLength(1)

    const depois = await listarComissoesDoParceiro(joao.id)
    expect(depois.resumo.livreCentavos).toBe(0)
    expect(depois.resumo.reservadoCentavos).toBe(17000)
    // Nenhuma comissão em dois saques.
    const itens = await db
      .select({ comissaoId: parceiroSaqueItens.comissaoId })
      .from(parceiroSaqueItens)
    expect(new Set(itens.map((i) => i.comissaoId)).size).toBe(itens.length)
  })

  it('o saldo nunca fica negativo', async () => {
    const { resumo } = await listarComissoesDoParceiro(joao.id)
    expect(resumo.livreCentavos).toBeGreaterThanOrEqual(0)
  })

  it('um parceiro não saca o saldo do outro', async () => {
    await darComissao(maria.id, 30000)

    // João pede: leva só o que é dele, e o dele acabou.
    entrarComo(contas.joao.token)
    const doJoao = await solicitarSaque()
    sairDaSessao()
    expect(doJoao.sucesso).toBe(false)

    const daMaria = await listarComissoesDoParceiro(maria.id)
    expect(daMaria.resumo.livreCentavos).toBe(30000)
    expect(daMaria.saques).toHaveLength(0)

    // E o saque de Maria não enxerga comissão de João.
    entrarComo(contas.maria.token)
    const dela = await solicitarSaque()
    sairDaSessao()
    expect(dela.sucesso).toBe(true)
    expect(dela.sucesso && dela.dados?.valorCentavos).toBe(30000)
  })

  it('quem não é parceiro não solicita saque', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await solicitarSaque()
    sairDaSessao()
    expect(resultado.sucesso).toBe(false)
  })

  it('a solicitação fica auditada com valor e comissões de origem', async () => {
    const [evento] = await db
      .select({
        acao: eventosAuditoria.acao,
        metadados: eventosAuditoria.metadados,
      })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.autorId, contas.maria.id),
          eq(eventosAuditoria.acao, 'saque_parceiro_solicitado'),
        ),
      )

    expect(evento.acao).toBe('saque_parceiro_solicitado')
    const dados = evento.metadados as { valorCentavos: number; comissoes: string[] }
    expect(dados.valorCentavos).toBe(30000)
    expect(dados.comissoes).toHaveLength(1)
  })

  it('nenhuma comissão foi marcada como paga', async () => {
    const pagas = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.status, 'paga'))
    expect(pagas).toHaveLength(0)
  })
})

/**
 * O pagamento acontece fora da Vincis; aqui só se registra que aconteceu.
 *
 * O que estes testes protegem é o dinheiro: ninguém além do Gestor marca, um
 * saque não é pago duas vezes, e comissão que não pertence àquele saque não é
 * tocada — nem por engano, nem por id forjado.
 */
describe('Gestão registra o pagamento do saque', () => {
  it('só o Gestor marca como pago', async () => {
    const [saque] = await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, joao.id))
      .limit(1)

    // O dono do saque não paga o próprio saque.
    entrarComo(contas.joao.token)
    const peloDono = await marcarSaquePago({ saqueId: saque.id })
    sairDaSessao()
    expect(peloDono.sucesso).toBe(false)

    // Nem outro parceiro, nem um cliente comum, nem quem não está autenticado.
    entrarComo(contas.maria.token)
    const porOutro = await marcarSaquePago({ saqueId: saque.id })
    sairDaSessao()
    expect(porOutro.sucesso).toBe(false)

    entrarComo(contas.cliente.token)
    const porCliente = await marcarSaquePago({ saqueId: saque.id })
    sairDaSessao()
    expect(porCliente.sucesso).toBe(false)

    const semSessao = await marcarSaquePago({ saqueId: saque.id })
    expect(semSessao.sucesso).toBe(false)

    // Nada mudou depois de quatro tentativas negadas.
    const [depois] = await db
      .select({ status: parceiroSaques.status, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saque.id))
    expect(depois.status).toBe('solicitado')
    expect(depois.pagoEm).toBeNull()
  })

  it('o Gestor paga o saque e quita as comissões daquele saque', async () => {
    const [saque] = await db
      .select({ id: parceiroSaques.id, valor: parceiroSaques.valorCentavos })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.parceiroId, joao.id))
      .limit(1)

    const itens = await db
      .select({ comissaoId: parceiroSaqueItens.comissaoId })
      .from(parceiroSaqueItens)
      .where(eq(parceiroSaqueItens.saqueId, saque.id))

    entrarComo(contas.gestor.token)
    const resultado = await marcarSaquePago({ saqueId: saque.id })
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)

    const [pago] = await db
      .select({ status: parceiroSaques.status, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saque.id))
    expect(pago.status).toBe('pago')
    expect(pago.pagoEm).toBeInstanceOf(Date)

    const quitadas = await db
      .select({
        status: parceiroComissoes.status,
        pagaEm: parceiroComissoes.pagaEm,
        valor: parceiroComissoes.valorCentavos,
      })
      .from(parceiroComissoes)
      .where(inArray(parceiroComissoes.id, itens.map((i) => i.comissaoId)))

    expect(quitadas.every((c) => c.status === 'paga')).toBe(true)
    expect(quitadas.every((c) => c.pagaEm instanceof Date)).toBe(true)
    // A soma das comissões quitadas é exatamente o valor do saque.
    expect(quitadas.reduce((t, c) => t + c.valor, 0)).toBe(saque.valor)
  })

  it('o saldo do parceiro reflete o pagamento, sem dinheiro ressuscitado', async () => {
    const { resumo, saques } = await listarComissoesDoParceiro(joao.id)

    // O valor pago entrou no total já pago.
    expect(resumo.pagaCentavos).toBeGreaterThan(0)

    /*
      O que sobra em `disponivel` é o segundo saque de João, ainda solicitado —
      e é justamente por isso que o livre continua zero: pago não volta ao
      saldo, e reservado também não. Dinheiro pago reaparecendo como sacável é
      o pior estado possível desta tela.
    */
    const aindaReservado = saques
      .filter((saque) => saque.status === 'solicitado')
      .reduce((total, saque) => total + saque.valorCentavos, 0)
    expect(resumo.disponivelCentavos).toBe(aindaReservado)
    expect(resumo.livreCentavos).toBe(0)
  })

  it('pagar de novo não duplica nada', async () => {
    const [saque] = await db
      .select({ id: parceiroSaques.id, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.status, 'pago'))
      .limit(1)

    entrarComo(contas.gestor.token)
    const repetido = await marcarSaquePago({ saqueId: saque.id })
    sairDaSessao()
    expect(repetido.sucesso).toBe(false)

    const [depois] = await db
      .select({ status: parceiroSaques.status, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saque.id))
    // O timestamp original não foi sobrescrito.
    expect(depois.status).toBe('pago')
    expect(depois.pagoEm?.getTime()).toBe(saque.pagoEm?.getTime())

    // Um evento de pagamento, e só um. O de solicitação aponta para o mesmo
    // saque de propósito: junto, os dois contam a história inteira dele.
    const pagamentos = await db
      .select({ id: eventosAuditoria.id })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.registroAfetado, saque.id),
          eq(eventosAuditoria.acao, 'saque_parceiro_pago'),
        ),
      )
    expect(pagamentos).toHaveLength(1)
  })

  it('comissão de outro parceiro não é tocada', async () => {
    const daMaria = await listarComissoesDoParceiro(maria.id)
    // Maria tem saque próprio, ainda solicitado: nada dela virou paga.
    expect(daMaria.resumo.pagaCentavos).toBe(0)
    expect(daMaria.saques.every((s) => s.status === 'solicitado')).toBe(true)
  })

  it('comissão fora de qualquer saque permanece intacta', async () => {
    const geradas = await db
      .select({ status: parceiroComissoes.status })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.status, 'gerada'))
    // A comissão em `gerada` do começo do cenário continua lá.
    expect(geradas.length).toBeGreaterThan(0)
  })

  it('a Gestão enxerga o saque com a origem de cada centavo', async () => {
    const saques = await listarSaquesParaGestao()
    const doJoao = saques.find((s) => s.parceiroId === joao.id)!

    expect(doJoao.parceiroCodigo).toBe(joao.codigo)
    expect(doJoao.origens.length).toBeGreaterThan(0)
    expect(
      doJoao.origens.reduce((t, o) => t + o.valorCentavos, 0),
    ).toBe(doJoao.valorCentavos)
  })

  it('o pagamento fica auditado com autor, valor e comissões', async () => {
    const [evento] = await db
      .select({ acao: eventosAuditoria.acao, metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, 'saque_parceiro_pago'))

    const dados = evento.metadados as { valorCentavos: number; comissoes: string[] }
    expect(evento.acao).toBe('saque_parceiro_pago')
    expect(dados.comissoes.length).toBeGreaterThan(0)
    expect(dados.valorCentavos).toBeGreaterThan(0)
  })
})

/**
 * Recusar devolve dinheiro. O que estes testes protegem é que ele volte por
 * inteiro, uma vez só, e possa de fato ser sacado de novo — um saldo que
 * reaparece na tela mas trava no próximo pedido seria pior do que não voltar.
 */
describe('Gestão recusa um saque e devolve o saldo', () => {
  it('só o Gestor recusa', async () => {
    await darComissao(maria.id, 4000)
    entrarComo(contas.maria.token)
    await solicitarSaque()
    sairDaSessao()

    const [saque] = await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(
        and(
          eq(parceiroSaques.parceiroId, maria.id),
          eq(parceiroSaques.status, 'solicitado'),
        ),
      )
      .limit(1)

    for (const chave of ['maria', 'joao', 'cliente'] as const) {
      entrarComo(contas[chave].token)
      const negado = await recusarSaque({ saqueId: saque.id })
      sairDaSessao()
      expect(negado.sucesso).toBe(false)
    }
    const anonimo = await recusarSaque({ saqueId: saque.id })
    expect(anonimo.sucesso).toBe(false)

    const [intacto] = await db
      .select({ status: parceiroSaques.status })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saque.id))
    expect(intacto.status).toBe('solicitado')
  })

  it('a recusa devolve o valor ao saldo livre do parceiro', async () => {
    const antes = await listarComissoesDoParceiro(maria.id)
    const pendente = antes.saques.find((s) => s.status === 'solicitado')!
    expect(antes.resumo.livreCentavos).toBe(0)

    entrarComo(contas.gestor.token)
    const resultado = await recusarSaque({
      saqueId: pendente.id,
      motivo: 'Dados de recebimento a conferir.',
    })
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)

    const depois = await listarComissoesDoParceiro(maria.id)
    // O reservado sai e o livre volta exatamente o valor recusado.
    expect(depois.resumo.reservadoCentavos).toBe(
      antes.resumo.reservadoCentavos - pendente.valorCentavos,
    )
    expect(depois.resumo.livreCentavos).toBe(pendente.valorCentavos)
    expect(depois.saques.find((s) => s.id === pendente.id)!.status).toBe(
      'recusado',
    )
  })

  it('as comissões continuam disponíveis, e nenhuma vira paga', async () => {
    const { resumo } = await listarComissoesDoParceiro(maria.id)
    expect(resumo.disponivelCentavos).toBeGreaterThan(0)
    expect(resumo.pagaCentavos).toBe(0)
  })

  it('o mesmo valor pode entrar num saque novo', async () => {
    const antes = await listarComissoesDoParceiro(maria.id)
    const livre = antes.resumo.livreCentavos
    expect(livre).toBeGreaterThan(0)

    entrarComo(contas.maria.token)
    const novo = await solicitarSaque()
    sairDaSessao()

    // Sem o índice parcial, este insert colidiria com a reserva antiga: o
    // dinheiro apareceria no saldo e travaria na hora de sacar.
    expect(novo.sucesso).toBe(true)
    expect(novo.sucesso && novo.dados?.valorCentavos).toBe(livre)

    const depois = await listarComissoesDoParceiro(maria.id)
    expect(depois.resumo.livreCentavos).toBe(0)
  })

  it('recusar de novo não devolve o saldo duas vezes', async () => {
    const [recusado] = await db
      .select({ id: parceiroSaques.id, em: parceiroSaques.recusadoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.status, 'recusado'))
      .limit(1)

    const antes = await listarComissoesDoParceiro(maria.id)

    entrarComo(contas.gestor.token)
    const repetido = await recusarSaque({ saqueId: recusado.id })
    sairDaSessao()
    expect(repetido.sucesso).toBe(false)

    const depois = await listarComissoesDoParceiro(maria.id)
    expect(depois.resumo.livreCentavos).toBe(antes.resumo.livreCentavos)
    expect(depois.resumo.reservadoCentavos).toBe(antes.resumo.reservadoCentavos)

    const [agora] = await db
      .select({ em: parceiroSaques.recusadoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, recusado.id))
    // O carimbo original não foi sobrescrito.
    expect(agora.em?.getTime()).toBe(recusado.em?.getTime())

    const eventos = await db
      .select({ id: eventosAuditoria.id })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.registroAfetado, recusado.id),
          eq(eventosAuditoria.acao, 'saque_parceiro_recusado'),
        ),
      )
    expect(eventos).toHaveLength(1)
  })

  it('saque já pago não pode ser recusado', async () => {
    const [pago] = await db
      .select({ id: parceiroSaques.id, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.status, 'pago'))
      .limit(1)

    entrarComo(contas.gestor.token)
    const negado = await recusarSaque({ saqueId: pago.id })
    sairDaSessao()
    expect(negado.sucesso).toBe(false)

    const [depois] = await db
      .select({ status: parceiroSaques.status, pagoEm: parceiroSaques.pagoEm })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, pago.id))
    expect(depois.status).toBe('pago')
    expect(depois.pagoEm?.getTime()).toBe(pago.pagoEm?.getTime())

    // E as comissões dele continuam quitadas.
    const itens = await db
      .select({ comissaoId: parceiroSaqueItens.comissaoId })
      .from(parceiroSaqueItens)
      .where(eq(parceiroSaqueItens.saqueId, pago.id))
    const comissoes = await db
      .select({ status: parceiroComissoes.status })
      .from(parceiroComissoes)
      .where(inArray(parceiroComissoes.id, itens.map((i) => i.comissaoId)))
    expect(comissoes.every((c) => c.status === 'paga')).toBe(true)
  })

  it('duas recusas simultâneas: só uma vence', async () => {
    await darComissao(maria.id, 9000)
    entrarComo(contas.maria.token)
    await solicitarSaque()
    sairDaSessao()

    // O mais recente: Maria pode ter outros saques em aberto do cenário.
    const [alvo] = await db
      .select({ id: parceiroSaques.id, valor: parceiroSaques.valorCentavos })
      .from(parceiroSaques)
      .where(
        and(
          eq(parceiroSaques.parceiroId, maria.id),
          eq(parceiroSaques.status, 'solicitado'),
        ),
      )
      .orderBy(desc(parceiroSaques.solicitadoEm))
      .limit(1)

    const antes = await listarComissoesDoParceiro(maria.id)

    entrarComo(contas.gestor.token)
    const [a, b] = await Promise.all([
      recusarSaque({ saqueId: alvo.id }),
      recusarSaque({ saqueId: alvo.id }),
    ])
    sairDaSessao()
    expect([a.sucesso, b.sucesso].filter(Boolean)).toHaveLength(1)

    const depois = await listarComissoesDoParceiro(maria.id)
    // O saldo voltou uma vez, não duas: exatamente o valor daquele saque.
    expect(depois.resumo.livreCentavos).toBe(
      antes.resumo.livreCentavos + alvo.valor,
    )
  })

  it('o saque de outro parceiro não é afetado', async () => {
    const doJoao = await listarComissoesDoParceiro(joao.id)
    expect(doJoao.saques.some((s) => s.status === 'recusado')).toBe(false)
  })

  it('a recusa fica auditada com motivo e comissões liberadas', async () => {
    const [evento] = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, 'saque_parceiro_recusado'))

    const dados = evento.metadados as {
      valorCentavos: number
      comissoes: string[]
      motivo: string | null
    }
    expect(dados.valorCentavos).toBeGreaterThan(0)
    expect(dados.comissoes.length).toBeGreaterThan(0)
    expect(dados.motivo).toBe('Dados de recebimento a conferir.')
  })
})
