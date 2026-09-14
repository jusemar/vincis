import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  contratacoesServico,
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroBonus,
  parceiroCampanhaContribuicoes,
  parceiroCampanhaRecompensas,
  parceiroCampanhas,
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  parceiroPontosLancamentos,
  parceiroRecebimentos,
  parceiroSaqueItens,
  parceiroSaques,
} from '@/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '@/features/assinaturas/constants/pagamento'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import {
  confirmarPagamentoDeAssinatura,
  estornarPagamentoDeAssinatura,
} from '@/features/assinaturas/lib/pagamentos'
import { somarDiasEmDataLocal } from '@/features/consultorias/lib/tempo'
import { ativarParceiro } from '@/features/parceiros/actions/ativar-parceiro'
import {
  cancelarCampanhaDeParceiros,
  publicarCampanhaDeParceiros,
  salvarRascunhoDeCampanha,
} from '@/features/parceiros/actions/campanhas'
import { marcarSaquePago } from '@/features/parceiros/actions/marcar-saque-pago'
import { salvarRecebimento } from '@/features/parceiros/actions/salvar-recebimento'
import { solicitarSaque } from '@/features/parceiros/actions/solicitar-saque'
import { TIPOS_META_FUTUROS } from '@/features/parceiros/constants/campanha'
import {
  MOTIVO_SAQUE_CANCELADO_POR_BONUS,
  criarRascunhoDeCampanha,
  editarRascunhoDeCampanha,
  hojeEmSaoPaulo,
  listarCampanhasDoParceiro,
  listarCampanhasParaGestao,
  obterExtratoDePontos,
  publicarCampanha,
  sincronizarCampanhaDoParceiro,
  type DadosDaCampanha,
} from '@/features/parceiros/lib/campanhas'
import { moverComissaoDaContratacao } from '@/features/parceiros/lib/registrar-comissao'
import { listarComissoesDoParceiro } from '@/features/parceiros/queries/listar-comissoes'
import { listarSaquesParaGestao } from '@/features/parceiros/queries/listar-saques-gestao'
import { obterParceiroDoUsuario } from '@/features/parceiros/queries/obter-parceiro'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/*
  Campanhas, bônus e pontos — com fatos de negócio reais.

  Alvos, valores, pontos e datas desta suíte são fixtures: o software não
  conhece nenhum deles. Cada cenário usa um parceiro próprio e cancela as suas
  campanhas ao terminar, para que uma campanha publicada não conte fatos de
  outro cenário.
*/

const SUFIXO = '@parceiros.campanhas.teste'
const PARCEIROS = ['pGes', 'pRec', 'pAvu', 'pVal', 'pRev', 'pMul', 'pCon', 'pPer'] as const
type ChaveParceiro = (typeof PARCEIROS)[number]
type Conta = { id: string; token: string }

let contas: Record<string, Conta>
const parceiro = {} as Record<ChaveParceiro, string>
let servicoId: string
let proximoCliente = 0
const campanhasDaSuite: string[] = []
const AMBIENTE_ORIGINAL = process.env.VINCIS_AMBIENTE
let hoje: string

/* ----------------------------------------------------------------- roteiro */

function dados(parcial: Partial<DadosDaCampanha> = {}): DadosDaCampanha {
  return {
    titulo: 'Campanha de teste',
    descricao: '',
    tipoMeta: 'novos_clientes_recorrentes',
    alvo: 2,
    bonusCentavos: 15_000,
    pontos: 300,
    inicio: hoje,
    fim: somarDiasEmDataLocal(hoje, 30),
    ...parcial,
  }
}

async function campanhaPublicada(parcial: Partial<DadosDaCampanha> = {}) {
  const criada = await criarRascunhoDeCampanha(dados(parcial), contas.gestor.id)
  if (!criada.ok) throw new Error(criada.mensagem)
  campanhasDaSuite.push(criada.id)
  const publicada = await publicarCampanha(criada.id, contas.gestor.id)
  if (!publicada.ok) throw new Error(publicada.mensagem)
  return criada.id
}

/** Tira as campanhas do cenário do ar, para não contarem fatos de outro cenário. */
async function encerrarCenario(ids: string[]) {
  if (ids.length) {
    await db
      .update(parceiroCampanhas)
      .set({ status: 'cancelada', canceladaEm: new Date() })
      .where(inArray(parceiroCampanhas.id, ids))
  }
}

function novoCliente(): Conta {
  const conta = contas[`c${String(proximoCliente++).padStart(2, '0')}`]
  if (!conta) throw new Error('faltou conta de cliente na suíte')
  return conta
}

/** O cliente nasceu pelo link do parceiro: a indicação é da conta. */
async function indicado(chave: ChaveParceiro, cliente = novoCliente()) {
  await db.insert(parceiroIndicacoes).values({
    parceiroId: parceiro[chave],
    visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0'),
    usuarioId: cliente.id,
  })
  return cliente
}

async function assinaturaDe(clienteId: string) {
  const [contrato] = await db
    .insert(assinaturas)
    .values({
      clienteUsuarioId: clienteId,
      planoCodigo: 'padrao',
      planoNome: 'Contabilidade Padrão',
      periodoCodigo: 'seis_meses',
      periodicidade: 'semestral',
      meses: 6,
      valorMensalCheioCentavos: 26_000,
      descontoMilesimos: 80,
      valorMensalCentavos: 24_000,
      valorTotalCentavos: 144_000,
      oferta: {},
      chaveIntencao: `campanhas-${crypto.randomUUID()}`,
    })
    .returning({ id: assinaturas.id })
  await gerarCompetenciasPrevistas(db, contrato.id)
  return contrato.id
}

async function pagar(assinaturaId: string, confirmadoEm?: Date) {
  const chave = `campanhas-${assinaturaId}`
  const pago = await confirmarPagamentoDeAssinatura({
    assinaturaId,
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: chave,
    valorCentavos: 144_000,
    confirmadoEm,
  })
  if (!pago.ok) throw new Error(pago.motivo)
  return { chave, pagamentoId: pago.pagamentoId }
}

/** Cliente indicado com assinatura ativada e paga — um "novo cliente recorrente". */
async function clientePago(chave: ChaveParceiro, confirmadoEm?: Date) {
  const cliente = await indicado(chave)
  const assinaturaId = await assinaturaDe(cliente.id)
  const pagamento = await pagar(assinaturaId, confirmadoEm)
  return { cliente, assinaturaId, ...pagamento }
}

function estornar(chave: string) {
  return estornarPagamentoDeAssinatura({ provedor: PROVEDOR_HOMOLOGACAO, chaveIdempotencia: chave })
}

/** Serviço avulso contratado do catálogo por cliente indicado — e concluído, ou não. */
async function servicoAvulso(chave: ChaveParceiro | null, destino: 'disponivel' | 'cancelada' | null) {
  const cliente = chave ? await indicado(chave) : novoCliente()
  const contratou = await comSessao(cliente.token, () => contratarServico({ servicoId }))
  if (!contratou.sucesso) throw new Error(contratou.mensagem)
  const [contratacao] = await db
    .select({ id: contratacoesServico.id })
    .from(contratacoesServico)
    .where(
      and(eq(contratacoesServico.clienteUsuarioId, cliente.id), eq(contratacoesServico.servicoId, servicoId)),
    )
    .orderBy(desc(contratacoesServico.createdAt))
    .limit(1)
  if (destino) await moverComissaoDaContratacao(db, contratacao.id, destino)
  return { cliente, contratacaoId: contratacao.id }
}

async function sincronizar(campanhaId: string, chave: ChaveParceiro) {
  return db.transaction((tx) => sincronizarCampanhaDoParceiro(tx, campanhaId, parceiro[chave]))
}

async function contribuicoes(campanhaId: string, chave: ChaveParceiro, status?: 'valida' | 'revertida') {
  return db
    .select()
    .from(parceiroCampanhaContribuicoes)
    .where(
      and(
        eq(parceiroCampanhaContribuicoes.campanhaId, campanhaId),
        eq(parceiroCampanhaContribuicoes.parceiroId, parceiro[chave]),
        ...(status ? [eq(parceiroCampanhaContribuicoes.status, status)] : []),
      ),
    )
}

async function recompensas(campanhaId: string, chave: ChaveParceiro) {
  return db
    .select()
    .from(parceiroCampanhaRecompensas)
    .where(
      and(
        eq(parceiroCampanhaRecompensas.campanhaId, campanhaId),
        eq(parceiroCampanhaRecompensas.parceiroId, parceiro[chave]),
      ),
    )
    .orderBy(desc(parceiroCampanhaRecompensas.concedidaEm))
}

async function bonusDe(recompensaId: string) {
  const [linha] = await db.select().from(parceiroBonus).where(eq(parceiroBonus.recompensaId, recompensaId))
  return linha ?? null
}

async function progressoDe(campanhaId: string, chave: ChaveParceiro) {
  const lista = await listarCampanhasDoParceiro(parceiro[chave])
  return lista.find((c) => c.id === campanhaId) ?? null
}

/* ----------------------------------------------------------------- cenário */

beforeAll(async () => {
  process.env.VINCIS_AMBIENTE = 'homologacao'
  hoje = hojeEmSaoPaulo()
  const definicoes: Record<string, { perfil: string; prestador?: 'profissional' }> = {
    gestor: { perfil: 'gestor_vincis' },
    prestador: { perfil: 'profissional', prestador: 'profissional' },
    comum: { perfil: 'cliente' },
  }
  for (const chave of PARCEIROS) definicoes[chave] = { perfil: 'cliente' }
  for (let i = 0; i < 40; i++) definicoes[`c${String(i).padStart(2, '0')}`] = { perfil: 'cliente' }
  contas = (await criarContas(SUFIXO, definicoes as Parameters<typeof criarContas>[1], '119486')) as Record<
    string,
    Conta
  >

  for (const chave of PARCEIROS) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
    await salvarRecebimento({
      tipoChave: 'email',
      chave: `${chave.toLowerCase()}.campanha@vincis.local`,
      titular: `Titular ${chave}`,
    })
    sairDaSessao()
    parceiro[chave] = (await obterParceiroDoUsuario(contas[chave].id))!.id
  }

  entrarComo(contas.prestador.token)
  const servico = await criarServico({
    nome: 'Serviço de Campanha',
    categoria: 'contabil',
    descricaoCurta: 'Serviço de teste.',
    descricaoDetalhada: 'Detalhe.',
    itensIncluidos: ['Item'],
    checklistModelo: [],
    modeloPreco: 'fixo',
    valor: '500,00',
    prazoEstimadoDias: 5,
    ativo: true,
    publico: true,
    ordem: 0,
  })
  sairDaSessao()
  if (!servico.sucesso) throw new Error('serviço não criado')
  servicoId = (servico as { dados: { id: string } }).dados.id
})

afterAll(async () => {
  sairDaSessao()
  if (AMBIENTE_ORIGINAL === undefined) delete process.env.VINCIS_AMBIENTE
  else process.env.VINCIS_AMBIENTE = AMBIENTE_ORIGINAL

  const parceiros = Object.values(parceiro)
  const saques = (
    await db.select({ id: parceiroSaques.id }).from(parceiroSaques).where(inArray(parceiroSaques.parceiroId, parceiros))
  ).map((s) => s.id)
  if (saques.length) {
    await db.delete(parceiroSaqueItens).where(inArray(parceiroSaqueItens.saqueId, saques))
    await db.delete(parceiroSaques).where(inArray(parceiroSaques.id, saques))
  }
  await db.delete(parceiroRecebimentos).where(inArray(parceiroRecebimentos.parceiroId, parceiros))
  await db.delete(parceiroPontosLancamentos).where(inArray(parceiroPontosLancamentos.parceiroId, parceiros))
  await db.delete(parceiroBonus).where(inArray(parceiroBonus.parceiroId, parceiros))
  const todasCampanhas = (
    await db.select({ id: parceiroCampanhas.id }).from(parceiroCampanhas).where(
      or(inArray(parceiroCampanhas.id, campanhasDaSuite.length ? campanhasDaSuite : ['00000000-0000-0000-0000-000000000000']), eq(parceiroCampanhas.criadaPor, contas.gestor.id)),
    )
  ).map((c) => c.id)
  if (todasCampanhas.length) {
    await db.delete(parceiroCampanhaRecompensas).where(inArray(parceiroCampanhaRecompensas.campanhaId, todasCampanhas))
    await db.delete(parceiroCampanhaContribuicoes).where(inArray(parceiroCampanhaContribuicoes.campanhaId, todasCampanhas))
    await db.delete(parceiroCampanhas).where(inArray(parceiroCampanhas.id, todasCampanhas))
  }
  await db.delete(parceiroComissoes).where(inArray(parceiroComissoes.parceiroId, parceiros))
  await db.delete(parceiroAtribuicoes).where(inArray(parceiroAtribuicoes.parceiroId, parceiros))

  const clientes = Object.entries(contas).filter(([k]) => /^c\d+$|^comum$/.test(k)).map(([, c]) => c.id)
  const doCenario = (
    await db.select({ id: assinaturas.id }).from(assinaturas).where(inArray(assinaturas.clienteUsuarioId, clientes))
  ).map((a) => a.id)
  if (doCenario.length) {
    await db.delete(assinaturaPagamentoAlocacoes).where(inArray(assinaturaPagamentoAlocacoes.assinaturaId, doCenario))
    await db.delete(assinaturaPagamentos).where(inArray(assinaturaPagamentos.assinaturaId, doCenario))
    await db.delete(assinaturaCompetencias).where(inArray(assinaturaCompetencias.assinaturaId, doCenario))
    await db.delete(assinaturas).where(inArray(assinaturas.id, doCenario))
  }
  const ciclos = (
    await db.select({ id: parceiroIndicacoes.id }).from(parceiroIndicacoes).where(inArray(parceiroIndicacoes.parceiroId, parceiros))
  ).map((c) => c.id)
  if (ciclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ciclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ciclos))
  }
  const todos = Object.values(contas).map((c) => c.id)
  const lista = (ids: string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `)
  await db
    .delete(eventosAuditoria)
    .where(
      sql`${eventosAuditoria.autorId} in (${lista(todos)}) or ${eventosAuditoria.usuarioId} in (${lista(todos)})
        or ${eventosAuditoria.metadados}->>'parceiroId' in (${lista(parceiros)})`,
    )
  await limparContas(SUFIXO)
})

/* ------------------------------------------------------------------ gestão */

describe('gestão de campanhas', () => {
  const criadas: string[] = []
  afterAll(() => encerrarCenario(criadas))

  const formulario = {
    titulo: 'Meta pela action',
    descricao: 'Descrição curta',
    tipoMeta: 'novos_clientes_recorrentes',
    alvo: '3',
    bonus: '150,00',
    pontos: '300',
    get inicio() {
      return hoje
    },
    get fim() {
      return somarDiasEmDataLocal(hoje, 30)
    },
  }

  it('A. o Gestor cria rascunho pela action', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await salvarRascunhoDeCampanha({ ...formulario })
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)
    const id = (resultado as { dados: { id: string } }).dados.id
    criadas.push(id)
    campanhasDaSuite.push(id)
    const [linha] = await db.select().from(parceiroCampanhas).where(eq(parceiroCampanhas.id, id))
    expect(linha).toMatchObject({ status: 'rascunho', alvo: 3, bonusCentavos: 15_000, pontos: 300 })
  })

  it('B. cliente, parceiro e profissional não criam, publicam nem cancelam', async () => {
    const [rascunho] = criadas
    for (const chave of ['comum', 'pRec', 'prestador']) {
      entrarComo(contas[chave].token)
      expect((await salvarRascunhoDeCampanha({ ...formulario, titulo: `Forjada ${chave}` })).sucesso).toBe(false)
      expect((await publicarCampanhaDeParceiros({ id: rascunho })).sucesso).toBe(false)
      expect((await cancelarCampanhaDeParceiros({ id: rascunho })).sucesso).toBe(false)
      sairDaSessao()
    }
    const forjadas = await db
      .select({ id: parceiroCampanhas.id })
      .from(parceiroCampanhas)
      .where(sql`${parceiroCampanhas.titulo} like 'Forjada %'`)
    expect(forjadas).toHaveLength(0)
    const [linha] = await db.select().from(parceiroCampanhas).where(eq(parceiroCampanhas.id, rascunho))
    expect(linha.status).toBe('rascunho')
  })

  it('AF. recompensa zero + zero é recusada, na action e no banco', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await salvarRascunhoDeCampanha({ ...formulario, bonus: '', pontos: '0' })
    sairDaSessao()
    expect(resultado).toMatchObject({ sucesso: false })
    await expect(
      db.insert(parceiroCampanhas).values({ ...dados({ bonusCentavos: 0, pontos: 0 }) }),
    ).rejects.toThrow()
  })

  it('AW–AZ. progressiva e combinada: "Em breve", desativadas e recusadas no servidor', async () => {
    expect(TIPOS_META_FUTUROS.map((t) => t.rotulo)).toEqual(['Meta progressiva', 'Meta combinada'])
    const tela = readFileSync(
      path.resolve(process.cwd(), 'src/features/parceiros/components/gestao/CampanhasDeParceiroPage.tsx'),
      'utf8',
    )
    expect(tela).toMatch(/TIPOS_META_FUTUROS\.map[\s\S]*?disabled[\s\S]*?Em breve/)

    entrarComo(contas.gestor.token)
    for (const tipoMeta of ['meta_progressiva', 'meta_combinada']) {
      expect((await salvarRascunhoDeCampanha({ ...formulario, tipoMeta })).sucesso).toBe(false)
    }
    sairDaSessao()
    await expect(
      db.insert(parceiroCampanhas).values({ ...dados(), tipoMeta: 'meta_progressiva' }),
    ).rejects.toThrow()
  })

  it('C/D. rascunho não conta; publicada passa a contar', async () => {
    const criada = await criarRascunhoDeCampanha(dados({ titulo: 'Rascunho que conta depois', alvo: 50 }), contas.gestor.id)
    if (!criada.ok) throw new Error(criada.mensagem)
    criadas.push(criada.id)
    campanhasDaSuite.push(criada.id)

    await clientePago('pGes')
    expect(await sincronizar(criada.id, 'pGes')).toBeNull()
    expect(await contribuicoes(criada.id, 'pGes')).toHaveLength(0)

    entrarComo(contas.gestor.token)
    expect((await publicarCampanhaDeParceiros({ id: criada.id })).sucesso).toBe(true)
    sairDaSessao()
    const progresso = await sincronizar(criada.id, 'pGes')
    expect(progresso).toMatchObject({ progresso: 1, alvo: 50, atingida: false })
  })

  it('J. regra publicada não se altera, e início no passado não publica', async () => {
    const [, publicada] = criadas.slice(-2)
    const antes = await db.select().from(parceiroCampanhas).where(eq(parceiroCampanhas.id, criadas.at(-1)!))
    const editar = await editarRascunhoDeCampanha(criadas.at(-1)!, dados({ alvo: 999 }), contas.gestor.id)
    expect(editar.ok).toBe(false)
    const depois = await db.select().from(parceiroCampanhas).where(eq(parceiroCampanhas.id, criadas.at(-1)!))
    expect(depois[0].alvo).toBe(antes[0].alvo)
    void publicada

    const passada = await criarRascunhoDeCampanha(
      dados({ inicio: somarDiasEmDataLocal(hoje, -3), fim: somarDiasEmDataLocal(hoje, 3) }),
      contas.gestor.id,
    )
    if (!passada.ok) throw new Error(passada.mensagem)
    criadas.push(passada.id)
    campanhasDaSuite.push(passada.id)
    expect((await publicarCampanha(passada.id, contas.gestor.id)).ok).toBe(false)
    expect((await criarRascunhoDeCampanha(dados({ fim: somarDiasEmDataLocal(hoje, -1) }), contas.gestor.id)).ok).toBe(false)
  })

  it('I. cancelada não recebe progresso; com recompensa concedida não cancela', async () => {
    const semPremio = await campanhaPublicada({ titulo: 'Cancelável', alvo: 99 })
    criadas.push(semPremio)
    entrarComo(contas.gestor.token)
    expect((await cancelarCampanhaDeParceiros({ id: semPremio })).sucesso).toBe(true)
    sairDaSessao()
    expect(await sincronizar(semPremio, 'pGes')).toBeNull()

    const premiada = await campanhaPublicada({ titulo: 'Já premiada', alvo: 1 })
    criadas.push(premiada)
    await sincronizar(premiada, 'pGes') // pGes já tem 1 cliente ativado hoje
    expect((await recompensas(premiada, 'pGes'))[0]?.status).toBe('concedida')
    entrarComo(contas.gestor.token)
    const recusa = await cancelarCampanhaDeParceiros({ id: premiada })
    sairDaSessao()
    expect(recusa.sucesso).toBe(false)
  })
})

/* ------------------------------------------------------------ recorrentes */

describe('novos clientes recorrentes', () => {
  let campanha: string
  beforeAll(async () => {
    campanha = await campanhaPublicada({ titulo: 'Meta de clientes', alvo: 2, bonusCentavos: 15_000, pontos: 300 })
  })
  afterAll(() => encerrarCenario([campanha]))

  it('K/L. clique e cadastro não contam', async () => {
    await db.insert(parceiroIndicacoes).values({
      parceiroId: parceiro.pRec,
      visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '9'),
    })
    await indicado('pRec')
    expect((await sincronizar(campanha, 'pRec'))?.progresso).toBe(0)
  })

  it('M. assinatura aguardando pagamento não conta', async () => {
    const cliente = await indicado('pRec')
    await assinaturaDe(cliente.id)
    expect((await sincronizar(campanha, 'pRec'))?.progresso).toBe(0)
  })

  it('N. assinatura ativada e paga conta — pelo próprio evento do pagamento', async () => {
    await clientePago('pRec')
    expect(await contribuicoes(campanha, 'pRec', 'valida')).toHaveLength(1)
    expect((await progressoDe(campanha, 'pRec'))?.progresso).toBe(1)
  })

  it('O. o mesmo cliente não conta duas vezes', async () => {
    const [primeira] = await contribuicoes(campanha, 'pRec', 'valida')
    // Segunda assinatura do mesmo cliente: não herda o parceiro (regra da origem).
    const segunda = await assinaturaDe(primeira.clienteUsuarioId!)
    await pagar(segunda)
    expect((await sincronizar(campanha, 'pRec'))?.progresso).toBe(1)
    await expect(
      db.insert(parceiroCampanhaContribuicoes).values({
        campanhaId: campanha,
        parceiroId: parceiro.pRec,
        origemTipo: primeira.origemTipo,
        origemId: primeira.origemId,
        ocorridoEm: new Date(),
      }),
    ).rejects.toThrow()
  })

  it('F/P. ativação antes do início não conta', async () => {
    await clientePago('pRec', new Date(Date.now() - 2 * 86_400_000))
    expect((await sincronizar(campanha, 'pRec'))?.progresso).toBe(1)
  })

  it('Q. contratação direta (avulsa) não conta como cliente recorrente', async () => {
    await servicoAvulso('pRec', 'disponivel')
    expect((await sincronizar(campanha, 'pRec'))?.progresso).toBe(1)
  })

  it('AE/AG. o segundo cliente atinge: bônus + pontos, uma única vez', async () => {
    await clientePago('pRec')
    for (let i = 0; i < 3; i++) await sincronizar(campanha, 'pRec')
    await Promise.all(Array.from({ length: 5 }, () => sincronizar(campanha, 'pRec')))

    const lista = await recompensas(campanha, 'pRec')
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ status: 'concedida', bonusCentavos: 15_000, pontos: 300 })
    expect(await bonusDe(lista[0].id)).toMatchObject({ status: 'disponivel', valorCentavos: 15_000 })
    const extrato = await obterExtratoDePontos(parceiro.pRec)
    expect(extrato.saldo).toBe(300)
    expect(extrato.lancamentos).toHaveLength(1)

    const vista = await progressoDe(campanha, 'pRec')
    expect(vista).toMatchObject({ progresso: 2, atingida: true, situacao: 'ativa' })
    expect(vista?.recompensa).toMatchObject({ bonusStatus: 'disponivel', pontos: 300 })
  })
})

/* ---------------------------------------------------------------- avulsos */

describe('serviços avulsos', () => {
  let campanha: string
  beforeAll(async () => {
    campanha = await campanhaPublicada({
      titulo: 'Meta de serviços',
      tipoMeta: 'servicos_avulsos',
      alvo: 2,
      bonusCentavos: 10_000,
      pontos: 0,
    })
  })
  afterAll(() => encerrarCenario([campanha]))

  it('R. serviço concluído conta, pelo evento de liberação da comissão avulsa', async () => {
    await servicoAvulso('pAvu', 'disponivel')
    expect(await contribuicoes(campanha, 'pAvu', 'valida')).toHaveLength(1)
  })

  it('S. lead sem contratação não conta', async () => {
    await indicado('pAvu')
    expect((await sincronizar(campanha, 'pAvu'))?.progresso).toBe(1)
  })

  it('T. serviço cancelado não conta', async () => {
    await servicoAvulso('pAvu', 'cancelada')
    expect((await sincronizar(campanha, 'pAvu'))?.progresso).toBe(1)
  })

  it('U. concluir de novo não duplica', async () => {
    const [primeira] = await contribuicoes(campanha, 'pAvu', 'valida')
    const [comissao] = await db
      .select({ contratacaoId: parceiroComissoes.contratacaoId })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.id, primeira.origemId))
    await moverComissaoDaContratacao(db, comissao.contratacaoId!, 'disponivel')
    expect((await sincronizar(campanha, 'pAvu'))?.progresso).toBe(1)
  })

  it('V. contratação sem parceiro (sem receita do programa) não conta', async () => {
    await servicoAvulso(null, 'disponivel')
    expect((await sincronizar(campanha, 'pAvu'))?.progresso).toBe(1)
  })

  it('AC. o segundo serviço atinge: só dinheiro, nenhum ponto', async () => {
    await servicoAvulso('pAvu', 'disponivel')
    const [recompensa] = await recompensas(campanha, 'pAvu')
    expect(recompensa).toMatchObject({ status: 'concedida', bonusCentavos: 10_000, pontos: 0 })
    expect(await bonusDe(recompensa.id)).toMatchObject({ valorCentavos: 10_000 })
    expect((await obterExtratoDePontos(parceiro.pAvu)).lancamentos).toHaveLength(0)
  })
})

/* ------------------------------------------------------------ valor gerado */

describe('valor total gerado', () => {
  let campanha: string
  let pagamentoRecorrente: { chave: string }
  beforeAll(async () => {
    campanha = await campanhaPublicada({
      titulo: 'Meta de valor',
      tipoMeta: 'valor_gerado',
      alvo: 150_000,
      bonusCentavos: 0,
      pontos: 500,
    })
  })
  afterAll(() => encerrarCenario([campanha]))

  it('W. pagamento confirmado de assinatura originada soma', async () => {
    pagamentoRecorrente = await clientePago('pVal')
    expect((await sincronizar(campanha, 'pVal'))?.progresso).toBe(144_000)
  })

  it('X. pagamento pendente não soma', async () => {
    const cliente = await indicado('pVal')
    const assinaturaId = await assinaturaDe(cliente.id)
    await db.insert(assinaturaPagamentos).values({
      assinaturaId,
      valorCentavos: 144_000,
      provedor: PROVEDOR_HOMOLOGACAO,
      chaveIdempotencia: `pendente-${assinaturaId}`,
    })
    expect((await sincronizar(campanha, 'pVal'))?.progresso).toBe(144_000)
  })

  it('AA/AB/AD/Z. avulso soma o valor real; centavos exatos; só pontos; sem duplicar', async () => {
    await servicoAvulso('pVal', 'disponivel')
    for (let i = 0; i < 3; i++) await sincronizar(campanha, 'pVal')
    const vista = await progressoDe(campanha, 'pVal')
    expect(vista?.progresso).toBe(194_000)
    const [recompensa] = await recompensas(campanha, 'pVal')
    expect(recompensa).toMatchObject({ status: 'concedida', bonusCentavos: 0, pontos: 500 })
    expect(await bonusDe(recompensa.id)).toBeNull()
    expect((await obterExtratoDePontos(parceiro.pVal)).saldo).toBe(500)
  })

  it('Y/AL/AM/AN/AR. estorno retira o valor, desfaz a recompensa e estorna os pontos', async () => {
    expect(await estornar(pagamentoRecorrente.chave)).toMatchObject({ ok: true, repetido: false })
    expect((await progressoDe(campanha, 'pVal'))?.progresso).toBe(50_000)
    expect(await contribuicoes(campanha, 'pVal', 'revertida')).toHaveLength(1)

    const [recompensa] = await recompensas(campanha, 'pVal')
    expect(recompensa.status).toBe('revertida')
    const extrato = await obterExtratoDePontos(parceiro.pVal)
    expect(extrato.saldo).toBe(0)
    expect(extrato.lancamentos.map((l) => l.pontos).sort((a, b) => a - b)).toEqual([-500, 500])

    expect(await estornar(pagamentoRecorrente.chave)).toMatchObject({ ok: true, repetido: true })
    await sincronizar(campanha, 'pVal')
    expect((await obterExtratoDePontos(parceiro.pVal)).lancamentos).toHaveLength(2)
  })
})

/* --------------------------------------------------- bônus, saldo e saque */

describe('bônus no saldo e no saque, e reversões', () => {
  let campanha: string
  beforeAll(async () => {
    campanha = await campanhaPublicada({ titulo: 'Bônus de saque', alvo: 1, bonusCentavos: 20_000, pontos: 100 })
  })
  afterAll(() => encerrarCenario([campanha]))

  let primeiro: Awaited<ReturnType<typeof clientePago>>
  let saqueId: string

  it('AH/AI/AJ. bônus entra no saldo livre; pontos, só no extrato', async () => {
    primeiro = await clientePago('pRev')
    const { resumo } = await listarComissoesDoParceiro(parceiro.pRev)
    expect(resumo.bonusDisponivelCentavos).toBe(20_000)
    expect(resumo.livreCentavos).toBe(20_000)
    const extrato = await obterExtratoDePontos(parceiro.pRev)
    expect(extrato).toMatchObject({ saldo: 100 })
    expect(extrato.lancamentos[0]).toMatchObject({ pontos: 100, descricao: 'Bônus de saque' })
  })

  it('AK. o saque reserva o bônus e mostra a origem campanha', async () => {
    entrarComo(contas.pRev.token)
    const saque = await solicitarSaque()
    sairDaSessao()
    if (!saque.sucesso) throw new Error(saque.mensagem)
    saqueId = saque.dados!.saqueId
    expect(saque.dados!.valorCentavos).toBe(20_000)
    const gestao = await listarSaquesParaGestao()
    const origem = gestao.find((s) => s.id === saqueId)!.origens[0]
    expect(origem).toMatchObject({ comissaoId: null, clienteNome: null, servico: 'Bônus de campanha · Bônus de saque' })
    expect(origem.bonusId).not.toBeNull()
  })

  it('AP. estorno com bônus reservado: sai do saque, que é cancelado com o motivo', async () => {
    await estornar(primeiro.chave)
    const [saque] = await db.select().from(parceiroSaques).where(eq(parceiroSaques.id, saqueId))
    expect(saque).toMatchObject({ status: 'cancelado', observacao: MOTIVO_SAQUE_CANCELADO_POR_BONUS })
    const [recompensa] = await recompensas(campanha, 'pRev')
    expect(recompensa.status).toBe('revertida')
    expect((await bonusDe(recompensa.id))?.status).toBe('cancelada')
    const { resumo } = await listarComissoesDoParceiro(parceiro.pRev)
    expect(resumo).toMatchObject({ livreCentavos: 0, reservadoCentavos: 0, bonusDisponivelCentavos: 0 })
    expect((await obterExtratoDePontos(parceiro.pRev)).saldo).toBe(0)
  })

  it('AO. atingida de novo e invalidada com o bônus livre: cancelado', async () => {
    const segundo = await clientePago('pRev')
    const [recompensa] = await recompensas(campanha, 'pRev')
    expect(recompensa.status).toBe('concedida')
    await estornar(segundo.chave)
    expect((await bonusDe(recompensa.id))?.status).toBe('cancelada')
    expect((await recompensas(campanha, 'pRev'))[0].status).toBe('revertida')
  })

  it('AQ/AR. bônus já pago: nenhum débito, compensação sinalizada, repetir não muda nada', async () => {
    const terceiro = await clientePago('pRev')
    entrarComo(contas.pRev.token)
    const saque = await solicitarSaque()
    sairDaSessao()
    if (!saque.sucesso) throw new Error(saque.mensagem)
    entrarComo(contas.gestor.token)
    expect((await marcarSaquePago({ saqueId: saque.dados!.saqueId })).sucesso).toBe(true)
    sairDaSessao()
    const [recompensa] = await recompensas(campanha, 'pRev')
    expect((await bonusDe(recompensa.id))?.status).toBe('paga')

    await estornar(terceiro.chave)
    await estornar(terceiro.chave)
    const bonus = await bonusDe(recompensa.id)
    expect(bonus?.status).toBe('paga')
    expect(bonus?.compensacaoPendenteEm).not.toBeNull()
    const [depois] = await recompensas(campanha, 'pRev')
    expect(depois).toMatchObject({ status: 'concedida' })
    expect(depois.compensacaoPendenteEm).not.toBeNull()
    // Pontos da recompensa paga ficam; os das revertidas foram estornados.
    expect((await obterExtratoDePontos(parceiro.pRev)).saldo).toBe(100)
  })
})

/* ------------------------------------------------------- várias campanhas */

describe('várias campanhas ao mesmo tempo', () => {
  let clientes: string
  let valor: string
  beforeAll(async () => {
    clientes = await campanhaPublicada({ titulo: 'Simultânea clientes', alvo: 1, bonusCentavos: 5_000, pontos: 0 })
    valor = await campanhaPublicada({
      titulo: 'Simultânea valor',
      tipoMeta: 'valor_gerado',
      alvo: 100_000,
      bonusCentavos: 0,
      pontos: 50,
    })
  })
  afterAll(() => encerrarCenario([clientes, valor]))

  it('AS/AT/AU/AV. o mesmo cliente pago conta nas duas, uma vez em cada, e rende as duas', async () => {
    await clientePago('pMul')
    await sincronizar(clientes, 'pMul')
    await sincronizar(valor, 'pMul')
    expect(await contribuicoes(clientes, 'pMul', 'valida')).toHaveLength(1)
    expect(await contribuicoes(valor, 'pMul', 'valida')).toHaveLength(1)
    expect((await recompensas(clientes, 'pMul'))[0]).toMatchObject({ status: 'concedida', bonusCentavos: 5_000 })
    expect((await recompensas(valor, 'pMul'))[0]).toMatchObject({ status: 'concedida', pontos: 50 })
    const { resumo } = await listarComissoesDoParceiro(parceiro.pMul)
    expect(resumo.bonusDisponivelCentavos).toBe(5_000)
    expect((await obterExtratoDePontos(parceiro.pMul)).saldo).toBe(50)
  })
})

/* ------------------------------------------------------------ concorrência */

describe('concorrência', () => {
  let campanha: string
  beforeAll(async () => {
    campanha = await campanhaPublicada({ titulo: 'Corrida', alvo: 2, bonusCentavos: 7_000, pontos: 70 })
  })
  afterAll(() => encerrarCenario([campanha]))

  it('dois pagamentos simultâneos atingem a meta: uma recompensa, um bônus, um crédito', async () => {
    const a = await indicado('pCon')
    const b = await indicado('pCon')
    const [assinaturaA, assinaturaB] = await Promise.all([assinaturaDe(a.id), assinaturaDe(b.id)])
    await Promise.all([pagar(assinaturaA), pagar(assinaturaB)])
    await Promise.all([sincronizar(campanha, 'pCon'), sincronizar(campanha, 'pCon')])

    const lista = await recompensas(campanha, 'pCon')
    expect(lista.filter((r) => r.status === 'concedida')).toHaveLength(1)
    const bonus = await db.select().from(parceiroBonus).where(eq(parceiroBonus.parceiroId, parceiro.pCon))
    expect(bonus).toHaveLength(1)
    expect((await obterExtratoDePontos(parceiro.pCon)).lancamentos).toHaveLength(1)
  })

  it('saque e estorno concorrentes: nenhum bônus inválido fica reservado ou livre', async () => {
    const [contribuicao] = await contribuicoes(campanha, 'pCon', 'valida')
    const [pagamento] = await db
      .select({ chave: assinaturaPagamentos.chaveIdempotencia })
      .from(assinaturaPagamentos)
      .where(eq(assinaturaPagamentos.assinaturaId, contribuicao.origemId))
    await Promise.allSettled([
      comSessao(contas.pCon.token, () => solicitarSaque()),
      estornar(pagamento.chave!),
    ])
    await sincronizar(campanha, 'pCon')

    const [bonus] = await db.select().from(parceiroBonus).where(eq(parceiroBonus.parceiroId, parceiro.pCon))
    expect(bonus.status).toBe('cancelada')
    const reservasAtivas = await db
      .select()
      .from(parceiroSaqueItens)
      .innerJoin(parceiroSaques, eq(parceiroSaques.id, parceiroSaqueItens.saqueId))
      .where(
        and(
          eq(parceiroSaqueItens.bonusId, bonus.id),
          sql`${parceiroSaqueItens.liberadoEm} is null`,
          eq(parceiroSaques.status, 'solicitado'),
        ),
      )
    expect(reservasAtivas).toHaveLength(0)
    const { resumo } = await listarComissoesDoParceiro(parceiro.pCon)
    expect(resumo.livreCentavos).toBe(0)
  })
})

/* ------------------------------------------------------------------ período */

describe('período', () => {
  let campanha: string
  beforeAll(async () => {
    campanha = await campanhaPublicada({ titulo: 'Já encerrada', alvo: 1, bonusCentavos: 1_000, pontos: 0 })
    // Fixture de tempo: a campanha publicada terminou ontem.
    await db
      .update(parceiroCampanhas)
      .set({ inicio: somarDiasEmDataLocal(hoje, -5), fim: somarDiasEmDataLocal(hoje, -1) })
      .where(eq(parceiroCampanhas.id, campanha))
  })
  afterAll(() => encerrarCenario([campanha]))

  it('E/G/H. evento depois do fim não conta; a campanha aparece encerrada', async () => {
    await clientePago('pPer')
    expect((await sincronizar(campanha, 'pPer'))?.progresso).toBe(0)
    expect(await recompensas(campanha, 'pPer')).toHaveLength(0)
    const gestao = await listarCampanhasParaGestao()
    expect(gestao.find((c) => c.id === campanha)?.situacao).toBe('encerrada')
  })
})
