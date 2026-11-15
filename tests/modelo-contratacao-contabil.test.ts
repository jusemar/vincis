import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentos,
  assinaturas,
  cobrancasPix,
  eventosAuditoria,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  servicos,
} from '@/db/schema'
import { iniciarPagamentoDoPlano } from '@/features/assinaturas/actions/pagamento-plano'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import { enviarProposta } from '@/features/oportunidades/actions/propostas'
import { iniciarPagamentoDoAcordo } from '@/features/pagamentos/actions/pagamento-acordo'
import { definirModeloContratacao } from '@/features/profissionais/actions/modelo-contratacao'
import {
  ROTULO_MODELO_CONTRATACAO,
  modeloContratacaoPublico,
} from '@/features/profissionais/constants/modelo-contratacao'
import { pesquisarProfissionaisReais } from '@/features/profissionais/queries/pesquisar-profissionais'
import { iniciarPagamentoDoServico } from '@/features/servicos/actions/contratar'
import { obterIdentidadePublica } from '@/features/servicos/queries/identidade-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { efiDeTeste } from './setup/efi-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * Modelo comercial do contador: "Contratação pela Vincis" × "Autônomo".
 *
 * Autônomo: a contabilidade recorrente (tabela "Contabilidade mensal" dele) é
 * conversa direta — sem proposta, Pix, cobrança ou assinatura da Vincis.
 * Vincis: os planos mensal/semestral/anual seguem com Pix. Sem classificação:
 * nada público é exibido e nada é presumido.
 */

const SUFIXO = '@modelo-contratacao.teste'
type Chave = 'vincis' | 'autonomo' | 'semModelo' | 'advogado' | 'cliente' | 'gestor'
let contas: Record<Chave, ContaDeTeste>

async function definirComo(conta: ContaDeTeste, usuarioId: string, modelo: 'vincis' | 'autonomo' | null) {
  return comSessao(conta.token, () => definirModeloContratacao({ usuarioId, modelo }))
}

/** Conversa da tabela "Contabilidade mensal" do profissional (origem `simulacao_preco`). */
async function conversaDaTabela(prestador: ContaDeTeste) {
  const [oportunidade] = await db
    .insert(oportunidades)
    .values({
      clienteUsuarioId: contas.cliente.id,
      categoria: 'contabilidade',
      titulo: 'Contabilidade mensal',
      descricao: 'Contabilidade mensal para empresa do Simples Nacional, com folha de dois funcionários.',
      visibilidade: 'privada',
      destinatarioId: prestador.id,
      origem: 'simulacao_preco',
      // Retrato da simulação (o banco exige quando a origem é a tabela de preços).
      simulacao: { mensalCentavos: 45_000 },
      expiraEm: new Date(Date.now() + 7 * 86_400_000),
    })
    .returning({ id: oportunidades.id })
  return oportunidade.id
}

/** Plano da Vincis (`/precos`), do jeito que a contratação grava. */
async function planoDaVincis(periodicidade: 'mensal' | 'semestral' | 'anual') {
  const meses = { mensal: 1, semestral: 6, anual: 12 }[periodicidade]
  const [linha] = await db
    .insert(assinaturas)
    .values({
      clienteUsuarioId: contas.cliente.id,
      planoCodigo: 'padrao',
      planoNome: 'Contabilidade Padrão',
      periodoCodigo: periodicidade,
      periodicidade,
      meses,
      valorMensalCheioCentavos: 30_000,
      descontoMilesimos: 0,
      valorMensalCentavos: 30_000,
      valorTotalCentavos: 30_000 * meses,
      oferta: {},
      chaveIntencao: `modelo-${crypto.randomUUID()}`,
    })
    .returning({ id: assinaturas.id, prestadorId: assinaturas.prestadorId })
  await gerarCompetenciasPrevistas(db, linha.id)
  return linha
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      vincis: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      semModelo: { perfil: 'profissional', prestador: 'profissional' },
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119479',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia' })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  sairDaSessao()
  const ids = Object.values(contas).map((c) => c.id)
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.delete(oportunidadePagamentos).where(inArray(oportunidadePagamentos.clienteUsuarioId, ids))
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  const planos = (await db.select({ id: assinaturas.id }).from(assinaturas).where(inArray(assinaturas.clienteUsuarioId, ids))).map((p) => p.id)
  if (planos.length) {
    await db.delete(assinaturaPagamentos).where(inArray(assinaturaPagamentos.assinaturaId, planos))
    await db.delete(assinaturaCompetencias).where(inArray(assinaturaCompetencias.assinaturaId, planos))
    await db.delete(assinaturas).where(inArray(assinaturas.id, planos))
  }
  await limparContas(SUFIXO)
})

describe('classificação pelo Admin', () => {
  it('cadastro existente começa "não definido"; nada é presumido', async () => {
    const [perfil] = await db
      .select({ modelo: perfisProfissionais.modeloContratacao })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.semModelo.id))
    expect(perfil.modelo).toBeNull()
  })

  it('Gestor define e a classificação persiste, com auditoria', async () => {
    expect((await definirComo(contas.gestor, contas.vincis.id, 'vincis')).sucesso).toBe(true)
    expect((await definirComo(contas.gestor, contas.autonomo.id, 'autonomo')).sucesso).toBe(true)
    const linhas = await db
      .select({ id: perfisProfissionais.usuarioId, modelo: perfisProfissionais.modeloContratacao })
      .from(perfisProfissionais)
      .where(inArray(perfisProfissionais.usuarioId, [contas.vincis.id, contas.autonomo.id]))
    expect(Object.fromEntries(linhas.map((l) => [l.id, l.modelo]))).toEqual({
      [contas.vincis.id]: 'vincis',
      [contas.autonomo.id]: 'autonomo',
    })
    const eventos = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.usuarioId, contas.autonomo.id), eq(eventosAuditoria.acao, 'modelo_contratacao_alterado')))
    expect(eventos[0]?.metadados).toEqual({ anterior: 'nao_definido', novo: 'autonomo' })
  })

  it('só o Gestor altera; o próprio profissional e o cliente não', async () => {
    expect((await definirComo(contas.autonomo, contas.autonomo.id, 'vincis')).sucesso).toBe(false)
    expect((await definirComo(contas.cliente, contas.autonomo.id, 'vincis')).sucesso).toBe(false)
  })

  it('advogado não recebe a classificação (action e CHECK do banco)', async () => {
    const r = await definirComo(contas.gestor, contas.advogado.id, 'autonomo')
    expect(r.sucesso).toBe(false)
    await expect(
      db.update(perfisProfissionais).set({ modeloContratacao: 'autonomo' }).where(eq(perfisProfissionais.usuarioId, contas.advogado.id)),
    ).rejects.toThrow()
    expect(modeloContratacaoPublico('advocacia', 'autonomo')).toBeNull()
  })
})

describe('card e perfil público', () => {
  it('card traz o selo e a descrição de cada modelo; sem classificação, nada', async () => {
    const { profissionais } = await pesquisarProfissionaisReais({ profissao: 'contabilidade', porPagina: 30 })
    const de = (id: string) => profissionais.find((p) => p.id === id)
    expect(de(contas.vincis.id)?.modeloContratacao).toBe('vincis')
    expect(de(contas.autonomo.id)?.modeloContratacao).toBe('autonomo')
    expect(de(contas.semModelo.id)?.modeloContratacao).toBeNull()

    expect(ROTULO_MODELO_CONTRATACAO.vincis).toEqual({
      selo: 'Contratação pela Vincis',
      descricao: 'Pagamento e contratação intermediados pela Vincis.',
    })
    expect(ROTULO_MODELO_CONTRATACAO.autonomo).toEqual({
      selo: 'Autônomo',
      descricao: 'Você negocia e paga diretamente ao profissional.',
    })
    const textos = JSON.stringify(ROTULO_MODELO_CONTRATACAO)
    expect(textos).not.toMatch(/Funcionário|Profissional Vincis|Equipe Vincis|Contratação direta/)
  })

  it('perfil público reflete a classificação', async () => {
    expect((await obterIdentidadePublica(contas.vincis.id))?.modeloContratacao).toBe('vincis')
    expect((await obterIdentidadePublica(contas.autonomo.id))?.modeloContratacao).toBe('autonomo')
    expect((await obterIdentidadePublica(contas.semModelo.id))?.modeloContratacao).toBeNull()
    expect((await obterIdentidadePublica(contas.advogado.id))?.modeloContratacao).toBeNull()
  })
})

describe('contabilidade recorrente', () => {
  it('Autônomo: a contabilidade mensal dele é conversa direta — sem proposta, sem Pix, sem assinatura', async () => {
    const oportunidadeId = await conversaDaTabela(contas.autonomo)
    const proposta = await comSessao(contas.autonomo.token, () =>
      enviarProposta({ oportunidadeId, mensagem: 'Contabilidade mensal completa, com folha e obrigações acessórias.', valor: '450,00', prazoEstimadoDias: 30 }),
    )
    expect(proposta.sucesso).toBe(false)
    const pagamento = await comSessao(contas.cliente.token, () => iniciarPagamentoDoAcordo({ oportunidadeId }))
    expect(pagamento.situacao).not.toBe('cobranca')
    expect(efiDeTeste.emissoes).toBe(0)
    expect(await db.select().from(cobrancasPix).where(eq(cobrancasPix.referenciaId, oportunidadeId))).toHaveLength(0)
    expect(await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, oportunidadeId))).toHaveLength(0)
    // Nenhum plano recorrente da Vincis aponta para o Autônomo.
    expect(await db.select().from(assinaturas).where(eq(assinaturas.prestadorId, contas.autonomo.id))).toHaveLength(0)
  })

  it('Contratação pela Vincis: mensal, semestral e anual da Vincis continuam gerando Pix', async () => {
    for (const periodicidade of ['mensal', 'semestral', 'anual'] as const) {
      const plano = await planoDaVincis(periodicidade)
      expect(plano.prestadorId).toBeNull()
      const r = await comSessao(contas.cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId: plano.id }))
      expect(r.situacao).toBe('cobranca')
    }
    expect(efiDeTeste.emissoes).toBe(3)
  })
})

describe('serviços avulsos', () => {
  it('cliente paga o valor cheio; a divisão vem da comissão configurada pela Gestão, sem percentual fixo no código', async () => {
    const [servico] = await db
      .insert(servicos)
      .values({
        prestadorId: contas.autonomo.id,
        nome: 'Declaração de IRPF',
        descricaoCurta: 'Declaração anual completa.',
        modeloPreco: 'fixo',
        valorCentavos: 30_000,
      })
      .returning({ id: servicos.id })
    const r = await comSessao(contas.cliente.token, () => iniciarPagamentoDoServico({ servicoId: servico.id }))
    if (r.situacao !== 'cobranca') throw new Error(r.situacao)
    expect(r.cobranca.valorCentavos).toBe(30_000)

    // A comissão da Vincis não altera o preço: ela é retida do valor pago, com o
    // percentual da configuração (o banco de testes nasce com 15%).
    expect(r.cobranca.valorCentavos).toBe(30_000)
    const [cobranca] = await db.select({ contexto: cobrancasPix.contexto }).from(cobrancasPix).where(eq(cobrancasPix.id, r.cobranca.id))
    expect((cobranca.contexto as { comissaoVincis: unknown }).comissaoVincis).toEqual({
      milesimos: 150,
      comissaoCentavos: 4_500,
      profissionalCentavos: 25_500,
    })
  })
})
