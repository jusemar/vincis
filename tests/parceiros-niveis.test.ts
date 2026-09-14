import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  parceiroNivelConfiguracoes,
  parceiroNivelEstados,
  parceiroNivelHistorico,
  parceiroNivelRegras,
} from '@/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '@/features/assinaturas/constants/pagamento'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import { confirmarPagamentoDeAssinatura } from '@/features/assinaturas/lib/pagamentos'
import { cumprirCompetencia } from '@/features/assinaturas/lib/prestacao'
import { ativarParceiro } from '@/features/parceiros/actions/ativar-parceiro'
import { salvarConfiguracaoDeNiveis } from '@/features/parceiros/actions/configurar-niveis'
import { PERCENTUAL_AVULSO } from '@/features/parceiros/constants/programa'
import {
  contarClientesRecorrentesAtivos,
  lerPercentualEmCentesimos,
  obterConfiguracaoVigente,
  obterNiveisPublicos,
  obterSituacaoDeNivel,
  obterSituacaoDeNivelDaConta,
  publicarConfiguracaoDeNiveis,
  recalcularNivelDoParceiro,
  validarConfiguracaoDeNiveis,
} from '@/features/parceiros/lib/niveis'
import {
  calcularComissaoCentavos,
  calcularComissaoPorCentesimos,
} from '@/features/parceiros/lib/registrar-comissao'
import { obterParceiroDoUsuario } from '@/features/parceiros/queries/obter-parceiro'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/*
  Níveis configurados pela Gestão.

  Toda regra aqui — mínimos, percentuais, proteção — é **fixture** desta suíte,
  publicada no começo de cada cenário. O software não conhece nenhum desses
  números; é isso que os testes provam ao trocá-los no meio do caminho e ver o
  sistema obedecer sem código novo.
*/

const SUFIXO = '@parceiros.niveis.teste'
const CLIENTES = 34
type Chave = 'ana' | 'bia' | 'caio' | 'dani' | 'eli' | 'gestor' | 'profissional' | 'comum'
type Conta = { id: string; token: string }

let contas: Record<string, Conta>
const parceiro: Record<string, string> = {}
let proximoCliente = 0
let configuracaoOriginal: Awaited<ReturnType<typeof obterConfiguracaoVigente>>
const AMBIENTE_ORIGINAL = process.env.VINCIS_AMBIENTE

type Regra = [minimo: number, centesimos: number]
function configuracao({
  bronze,
  prata,
  ouro,
  protecao,
}: {
  bronze: number
  prata: Regra
  ouro: Regra
  protecao: number
}) {
  return {
    protecaoDias: protecao,
    regras: [
      { codigo: 'bronze', minimoClientes: 0, percentualCentesimos: bronze },
      { codigo: 'prata', minimoClientes: prata[0], percentualCentesimos: prata[1] },
      { codigo: 'ouro', minimoClientes: ouro[0], percentualCentesimos: ouro[1] },
    ],
  }
}

/** Configuração inicial dos cenários: a mesma forma da semente, como fixture. */
const INICIAL = configuracao({ bronze: 500, prata: [4, 750], ouro: [10, 1_000], protecao: 30 })

async function publicar(dados: ReturnType<typeof configuracao>) {
  const r = await publicarConfiguracaoDeNiveis({ ...dados, autorId: null })
  if (!r.ok) throw new Error(r.mensagem)
  return r.versao
}

/** Um cliente novo, nascido pela indicação do parceiro, com a assinatura paga. */
async function clienteAtivo(chaveDoParceiro: string) {
  const cliente = contas[`c${String(proximoCliente++).padStart(2, '0')}`]
  const parceiroId = parceiro[chaveDoParceiro]
  // A conta nasceu pelo link: a indicação é dela desde o cadastro.
  await db.insert(parceiroIndicacoes).values({
    parceiroId,
    visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0'),
    usuarioId: cliente.id,
  })
  const [contrato] = await db
    .insert(assinaturas)
    .values({
      clienteUsuarioId: cliente.id,
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
      chaveIntencao: `niveis-${crypto.randomUUID()}`,
    })
    .returning({ id: assinaturas.id })
  await gerarCompetenciasPrevistas(db, contrato.id)
  const pago = await confirmarPagamentoDeAssinatura({
    assinaturaId: contrato.id,
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: `niveis-${contrato.id}`,
    valorCentavos: 144_000,
  })
  if (!pago.ok) throw new Error(pago.motivo)
  return { clienteId: cliente.id, assinaturaId: contrato.id }
}

async function varios(chaveDoParceiro: string, quantidade: number) {
  const criados = []
  for (let i = 0; i < quantidade; i++) criados.push(await clienteAtivo(chaveDoParceiro))
  return criados
}

async function nivel(chaveDoParceiro: string) {
  return db.transaction((tx) => recalcularNivelDoParceiro(tx, parceiro[chaveDoParceiro]))
}

async function estado(chaveDoParceiro: string) {
  const [linha] = await db
    .select()
    .from(parceiroNivelEstados)
    .where(eq(parceiroNivelEstados.parceiroId, parceiro[chaveDoParceiro]))
  return linha
}

async function expirarProtecao(chaveDoParceiro: string) {
  await db
    .update(parceiroNivelEstados)
    .set({ protegidoAte: new Date(Date.now() - 60_000) })
    .where(eq(parceiroNivelEstados.parceiroId, parceiro[chaveDoParceiro]))
}

async function cancelar(assinaturaId: string) {
  await db
    .update(assinaturas)
    .set({ status: 'cancelada', canceladoEm: new Date() })
    .where(eq(assinaturas.id, assinaturaId))
}

/** Cumpre o mês `numero` e devolve a comissão que ele gerou. */
async function comissaoDoMes(assinaturaId: string, numero: number) {
  const [mes] = await db
    .select({ id: assinaturaCompetencias.id })
    .from(assinaturaCompetencias)
    .where(
      and(
        eq(assinaturaCompetencias.assinaturaId, assinaturaId),
        eq(assinaturaCompetencias.numero, numero),
      ),
    )
  await cumprirCompetencia({ competenciaId: mes.id })
  const [comissao] = await db
    .select()
    .from(parceiroComissoes)
    .where(eq(parceiroComissoes.competenciaId, mes.id))
  return comissao
}

/** A regra que a própria comissão diz ter usado: versão e nível congelados. */
async function regraUsada(comissao: { nivelCodigo: string | null; nivelConfiguracaoVersao: number | null }) {
  const [regra] = await db
    .select({ centesimos: parceiroNivelRegras.percentualCentesimos })
    .from(parceiroNivelRegras)
    .innerJoin(
      parceiroNivelConfiguracoes,
      eq(parceiroNivelConfiguracoes.id, parceiroNivelRegras.configuracaoId),
    )
    .where(
      and(
        eq(parceiroNivelConfiguracoes.versao, comissao.nivelConfiguracaoVersao!),
        eq(parceiroNivelRegras.nivelCodigo, comissao.nivelCodigo!),
      ),
    )
  return regra.centesimos
}

function centesimosDe(percentual: string) {
  return lerPercentualEmCentesimos(percentual)!
}

beforeAll(async () => {
  process.env.VINCIS_AMBIENTE = 'homologacao'
  const definicoes: Record<string, { perfil: string; prestador?: string }> = {
    ana: { perfil: 'cliente' },
    bia: { perfil: 'cliente' },
    caio: { perfil: 'cliente' },
    dani: { perfil: 'cliente' },
    eli: { perfil: 'cliente' },
    gestor: { perfil: 'gestor_vincis' },
    profissional: { perfil: 'profissional', prestador: 'profissional' },
    comum: { perfil: 'cliente' },
  }
  for (let i = 0; i < CLIENTES; i++) {
    definicoes[`c${String(i).padStart(2, '0')}`] = { perfil: 'cliente' }
  }
  contas = (await criarContas(
    SUFIXO,
    definicoes as Parameters<typeof criarContas>[1],
    '119485',
  )) as Record<string, Conta>

  for (const chave of ['ana', 'bia', 'caio', 'dani', 'eli'] as const) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
    sairDaSessao()
    parceiro[chave] = (await obterParceiroDoUsuario(contas[chave].id))!.id
  }

  configuracaoOriginal = await obterConfiguracaoVigente()
  await publicar(INICIAL)
})

afterAll(async () => {
  sairDaSessao()
  if (AMBIENTE_ORIGINAL === undefined) delete process.env.VINCIS_AMBIENTE
  else process.env.VINCIS_AMBIENTE = AMBIENTE_ORIGINAL
  if (configuracaoOriginal?.ok) {
    await publicarConfiguracaoDeNiveis({
      protecaoDias: configuracaoOriginal.configuracao.protecaoDias,
      regras: configuracaoOriginal.configuracao.niveis.map((n) => ({
        codigo: n.codigo,
        minimoClientes: n.minimoClientes,
        percentualCentesimos: n.percentualCentesimos,
      })),
      autorId: null,
    })
  }

  const parceiros = Object.values(parceiro)
  const clientes = Object.entries(contas)
    .filter(([chave]) => /^c\d+$/.test(chave) || chave === 'comum')
    .map(([, conta]) => conta.id)
  const doCenario = (
    await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(inArray(assinaturas.clienteUsuarioId, clientes))
  ).map((a) => a.id)
  await db.delete(parceiroComissoes).where(inArray(parceiroComissoes.parceiroId, parceiros))
  await db.delete(parceiroAtribuicoes).where(inArray(parceiroAtribuicoes.parceiroId, parceiros))
  if (doCenario.length) {
    await db
      .delete(assinaturaPagamentoAlocacoes)
      .where(inArray(assinaturaPagamentoAlocacoes.assinaturaId, doCenario))
    await db
      .delete(assinaturaPagamentos)
      .where(inArray(assinaturaPagamentos.assinaturaId, doCenario))
    await db
      .delete(assinaturaCompetencias)
      .where(inArray(assinaturaCompetencias.assinaturaId, doCenario))
    await db.delete(assinaturas).where(inArray(assinaturas.id, doCenario))
  }
  const ciclos = (
    await db
      .select({ id: parceiroIndicacoes.id })
      .from(parceiroIndicacoes)
      .where(inArray(parceiroIndicacoes.parceiroId, parceiros))
  ).map((c) => c.id)
  if (ciclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ciclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ciclos))
  }
  const todos = Object.values(contas).map((c) => c.id)
  await db
    .delete(eventosAuditoria)
    .where(
      sql`${eventosAuditoria.autorId} in (${sql.join(todos.map((id) => sql`${id}`), sql`, `)})
        or ${eventosAuditoria.usuarioId} in (${sql.join(todos.map((id) => sql`${id}`), sql`, `)})
        or ${eventosAuditoria.metadados}->>'parceiroId' in (${sql.join(parceiros.map((id) => sql`${id}`), sql`, `)})`,
    )
  await limparContas(SUFIXO)
})

/* --------------------------------------------------------------- dados */

describe('a configuração é dado, não código', () => {
  it('a versão 1 semeada pela migration existe no banco', async () => {
    const [v1] = await db
      .select()
      .from(parceiroNivelConfiguracoes)
      .where(eq(parceiroNivelConfiguracoes.versao, 1))
    expect(v1).toBeDefined()
    const regras = await db
      .select()
      .from(parceiroNivelRegras)
      .where(eq(parceiroNivelRegras.configuracaoId, v1.id))
    expect(regras).toHaveLength(3)
  })

  it('nenhum número de nível ficou no código de produção', () => {
    const raiz = path.resolve(process.cwd(), 'src')
    const arquivos: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome)
        if (statSync(caminho).isDirectory()) varrer(caminho)
        else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho)
      }
    }
    varrer(raiz)
    const proibidos =
      /NIVEIS_PARCEIRO|FAIXA_RECORRENTE|DIAS_PROTECAO_DOWNGRADE|PERCENTUAL_RECORRENTE_BASE|minimoRecorrentes|progressoParaProximoNivel/
    const achados = arquivos.filter((a) => proibidos.test(readFileSync(a, 'utf8')))
    expect(achados.map((a) => path.relative(raiz, a))).toEqual([])

    // O motor e a comissão recorrente não carregam percentual nem mínimo.
    for (const arquivo of [
      'features/parceiros/lib/niveis.ts',
      'features/parceiros/lib/comissao-recorrente.ts',
      'features/parceiros/components/cliente/CardDeNiveis.tsx',
      'features/parceiros/components/cliente/HeroDoParceiro.tsx',
    ]) {
      const fonte = readFileSync(path.join(raiz, arquivo), 'utf8')
      expect(fonte, arquivo).not.toMatch(/7[,.]5|\b750\b|30 dias|minimo\s*[:=]\s*(4|10)\b/)
    }
  })

  it('valida a configuração antes de publicar', () => {
    const niveis = [
      { codigo: 'bronze', nome: 'Bronze', ordem: 1 },
      { codigo: 'prata', nome: 'Prata', ordem: 2 },
      { codigo: 'ouro', nome: 'Ouro', ordem: 3 },
    ]
    const valida = configuracao({ bronze: 500, prata: [4, 750], ouro: [10, 1_000], protecao: 30 })
    expect(validarConfiguracaoDeNiveis(niveis, valida.protecaoDias, valida.regras)).toBeNull()
    const invalidas = [
      configuracao({ bronze: 500, prata: [10, 750], ouro: [10, 1_000], protecao: 30 }),
      configuracao({ bronze: 500, prata: [12, 750], ouro: [10, 1_000], protecao: 30 }),
      configuracao({ bronze: 500, prata: [0, 750], ouro: [10, 1_000], protecao: 30 }),
      configuracao({ bronze: -1, prata: [4, 750], ouro: [10, 1_000], protecao: 30 }),
      configuracao({ bronze: 500, prata: [4, 750.5], ouro: [10, 1_000], protecao: 30 }),
      configuracao({ bronze: 500, prata: [4, 750], ouro: [10, 10_001], protecao: 30 }),
      configuracao({ bronze: 500, prata: [4, 750], ouro: [10, 1_000], protecao: -1 }),
    ]
    for (const c of invalidas) {
      expect(validarConfiguracaoDeNiveis(niveis, c.protecaoDias, c.regras)).not.toBeNull()
    }
    // Configuração incompleta também não passa.
    expect(validarConfiguracaoDeNiveis(niveis, 30, valida.regras.slice(0, 2))).not.toBeNull()
    expect(lerPercentualEmCentesimos('7,5')).toBe(750)
    expect(lerPercentualEmCentesimos('7.50')).toBe(750)
    expect(lerPercentualEmCentesimos('10%')).toBe(1_000)
    expect(lerPercentualEmCentesimos('7,555')).toBeNull()
    expect(lerPercentualEmCentesimos('-1')).toBeNull()
    expect(lerPercentualEmCentesimos('100,01')).toBeNull()
  })

  it('cálculo inteiro em centavos; o avulso não mudou', () => {
    expect(calcularComissaoPorCentesimos(24_000, 750)).toBe(1_800)
    expect(calcularComissaoPorCentesimos(40_000, 750)).toBe(3_000)
    expect(calcularComissaoPorCentesimos(33_333, 833)).toBe(2_777) // 2.776,64 → 2.777
    expect(calcularComissaoPorCentesimos(10, 500)).toBe(1) // 0,5 → 1
    expect(PERCENTUAL_AVULSO).toBe(10)
    expect(calcularComissaoCentavos(10_000, PERCENTUAL_AVULSO)).toBe(1_000)
  })
})

/* ------------------------------------------------ subida e percentual */

let anaPrimeira: string

describe('sobe na hora, e cada comissão congela o percentual do nível daquele mês', () => {
  it('abaixo do mínimo de Prata: Bronze, com o percentual de Bronze lido do banco', async () => {
    const [primeira] = await varios('ana', 1)
    anaPrimeira = primeira.assinaturaId
    const calculado = await nivel('ana')
    expect(calculado.nivel.codigo).toBe('bronze')
    expect(calculado.clientesAtivos).toBe(1)

    const comissao = await comissaoDoMes(anaPrimeira, 1)
    expect(comissao).toMatchObject({ percentual: '5.00', nivelCodigo: 'bronze', valorCentavos: 1_200 })
  })

  it('atinge o mínimo de Prata: sobe imediatamente, com proteção', async () => {
    await varios('ana', 3)
    const calculado = await nivel('ana')
    expect(calculado.nivel.codigo).toBe('prata')
    expect(calculado.clientesAtivos).toBe(4)
    const linha = await estado('ana')
    const dias = (linha.protegidoAte!.getTime() - linha.nivelDesde.getTime()) / 86_400_000
    expect(Math.round(dias)).toBe(30)
  })

  it('o contrato antigo usa o nível atual no mês seguinte, sem atribuição nova', async () => {
    const comissao = await comissaoDoMes(anaPrimeira, 2)
    expect(comissao).toMatchObject({ percentual: '7.50', nivelCodigo: 'prata', valorCentavos: 1_800 })
    const atribuicoes = await db
      .select()
      .from(parceiroAtribuicoes)
      .where(eq(parceiroAtribuicoes.assinaturaId, anaPrimeira))
    expect(atribuicoes).toHaveLength(1)
  })

  it('atinge o mínimo de Ouro: sobe, e o mês seguinte paga o percentual de Ouro', async () => {
    await varios('ana', 6)
    expect((await nivel('ana')).nivel.codigo).toBe('ouro')
    const comissao = await comissaoDoMes(anaPrimeira, 3)
    expect(comissao).toMatchObject({ percentual: '10.00', nivelCodigo: 'ouro', valorCentavos: 2_400 })
  })

  it('as comissões anteriores continuam com o percentual congelado', async () => {
    const meses = await db
      .select({ numero: assinaturaCompetencias.numero, percentual: parceiroComissoes.percentual })
      .from(parceiroComissoes)
      .innerJoin(assinaturaCompetencias, eq(assinaturaCompetencias.id, parceiroComissoes.competenciaId))
      .where(eq(assinaturaCompetencias.assinaturaId, anaPrimeira))
      .orderBy(asc(assinaturaCompetencias.numero))
    expect(meses.map((m) => m.percentual)).toEqual(['5.00', '7.50', '10.00'])
  })

  it('o histórico registra cada subida, com o motivo', async () => {
    const historico = await db
      .select()
      .from(parceiroNivelHistorico)
      .where(eq(parceiroNivelHistorico.parceiroId, parceiro.ana))
      .orderBy(asc(parceiroNivelHistorico.createdAt))
    expect(historico.map((h) => [h.nivelAnterior, h.nivelNovo, h.motivo])).toEqual([
      [null, 'bronze', 'inicial'],
      ['bronze', 'prata', 'subida_por_clientes'],
      ['prata', 'ouro', 'subida_por_clientes'],
    ])
  })
})

/* ------------------------------------ a Gestão muda a regra, sem deploy */

describe('a Gestão altera percentuais, mínimos e proteção pela action', () => {
  let caioProtegidoAntes: Date
  let biaPrimeira: string
  let biaClientes: { assinaturaId: string }[]

  it('antes: Bia e Caio sobem para Prata pela regra vigente', async () => {
    biaClientes = await varios('bia', 4)
    biaPrimeira = biaClientes[0].assinaturaId
    await varios('caio', 4)
    expect((await nivel('bia')).nivel.codigo).toBe('prata')
    expect((await nivel('caio')).nivel.codigo).toBe('prata')
    caioProtegidoAntes = (await estado('caio')).protegidoAte!
    // Uma comissão de Bia sob a regra antiga, para comparar depois.
    expect(await comissaoDoMes(biaPrimeira, 1)).toMatchObject({ percentual: '7.50' })
  })

  it('só o Gestor publica: cliente, parceiro e profissional são recusados', async () => {
    const nova = configuracao({ bronze: 500, prata: [6, 800], ouro: [12, 1_100], protecao: 45 })
    const entrada = {
      protecaoDias: String(nova.protecaoDias),
      niveis: nova.regras.map((r) => ({
        codigo: r.codigo,
        minimoClientes: String(r.minimoClientes),
        percentual: (r.percentualCentesimos / 100).toFixed(2).replace('.', ','),
      })),
    }
    const versaoAntes = (await obterConfiguracaoVigente()).ok
      ? ((await obterConfiguracaoVigente()) as { configuracao: { versao: number } }).configuracao.versao
      : 0
    for (const chave of ['comum', 'ana', 'profissional'] as Chave[]) {
      entrarComo(contas[chave].token)
      const recusa = await salvarConfiguracaoDeNiveis(entrada)
      sairDaSessao()
      expect(recusa.sucesso, chave).toBe(false)
    }
    expect(await salvarConfiguracaoDeNiveis(entrada)).toMatchObject({ sucesso: false })
    const depois = await obterConfiguracaoVigente()
    expect(depois.ok && depois.configuracao.versao).toBe(versaoAntes)

    // Configuração inválida também é recusada para o Gestor.
    entrarComo(contas.gestor.token)
    const invalida = await salvarConfiguracaoDeNiveis({
      ...entrada,
      niveis: entrada.niveis.map((n) => (n.codigo === 'ouro' ? { ...n, minimoClientes: '5' } : n)),
    })
    expect(invalida.sucesso).toBe(false)

    const publicada = await salvarConfiguracaoDeNiveis(entrada)
    sairDaSessao()
    expect(publicada.sucesso).toBe(true)
    const vigente = await obterConfiguracaoVigente()
    if (!vigente.ok) throw new Error(vigente.motivo)
    expect(vigente.configuracao.versao).toBe(versaoAntes + 1)
    expect(vigente.configuracao.protecaoDias).toBe(45)
    expect(
      vigente.configuracao.niveis.map((n) => [n.codigo, n.minimoClientes, n.percentualCentesimos]),
    ).toEqual([
      ['bronze', 0, 500],
      ['prata', 6, 800],
      ['ouro', 12, 1_100],
    ])
  })

  it('a publicação é auditada com o autor e as duas versões', async () => {
    const [evento] = await db
      .select()
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.acao, 'parceiro_niveis_configurados'),
          eq(eventosAuditoria.autorId, contas.gestor.id),
        ),
      )
      .orderBy(desc(eventosAuditoria.createdAt))
      .limit(1)
    expect(evento).toBeDefined()
    const dados = evento.metadados as { versaoAnterior: number; versaoNova: number; nova: { protecaoDias: number } }
    expect(dados.versaoNova).toBe(dados.versaoAnterior + 1)
    expect(dados.nova.protecaoDias).toBe(45)
  })

  it('protegida, Bia continua Prata e a comissão nova já usa o percentual novo', async () => {
    const calculado = await nivel('bia')
    expect(calculado.nivel.codigo).toBe('prata')
    expect(await comissaoDoMes(biaPrimeira, 2)).toMatchObject({ percentual: '8.00', valorCentavos: 1_920 })
    // A comissão anterior não mudou.
    const [primeira] = await db
      .select({ percentual: parceiroComissoes.percentual })
      .from(parceiroComissoes)
      .innerJoin(assinaturaCompetencias, eq(assinaturaCompetencias.id, parceiroComissoes.competenciaId))
      .where(and(eq(assinaturaCompetencias.assinaturaId, biaPrimeira), eq(assinaturaCompetencias.numero, 1)))
    expect(primeira.percentual).toBe('7.50')
  })

  it('a proteção já concedida mantém a data com que nasceu', async () => {
    await nivel('caio')
    expect((await estado('caio')).protegidoAte!.getTime()).toBe(caioProtegidoAntes.getTime())
  })

  it('perder clientes durante a proteção não derruba', async () => {
    await cancelar(biaClientes[3].assinaturaId)
    const calculado = await nivel('bia')
    expect(calculado.clientesAtivos).toBe(3)
    expect(calculado.nivel.codigo).toBe('prata')
  })

  it('terminada a proteção, cai para o nível que a regra vigente atende', async () => {
    await expirarProtecao('bia')
    const calculado = await nivel('bia')
    expect(calculado.nivel.codigo).toBe('bronze')
    const [ultima] = await db
      .select()
      .from(parceiroNivelHistorico)
      .where(eq(parceiroNivelHistorico.parceiroId, parceiro.bia))
      .orderBy(desc(parceiroNivelHistorico.createdAt))
      .limit(1)
    expect(ultima).toMatchObject({ nivelAnterior: 'prata', nivelNovo: 'bronze' })
    expect(['queda_apos_protecao', 'mudanca_configuracao']).toContain(ultima.motivo)
    expect(ultima.protecaoAnteriorAte).not.toBeNull()
  })

  it('Ouro com 10 clientes, sob a regra nova de 12: cai para Prata, não para a base', async () => {
    const protegida = await nivel('ana')
    expect(protegida.nivel.codigo).toBe('ouro') // ainda protegida
    // O Ouro protegido já paga o percentual novo de Ouro.
    expect(await comissaoDoMes(anaPrimeira, 4)).toMatchObject({ percentual: '11.00', valorCentavos: 2_640 })

    await expirarProtecao('ana')
    const calculado = await nivel('ana')
    expect(calculado.clientesAtivos).toBe(10)
    expect(calculado.nivel.codigo).toBe('prata')
  })

  it('com 12 clientes volta a Ouro, e a nova subida ganha a proteção nova', async () => {
    await varios('ana', 2)
    const calculado = await nivel('ana')
    expect(calculado.nivel.codigo).toBe('ouro')
    const linha = await estado('ana')
    const dias = (linha.protegidoAte!.getTime() - linha.nivelDesde.getTime()) / 86_400_000
    expect(Math.round(dias)).toBe(45)
    expect(await comissaoDoMes(anaPrimeira, 5)).toMatchObject({ percentual: '11.00', nivelCodigo: 'ouro' })
  })

  it('Bia volta a Prata ao atingir o mínimo novo, lido do banco', async () => {
    await varios('bia', 2)
    expect((await nivel('bia')).nivel.codigo).toBe('bronze') // 5 < 6
    await varios('bia', 1)
    expect((await nivel('bia')).nivel.codigo).toBe('prata') // 6
  })
})

/* ---------------------------------------------- o que conta como ativo */

describe('contagem de clientes recorrentes ativos', () => {
  it('só assinatura atribuída, ativa, vigente e paga conta — uma vez por cliente', async () => {
    const [base] = await varios('dani', 1)
    expect(await contarClientesRecorrentesAtivos(db, parceiro.dani)).toBe(1)

    // Uma segunda linha técnica do mesmo cliente não infla a contagem.
    const [outraIndicacao] = await db
      .insert(parceiroIndicacoes)
      .values({
        parceiroId: parceiro.dani,
        visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '1'),
        usuarioId: base.clienteId,
      })
      .returning({ id: parceiroIndicacoes.id })
    const [segunda] = await db
      .insert(assinaturas)
      .values({
        clienteUsuarioId: base.clienteId,
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
        chaveIntencao: `niveis-dup-${crypto.randomUUID()}`,
      })
      .returning({ id: assinaturas.id })
    await gerarCompetenciasPrevistas(db, segunda.id)
    await confirmarPagamentoDeAssinatura({
      assinaturaId: segunda.id,
      provedor: PROVEDOR_HOMOLOGACAO,
      chaveIdempotencia: `niveis-dup-${segunda.id}`,
      valorCentavos: 144_000,
    })
    await db.insert(parceiroAtribuicoes).values({
      indicacaoId: outraIndicacao.id,
      parceiroId: parceiro.dani,
      usuarioId: base.clienteId,
      assinaturaId: segunda.id,
      resolvidaPor: 'conta',
    })
    expect(await contarClientesRecorrentesAtivos(db, parceiro.dani)).toBe(1)

    // Aguardando pagamento, mesmo atribuída, não conta.
    const cliente = contas[`c${String(proximoCliente++).padStart(2, '0')}`]
    const [indicacao] = await db
      .insert(parceiroIndicacoes)
      .values({
        parceiroId: parceiro.dani,
        visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '2'),
        usuarioId: cliente.id,
      })
      .returning({ id: parceiroIndicacoes.id })
    const [pendente] = await db
      .insert(assinaturas)
      .values({
        clienteUsuarioId: cliente.id,
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
        chaveIntencao: `niveis-pend-${crypto.randomUUID()}`,
      })
      .returning({ id: assinaturas.id })
    await gerarCompetenciasPrevistas(db, pendente.id)
    await db.insert(parceiroAtribuicoes).values({
      indicacaoId: indicacao.id,
      parceiroId: parceiro.dani,
      usuarioId: cliente.id,
      assinaturaId: pendente.id,
      resolvidaPor: 'conta',
    })
    expect(await contarClientesRecorrentesAtivos(db, parceiro.dani)).toBe(1)

    // Assinatura sem parceiro não conta para ninguém.
    const antes = await contarClientesRecorrentesAtivos(db, parceiro.dani)
    const [semParceiro] = await db
      .insert(assinaturas)
      .values({
        clienteUsuarioId: contas.comum.id,
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
        chaveIntencao: `niveis-sem-${crypto.randomUUID()}`,
      })
      .returning({ id: assinaturas.id })
    await gerarCompetenciasPrevistas(db, semParceiro.id)
    await confirmarPagamentoDeAssinatura({
      assinaturaId: semParceiro.id,
      provedor: PROVEDOR_HOMOLOGACAO,
      chaveIdempotencia: `niveis-sem-${semParceiro.id}`,
      valorCentavos: 144_000,
    })
    expect(await contarClientesRecorrentesAtivos(db, parceiro.dani)).toBe(antes)

    // Cancelada deixa de contar.
    await cancelar(base.assinaturaId)
    await cancelar(segunda.id)
    expect(await contarClientesRecorrentesAtivos(db, parceiro.dani)).toBe(0)
  })

  it('o mês pago precisa estar vigente: sem período cobrindo o dia, não conta', async () => {
    const [cliente] = await varios('eli', 1)
    expect(await contarClientesRecorrentesAtivos(db, parceiro.eli)).toBe(1)
    const daqui8Meses = new Date(Date.now() + 240 * 86_400_000)
    expect(await contarClientesRecorrentesAtivos(db, parceiro.eli, daqui8Meses)).toBe(0)
    await cancelar(cliente.assinaturaId)
  })
})

/* ---------------------------------------------- idempotência e corrida */

describe('idempotência e concorrência', () => {
  it('recalcular sem novidade não muda nada nem grava histórico', async () => {
    const antes = await db
      .select({ id: parceiroNivelHistorico.id })
      .from(parceiroNivelHistorico)
      .where(eq(parceiroNivelHistorico.parceiroId, parceiro.ana))
    await nivel('ana')
    await nivel('ana')
    const depois = await db
      .select({ id: parceiroNivelHistorico.id })
      .from(parceiroNivelHistorico)
      .where(eq(parceiroNivelHistorico.parceiroId, parceiro.ana))
    expect(depois).toHaveLength(antes.length)
  })

  it('cumprir de novo não duplica a comissão', async () => {
    const primeira = await comissaoDoMes(anaPrimeira, 5)
    const segunda = await comissaoDoMes(anaPrimeira, 5)
    expect(segunda.id).toBe(primeira.id)
  })

  it('duas ativações simultâneas: a subida acontece uma vez', async () => {
    await publicar(INICIAL)
    await varios('eli', 2) // eli: 2 ativos (o primeiro foi cancelado)
    await Promise.all([clienteAtivo('eli'), clienteAtivo('eli')])
    const calculado = await nivel('eli')
    expect(calculado.clientesAtivos).toBe(4)
    expect(calculado.nivel.codigo).toBe('prata')
    const subidas = await db
      .select()
      .from(parceiroNivelHistorico)
      .where(
        and(
          eq(parceiroNivelHistorico.parceiroId, parceiro.eli),
          eq(parceiroNivelHistorico.nivelNovo, 'prata'),
        ),
      )
    expect(subidas).toHaveLength(1)
  })

  it('comissões simultâneas e publicação no meio: cada uma congela a regra que usou', async () => {
    const eli = await db
      .select({ id: assinaturas.id })
      .from(parceiroAtribuicoes)
      .innerJoin(assinaturas, eq(assinaturas.id, parceiroAtribuicoes.assinaturaId))
      .where(and(eq(parceiroAtribuicoes.parceiroId, parceiro.eli), eq(assinaturas.status, 'ativa')))
    const [comissoes] = await Promise.all([
      Promise.all(eli.slice(0, 3).map((a) => comissaoDoMes(a.id, 1))),
      publicar(configuracao({ bronze: 450, prata: [3, 900], ouro: [10, 1_000], protecao: 30 })),
    ])
    for (const comissao of comissoes) {
      expect(comissao.nivelConfiguracaoVersao).not.toBeNull()
      expect(centesimosDe(comissao.percentual)).toBe(await regraUsada(comissao))
      expect(comissao.valorCentavos).toBe(
        calcularComissaoPorCentesimos(24_000, centesimosDe(comissao.percentual)),
      )
    }
    await publicar(INICIAL)
  })
})

/* ------------------------------------------------ painel e indisponível */

describe('o painel mostra a configuração', () => {
  it('nível, percentual, próximo nível, quanto falta e progresso vêm da regra vigente', async () => {
    await publicar(configuracao({ bronze: 500, prata: [6, 800], ouro: [12, 1_100], protecao: 45 }))
    const situacao = await obterSituacaoDeNivel(parceiro.dani)
    expect(situacao).not.toBeNull()
    expect(situacao!.nivel).toMatchObject({ codigo: 'bronze', percentualCentesimos: 500 })
    expect(situacao!.clientesAtivos).toBe(0)
    expect(situacao!.proximo).toMatchObject({ codigo: 'prata', minimoClientes: 6, faltam: 6 })
    expect(situacao!.progresso).toBe(0)
    expect(situacao!.protecaoDias).toBe(45)
    expect(situacao!.niveis.map((n) => [n.minimoClientes, n.percentualCentesimos])).toEqual([
      [0, 500],
      [6, 800],
      [12, 1_100],
    ])

    const deBia = await obterSituacaoDeNivel(parceiro.bia)
    expect(deBia!.nivel.codigo).toBe('prata')
    expect(deBia!.proximo).toMatchObject({ codigo: 'ouro', faltam: 12 - deBia!.clientesAtivos })
    expect(deBia!.progresso).toBe(Math.round((deBia!.clientesAtivos / 12) * 100))
    await publicar(INICIAL)
  })

  it('sem configuração válida: nenhum percentual inventado e nenhuma comissão', async () => {
    const [ultima] = await db
      .select({ versao: parceiroNivelConfiguracoes.versao })
      .from(parceiroNivelConfiguracoes)
      .orderBy(desc(parceiroNivelConfiguracoes.versao))
      .limit(1)
    // Uma versão incompleta — sem a regra do Ouro — vira a vigente.
    const [quebrada] = await db
      .insert(parceiroNivelConfiguracoes)
      .values({ versao: ultima.versao + 1, protecaoDias: 30 })
      .returning({ id: parceiroNivelConfiguracoes.id })
    await db.insert(parceiroNivelRegras).values([
      { configuracaoId: quebrada.id, nivelCodigo: 'bronze', minimoClientes: 0, percentualCentesimos: 500 },
      { configuracaoId: quebrada.id, nivelCodigo: 'prata', minimoClientes: 4, percentualCentesimos: 750 },
    ])

    expect((await obterConfiguracaoVigente()).ok).toBe(false)
    expect(await obterSituacaoDeNivel(parceiro.ana)).toBeNull()
    const [mes6] = await db
      .select({ id: assinaturaCompetencias.id })
      .from(assinaturaCompetencias)
      .where(and(eq(assinaturaCompetencias.assinaturaId, anaPrimeira), eq(assinaturaCompetencias.numero, 6)))
    const cumprido = await cumprirCompetencia({ competenciaId: mes6.id })
    expect(cumprido).toMatchObject({
      ok: true,
      comissao: { criada: false, motivo: 'configuracao_indisponivel' },
    })

    // Publicar uma configuração válida destrava — e o mês pendente ganha a sua.
    await publicar(INICIAL)
    const retomada = await comissaoDoMes(anaPrimeira, 6)
    expect(retomada).toBeDefined()
    expect(centesimosDe(retomada.percentual)).toBe(await regraUsada(retomada))
  })
})

/* ------------------------------------------------------ página pública */

describe('a vitrine pública lê a mesma configuração', () => {
  it('devolve só o necessário para exibir, sem dado administrativo', async () => {
    await publicar(INICIAL)
    const publicos = await obterNiveisPublicos()
    expect(publicos).not.toBeNull()
    expect(
      publicos!.niveis.map((n) => [n.codigo, n.nome, n.minimoClientes, n.percentualCentesimos]),
    ).toEqual([
      ['bronze', 'Bronze', 0, 500],
      ['prata', 'Prata', 4, 750],
      ['ouro', 'Ouro', 10, 1_000],
    ])
    expect(publicos!.protecaoDias).toBe(30)
    // Nem versão, nem identificadores, nem histórico saem daqui.
    expect(Object.keys(publicos!.niveis[0]).sort()).toEqual([
      'codigo',
      'minimoClientes',
      'nome',
      'percentualCentesimos',
    ])
    expect(JSON.stringify(publicos)).not.toMatch(/versao|vigenteDesde|configuracaoId/)
  })

  it('acompanha a mudança da Gestão e some quando a configuração é inválida', async () => {
    await publicar(configuracao({ bronze: 400, prata: [6, 800], ouro: [15, 1_200], protecao: 45 }))
    const depois = await obterNiveisPublicos()
    expect(depois!.niveis.map((n) => [n.minimoClientes, n.percentualCentesimos])).toEqual([
      [0, 400],
      [6, 800],
      [15, 1_200],
    ])
    expect(depois!.protecaoDias).toBe(45)

    const [ultima] = await db
      .select({ versao: parceiroNivelConfiguracoes.versao })
      .from(parceiroNivelConfiguracoes)
      .orderBy(desc(parceiroNivelConfiguracoes.versao))
      .limit(1)
    const [quebrada] = await db
      .insert(parceiroNivelConfiguracoes)
      .values({ versao: ultima.versao + 1, protecaoDias: 30 })
      .returning({ id: parceiroNivelConfiguracoes.id })
    await db.insert(parceiroNivelRegras).values([
      { configuracaoId: quebrada.id, nivelCodigo: 'bronze', minimoClientes: 0, percentualCentesimos: 500 },
    ])
    expect(await obterNiveisPublicos()).toBeNull()

    await publicar(INICIAL)
    const voltou = await obterNiveisPublicos()
    expect(voltou!.niveis.map((n) => n.percentualCentesimos)).toEqual([500, 750, 1_000])
  })

  it('a página pública não guarda número de nível nem Diamante', () => {
    const pagina = readFileSync(
      path.resolve(process.cwd(), 'src/features/parceiros/components/PaginaParceiros.tsx'),
      'utf8',
    )
    expect(pagina).not.toMatch(/Diamante/i)
    expect(pagina).not.toMatch(/pct:\s*"/) // percentual escrito à mão no card
    expect(pagina).not.toMatch(/0\.1\s*:|0\.2\s*:|0\.3;/) // percentual do simulador
    expect(pagina).toMatch(/formatarPercentualCentesimos/)

    const rota = readFileSync(path.resolve(process.cwd(), 'src/app/parceiros/page.tsx'), 'utf8')
    // Sem pré-render estático: a mudança da Gestão aparece sem novo deploy.
    expect(rota).toMatch(/force-dynamic/)
    expect(rota).toMatch(/obterNiveisPublicos/)
  })
})

/* ------------------------------------- Área do Cliente: Níveis e benefícios */

describe('a tela de níveis nunca confunde "sem clientes" com "indisponível"', () => {
  it('parceiro ativado com zero clientes: base, zero ativos e progresso até o próximo', async () => {
    await publicar(INICIAL)
    const [novo] = Object.entries(parceiro).filter(([chave]) => chave === 'caio')
    // Caio perdeu os clientes: cancelamos as assinaturas dele e expiramos a proteção.
    const deCaio = await db
      .select({ id: assinaturas.id })
      .from(parceiroAtribuicoes)
      .innerJoin(assinaturas, eq(assinaturas.id, parceiroAtribuicoes.assinaturaId))
      .where(eq(parceiroAtribuicoes.parceiroId, novo[1]))
    for (const a of deCaio) await cancelar(a.id)
    await nivel('caio')
    await expirarProtecao('caio')

    const situacao = await obterSituacaoDeNivelDaConta(parceiro.caio)
    expect(situacao).not.toBeNull()
    expect(situacao).toMatchObject({
      parceiroAtivo: true,
      clientesAtivos: 0,
      progresso: 0,
      nivel: { codigo: 'bronze', percentualCentesimos: 500 },
      proximo: { codigo: 'prata', minimoClientes: 4, faltam: 4 },
    })
  })

  it('conta que ainda não ativou o programa vê a trilha vigente, sem gravar estado', async () => {
    const estadosAntes = await db.select({ id: parceiroNivelEstados.parceiroId }).from(parceiroNivelEstados)
    const situacao = await obterSituacaoDeNivelDaConta(null)
    expect(situacao).toMatchObject({
      parceiroAtivo: false,
      clientesAtivos: 0,
      progresso: 0,
      protegidoAte: null,
      nivel: { codigo: 'bronze' },
      proximo: { codigo: 'prata', faltam: 4 },
    })
    expect(situacao!.niveis.map((n) => n.percentualCentesimos)).toEqual([500, 750, 1_000])
    const estadosDepois = await db.select({ id: parceiroNivelEstados.parceiroId }).from(parceiroNivelEstados)
    expect(estadosDepois).toHaveLength(estadosAntes.length)
  })

  it('e acompanha a configuração publicada', async () => {
    await publicar(configuracao({ bronze: 400, prata: [6, 800], ouro: [15, 1_200], protecao: 45 }))
    const situacao = await obterSituacaoDeNivelDaConta(null)
    expect(situacao).toMatchObject({
      nivel: { percentualCentesimos: 400 },
      proximo: { minimoClientes: 6, faltam: 6 },
      protecaoDias: 45,
    })
    await publicar(INICIAL)
  })

  it('só é nula com configuração ausente ou inválida, para parceiro e para não parceiro', async () => {
    const [ultima] = await db
      .select({ versao: parceiroNivelConfiguracoes.versao })
      .from(parceiroNivelConfiguracoes)
      .orderBy(desc(parceiroNivelConfiguracoes.versao))
      .limit(1)
    const [quebrada] = await db
      .insert(parceiroNivelConfiguracoes)
      .values({ versao: ultima.versao + 1, protecaoDias: 30 })
      .returning({ id: parceiroNivelConfiguracoes.id })
    await db.insert(parceiroNivelRegras).values([
      { configuracaoId: quebrada.id, nivelCodigo: 'bronze', minimoClientes: 0, percentualCentesimos: 500 },
    ])
    expect(await obterSituacaoDeNivelDaConta(null)).toBeNull()
    expect(await obterSituacaoDeNivelDaConta(parceiro.caio)).toBeNull()
    await publicar(INICIAL)
    expect(await obterSituacaoDeNivelDaConta(null)).not.toBeNull()
  })

  it('o rodapé de Níveis diz dado real; as rotas não exigem parceiro para calcular', () => {
    const secoes = readFileSync(
      path.resolve(process.cwd(), 'src/features/parceiros/components/cliente/SecoesDoParceiro.tsx'),
      'utf8',
    )
    const conjunto = /SECOES_COM_DADO_REAL = new Set\(\[([\s\S]*?)\]\)/.exec(secoes)![1]
    expect(conjunto).toMatch(/'niveis'/)
    expect(secoes).toMatch(/SistemaHibrido situacao=\{situacaoNivel\} estimativas=\{false\}/)
    for (const rota of ['src/app/cliente/parceiros/page.tsx', 'src/app/cliente/parceiros/[secao]/page.tsx']) {
      const fonte = readFileSync(path.resolve(process.cwd(), rota), 'utf8')
      expect(fonte, rota).toMatch(/obterSituacaoDeNivelDaConta\(parceiro\?\.id \?\? null\)/)
    }
  })
})
