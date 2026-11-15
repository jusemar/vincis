import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  atendimentos,
  cobrancasPix,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  consultoriaReservas,
  contratacoesServico,
  efiWebhookEventos,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  servicos,
} from '@/db/schema'
import {
  acompanharPagamentoDoAcordo,
  iniciarPagamentoDoAcordo,
} from '@/features/pagamentos/actions/pagamento-acordo'
import {
  acompanharPagamentoDoPlano,
  iniciarPagamentoDoPlano,
} from '@/features/assinaturas/actions/pagamento-plano'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import {
  acompanharPagamentoDaConsultoria,
  iniciarPagamentoDaConsultoria,
  pagarConsultoriaSimulado,
} from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import { simulacaoPermitida } from '@/features/pagamentos/lib/ambiente'
import {
  confirmarPixRecebido,
  sincronizarCobranca,
} from '@/features/pagamentos/lib/cobrancas'
import { responderWebhookPixEfi } from '@/features/pagamentos/lib/responder-webhook-efi'
import { processarAvisosDePix, reconciliarCobrancasPix } from '@/features/pagamentos/lib/webhook-efi'
import {
  acompanharPagamentoDoServico,
  iniciarPagamentoDoServico,
  prepararContratacaoDoServico,
} from '@/features/servicos/actions/contratar'
import { tokenWebhookValido } from '@/integracoes/efi/webhook'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  obterConfiguracaoEfi,
  resolverSandboxEfi,
  variaveisEfiFaltando,
} from '@/integracoes/efi/configuracao'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { efiDeTeste } from './setup/efi-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O pagamento real por Pix (Efí): serviço avulso, consultoria, acordo e plano.
 *
 * ## O que este arquivo precisa provar
 *
 * - QR Code emitido **não** é contratação: nada nasce antes de a Efí confirmar;
 * - confirmação só vem da consulta autenticada à Efí — webhook falso, payload
 *   forjado e navegador não confirmam nada;
 * - F5, duplo clique, webhook repetido e reconciliação produzem **um**
 *   pagamento, **uma** contratação, **um** Atendimento;
 * - preço, Cliente e Profissional vêm do servidor;
 * - horário pago não é vendido duas vezes, nem com webhook tardio.
 *
 * A Efí é a de teste (`setup/efi-de-teste.ts`); todo o resto é real.
 */

const SUFIXO = '@pagamentos-pix.teste'
const FUSO = 'America/Sao_Paulo'
const TOKEN_WEBHOOK = 'token-webhook-de-teste'

type Chave = 'profissional' | 'clienteA' | 'clienteB'
let contas: Record<Chave, ContaDeTeste>
let dataAlvo: string
let horarios: string[]

async function criarServico(dados: Partial<typeof servicos.$inferInsert> = {}) {
  const [servico] = await db
    .insert(servicos)
    .values({
      prestadorId: contas.profissional.id,
      nome: 'Abertura de MEI',
      descricaoCurta: 'Formalização completa do MEI.',
      modeloPreco: 'fixo',
      valorCentavos: 25_000,
      prazoEstimadoDias: 5,
      ...dados,
    })
    .returning({ id: servicos.id })
  return servico.id
}

async function txidDe(cobrancaId: string) {
  const [linha] = await db
    .select({ txid: cobrancasPix.txid })
    .from(cobrancasPix)
    .where(eq(cobrancasPix.id, cobrancaId))
  return linha.txid
}

async function limparDados() {
  const ids = Object.values(contas).map((c) => c.id)
  const atendimentosDosServicos = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(inArray(atendimentos.prestadorId, ids))
  if (atendimentosDosServicos.length) {
    const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
    await limparAtendimentosDosPrestadores(ids)
  }
  await db.delete(efiWebhookEventos)
  await db.delete(contratacoesServico).where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(consultoriaPagamentos).where(inArray(consultoriaPagamentos.prestadorId, ids))
  await db.delete(consultoriaAgendamentos).where(inArray(consultoriaAgendamentos.prestadorId, ids))
  await db.delete(consultoriaReservas).where(inArray(consultoriaReservas.clienteUsuarioId, ids))
  await db.delete(oportunidadePagamentos).where(inArray(oportunidadePagamentos.clienteUsuarioId, ids))
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  const minhas = await db
    .select({ id: assinaturas.id })
    .from(assinaturas)
    .where(inArray(assinaturas.clienteUsuarioId, ids))
  if (minhas.length) {
    const idsAssinaturas = minhas.map((a) => a.id)
    await db.delete(assinaturaPagamentoAlocacoes).where(inArray(assinaturaPagamentoAlocacoes.assinaturaId, idsAssinaturas))
    await db.delete(assinaturaPagamentos).where(inArray(assinaturaPagamentos.assinaturaId, idsAssinaturas))
    await db.delete(assinaturaCompetencias).where(inArray(assinaturaCompetencias.assinaturaId, idsAssinaturas))
    await db.delete(assinaturas).where(inArray(assinaturas.id, idsAssinaturas))
  }
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.delete(servicos).where(eq(servicos.prestadorId, contas.profissional.id))
}

beforeAll(async () => {
  process.env.EFI_WEBHOOK_TOKEN = TOKEN_WEBHOOK
  contas = await criarContas(
    SUFIXO,
    {
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      clienteA: { perfil: 'cliente' },
      clienteB: { perfil: 'cliente' },
    },
    '119471',
  )

  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
  entrarComo(contas.profissional.token)
  const salva = await salvarConsultoria({
    titulo: 'Consultoria tributária',
    descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
    valorCentavos: 18_000,
    duracaoMinutos: 60,
    intervaloMinutos: 15,
    antecedenciaMinimaMinutos: 120,
    horizonteDias: 60,
    timezone: FUSO,
  })
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades([
    { diaSemana: diaDaSemanaDeDataLocal(dataAlvo), horaInicio: '08:00', horaFim: '18:00' },
  ])
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()
  horarios = (
    await listarHorariosDoDia({ prestadorId: contas.profissional.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)
  if (horarios.length < 4) throw new Error('Cenário sem horários suficientes.')
}, 120_000)

beforeEach(() => {
  efiDeTeste.limpar()
})

afterEach(async () => {
  sairDaSessao()
  await limparDados()
})

afterAll(async () => {
  delete process.env.EFI_WEBHOOK_TOKEN
  await limparContas(SUFIXO)
})

describe('serviço fixo: o QR Code não é contratação', () => {
  it('emite a cobrança pelo preço do banco e não cria contratação nem Atendimento', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)

    // O navegador tenta mandar um preço: é ignorado (o schema nem o conhece).
    const resultado = await iniciarPagamentoDoServico({ servicoId, valorCentavos: 1, mensagem: 'Oi' })
    expect(resultado.situacao).toBe('cobranca')
    if (resultado.situacao !== 'cobranca') return
    expect(resultado.cobranca.valorCentavos).toBe(25_000)
    expect(resultado.cobranca.status).toBe('aguardando_pagamento')
    expect(resultado.cobranca.pixCopiaECola).toBeTruthy()
    expect(resultado.cobranca.qrCodeImagem).toMatch(/^data:image\//)

    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
    expect(await db.select().from(atendimentos).where(eq(atendimentos.prestadorId, contas.profissional.id))).toHaveLength(0)
  })

  it('F5 e duplo clique reencontram a mesma cobrança', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const [a, b] = await Promise.all([
      iniciarPagamentoDoServico({ servicoId }),
      iniciarPagamentoDoServico({ servicoId }),
    ])
    const c = await iniciarPagamentoDoServico({ servicoId })
    const ids = [a, b, c].flatMap((r) => (r.situacao === 'cobranca' ? [r.cobranca.id] : []))
    expect(new Set(ids).size).toBe(1)
    expect(await db.select().from(cobrancasPix)).toHaveLength(1)
  })

  it('pago na Efí: uma contratação e um Atendimento, com protocolo e mensagem', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId, mensagem: 'Preciso abrir o MEI.' })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)

    // Antes de pagar, acompanhar não muda nada.
    const antes = await acompanharPagamentoDoServico({ cobrancaId: emitida.cobranca.id })
    expect(antes.situacao === 'cobranca' && antes.cobranca.status).toBe('aguardando_pagamento')

    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    const depois = await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    expect(depois?.status).toBe('paga')
    expect(depois?.efeito).toBe('aplicado')
    expect(depois?.protocolo).toBeTruthy()

    const contratacoes = await db.select().from(contratacoesServico)
    expect(contratacoes).toHaveLength(1)
    expect(contratacoes[0].valorSnapshotCentavos).toBe(25_000)
    expect(contratacoes[0].cobrancaId).toBe(emitida.cobranca.id)
    expect(contratacoes[0].prestadorId).toBe(contas.profissional.id)
    const [atendimento] = await db.select().from(atendimentos).where(eq(atendimentos.contratacaoId, contratacoes[0].id))
    expect(atendimento.protocolo).toBe(depois?.protocolo)

    // Novo clique depois de pago: "já contratado", nenhuma cobrança nova.
    const outra = await iniciarPagamentoDoServico({ servicoId })
    expect(outra.situacao).toBe('ja_contratado')
    expect(await db.select().from(cobrancasPix)).toHaveLength(1)
  })

  it('webhook repetido, polling e reconciliação não duplicam nada', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    const txid = await txidDe(emitida.cobranca.id)
    efiDeTeste.pagar(txid)

    const aviso = { endToEndId: `E2E${txid}`.slice(0, 32), txid, valor: '250.00' }
    const primeiro = await processarAvisosDePix([aviso])
    const segundo = await processarAvisosDePix([aviso])
    expect(primeiro.processados).toBe(1)
    expect(segundo.repetidos).toBe(1)

    await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    await acompanharPagamentoDoServico({ cobrancaId: emitida.cobranca.id })
    await Promise.all([
      confirmarPixRecebido({ endToEndId: aviso.endToEndId, txid, valorCentavos: 25_000, horario: new Date(), devolvido: false }),
      confirmarPixRecebido({ endToEndId: aviso.endToEndId, txid, valorCentavos: 25_000, horario: new Date(), devolvido: false }),
    ])

    expect(await db.select().from(contratacoesServico)).toHaveLength(1)
    expect(await db.select().from(atendimentos).where(eq(atendimentos.prestadorId, contas.profissional.id))).toHaveLength(1)
  })

  it('webhook falso não confirma: a Efí é consultada e diz que não foi pago', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    const txid = await txidDe(emitida.cobranca.id)

    // Token certo, payload forjado — mas a Efí não tem Pix nesta cobrança.
    const resumo = await processarAvisosDePix([{ endToEndId: 'E00000000FORJADO', txid, valor: '250.00' }])
    expect(resumo.processados).toBe(0)
    const [linha] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
    expect(linha.status).toBe('aguardando_pagamento')
    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
  })

  it('webhook sem token (ou com token errado) é recusado antes de ler o corpo', async () => {
    const corpo = JSON.stringify({ pix: [{ endToEndId: 'E1', txid: 'a'.repeat(32) }] })
    const semToken = await responderWebhookPixEfi(new Request('http://x/api/efi/webhook', { method: 'POST', body: corpo }))
    const errado = await responderWebhookPixEfi(new Request('http://x/api/efi/webhook?token=errado', { method: 'POST', body: corpo }))
    const teste = await responderWebhookPixEfi(
      new Request(`http://x/api/efi/webhook?token=${TOKEN_WEBHOOK}`, { method: 'POST', body: '{"evento":"teste_webhook"}' }),
    )
    expect(semToken.status).toBe(401)
    expect(errado.status).toBe(401)
    expect(teste.status).toBe(200)
    expect(tokenWebhookValido('x', '')).toBe(false)
  })

  it('outro Cliente não acompanha nem paga a cobrança alheia', async () => {
    const servicoId = await criarServico()
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoServico({ servicoId }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)

    const deB = await comSessao(contas.clienteB.token, () =>
      acompanharPagamentoDoServico({ cobrancaId: emitida.cobranca.id }),
    )
    expect(deB.situacao).toBe('indisponivel')
  })

  it('Pix vencido sem pagamento expira; o próximo clique emite outro', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)

    await db.update(cobrancasPix).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(cobrancasPix.id, emitida.cobranca.id))
    const reconciliacao = await reconciliarCobrancasPix()
    expect(reconciliacao.encerradas).toBe(1)
    const [vencida] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
    expect(vencida.status).toBe('expirada')

    const nova = await iniciarPagamentoDoServico({ servicoId })
    expect(nova.situacao === 'cobranca' && nova.cobranca.id).not.toBe(emitida.cobranca.id)
    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
  })

  it('cobrança removida na Efí vira cancelada', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.remover(await txidDe(emitida.cobranca.id))
    const atual = await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    expect(atual?.status).toBe('cancelada')
  })

  it('Efí indisponível: nada é cobrado e a tentativa seguinte nasce limpa', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    efiDeTeste.falharProximasEmissoes(true)
    const falha = await iniciarPagamentoDoServico({ servicoId })
    expect(falha.situacao).toBe('indisponivel')
    // Falha de rede/transitória: mensagem de "tente novamente", e o motivo fica gravado.
    expect(falha.situacao === 'indisponivel' && falha.mensagem).toMatch(/Tente novamente/)
    const [registrada] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.status, 'falhou'))
    expect(registrada.erro).toBe('efi_indisponivel')
    efiDeTeste.falharProximasEmissoes(false)
    const ok = await iniciarPagamentoDoServico({ servicoId })
    expect(ok.situacao).toBe('cobranca')
  })

  it('valor divergente não produz efeito', async () => {
    const servicoId = await criarServico()
    entrarComo(contas.clienteA.token)
    const emitida = await iniciarPagamentoDoServico({ servicoId })
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id), { valorCentavos: 1 })
    const atual = await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    expect(atual?.status).toBe('aguardando_pagamento')
    expect(atual?.erro).toBe('valor_divergente')
    expect(await db.select().from(contratacoesServico)).toHaveLength(0)
  })
})

describe('serviço: portas e modelos de preço', () => {
  it('visitante recebe "precisa entrar"; Profissional não contrata; nem o próprio serviço', async () => {
    const servicoId = await criarServico()
    sairDaSessao()
    expect((await prepararContratacaoDoServico({ servicoId })).situacao).toBe('precisa_entrar')
    expect((await iniciarPagamentoDoServico({ servicoId })).situacao).toBe('precisa_entrar')
    entrarComo(contas.profissional.token)
    expect((await iniciarPagamentoDoServico({ servicoId })).situacao).toBe('nao_permitido')
    expect(await db.select().from(cobrancasPix)).toHaveLength(0)
  })

  it('sob orçamento e "a partir de" vão para orçamento; por hora vai para a agenda', async () => {
    const orcamento = await criarServico({ nome: 'Orçamento', modeloPreco: 'sob_orcamento', valorCentavos: null })
    const aPartir = await criarServico({ nome: 'A partir', modeloPreco: 'a_partir_de', valorCentavos: 10_000 })
    const hora = await criarServico({ nome: 'Hora', modeloPreco: 'por_hora', valorCentavos: 18_000 })
    entrarComo(contas.clienteA.token)
    expect((await iniciarPagamentoDoServico({ servicoId: orcamento })).situacao).toBe('requer_orcamento')
    expect((await iniciarPagamentoDoServico({ servicoId: aPartir })).situacao).toBe('requer_orcamento')
    expect((await iniciarPagamentoDoServico({ servicoId: hora })).situacao).toBe('requer_agenda')
    expect(await db.select().from(cobrancasPix)).toHaveLength(0)
  })
})

describe('consultoria: o horário só é confirmado pelo Pix', () => {
  async function reservaDe(conta: ContaDeTeste, inicio: string) {
    const resultado = await comSessao(conta.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: contas.profissional.id,
        data: dataAlvo,
        inicio,
        descricao: 'Quero revisar meu regime tributário.',
      }),
    )
    if (resultado.situacao !== 'reservado') throw new Error(resultado.situacao)
    return resultado.reserva
  }

  it('emite Pix do snapshot, estende a reserva e só agenda depois do pagamento', async () => {
    const reserva = await reservaDe(contas.clienteA, horarios[0])
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    expect(emitida.situacao).toBe('cobranca')
    if (emitida.situacao !== 'cobranca') return
    expect(emitida.cobranca.valorCentavos).toBe(18_000)

    const [estendida] = await db.select().from(consultoriaReservas).where(eq(consultoriaReservas.id, reserva.id))
    expect(estendida.expiraEm.getTime()).toBeGreaterThan(emitida.cobranca.expiraEm!.getTime())
    expect(await db.select().from(consultoriaAgendamentos).where(eq(consultoriaAgendamentos.reservaId, reserva.id))).toHaveLength(0)

    // Repetir não estica a reserva de novo.
    await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    const [mesma] = await db.select().from(consultoriaReservas).where(eq(consultoriaReservas.id, reserva.id))
    expect(mesma.expiraEm.getTime()).toBe(estendida.expiraEm.getTime())

    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    const confirmado = await comSessao(contas.clienteA.token, () =>
      acompanharPagamentoDaConsultoria({ reservaId: reserva.id }),
    )
    expect(confirmado.situacao).toBe('confirmado')
    if (confirmado.situacao !== 'confirmado') return
    expect(confirmado.protocolo).toBeTruthy()

    // Webhook repetido e nova consulta: um agendamento, um pagamento.
    await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    const pagamentos = await db.select().from(consultoriaPagamentos).where(eq(consultoriaPagamentos.reservaId, reserva.id))
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0].origem).toBe('efi')
    expect(await db.select().from(consultoriaAgendamentos).where(eq(consultoriaAgendamentos.reservaId, reserva.id))).toHaveLength(1)
  })

  it('Cliente B não emite Pix para a reserva de A', async () => {
    const reserva = await reservaDe(contas.clienteA, horarios[1])
    const deB = await comSessao(contas.clienteB.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    expect(deB.situacao).toBe('reserva_expirada')
    expect(await db.select().from(cobrancasPix)).toHaveLength(0)
  })

  it('Pix vencido encerra a reserva: não se emite outro para o mesmo horário', async () => {
    const reserva = await reservaDe(contas.clienteA, horarios[2])
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    await db.update(cobrancasPix).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(cobrancasPix.id, emitida.cobranca.id))
    const acompanhada = await comSessao(contas.clienteA.token, () => acompanharPagamentoDaConsultoria({ reservaId: reserva.id }))
    expect(acompanhada.situacao).toBe('reserva_expirada')
    const nova = await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    expect(nova.situacao).toBe('reserva_expirada')
  })

  it('webhook tardio depois de o horário ir para outro Cliente: conflito, nunca venda dupla', async () => {
    const reserva = await reservaDe(contas.clienteA, horarios[3])
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)

    // A reserva de A venceu (folga incluída) e B ficou com o horário.
    await db.update(consultoriaReservas).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(consultoriaReservas.id, reserva.id))
    const deB = await reservaDe(contas.clienteB, horarios[3])
    expect(deB.id).not.toBe(reserva.id)

    // O Pix de A chega atrasado.
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    const atual = await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    expect(atual?.status).toBe('paga')
    expect(atual?.efeito).toBe('conflito')
    expect(await db.select().from(consultoriaAgendamentos).where(eq(consultoriaAgendamentos.prestadorId, contas.profissional.id))).toHaveLength(0)

    const deA = await comSessao(contas.clienteA.token, () => acompanharPagamentoDaConsultoria({ reservaId: reserva.id }))
    expect(deA.situacao).toBe('pago_sem_horario')
  })

  it('a simulação de pagamento só existe na suíte de testes', async () => {
    expect(simulacaoPermitida({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false)
    expect(simulacaoPermitida({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false)
    expect(simulacaoPermitida({ NODE_ENV: 'test', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe(false)
    expect(typeof pagarConsultoriaSimulado).toBe('function')
  })
})

describe('acordo de orçamento', () => {
  async function acordo(valorAcordadoCentavos: number | null) {
    const [oportunidade] = await db
      .insert(oportunidades)
      .values({
        clienteUsuarioId: contas.clienteA.id,
        categoria: 'contabilidade',
        titulo: 'Regularização do CNPJ',
        descricao: 'Preciso regularizar o CNPJ da minha empresa com urgência.',
        visibilidade: 'privada',
        destinatarioId: contas.profissional.id,
      })
      .returning({ id: oportunidades.id })
    await db.insert(oportunidadePropostas).values({
      oportunidadeId: oportunidade.id,
      prestadorId: contas.profissional.id,
      mensagem: 'Faço a regularização completa em até dez dias.',
      valorCentavos: valorAcordadoCentavos,
      valorAcordadoCentavos,
      status: 'aceita',
    })
    return oportunidade.id
  }

  it('"a combinar" não gera Pix; com valor, só o Cliente dono paga e o Atendimento nasce no pagamento', async () => {
    const semValor = await acordo(null)
    expect((await comSessao(contas.clienteA.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: semValor }))).situacao).toBe('sem_valor')

    const comValor = await acordo(90_000)
    expect((await comSessao(contas.clienteB.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: comValor }))).situacao).toBe('recusado')

    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: comValor }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    expect(emitida.cobranca.valorCentavos).toBe(90_000)
    expect(await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, comValor))).toHaveLength(0)

    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    const pago = await comSessao(contas.clienteA.token, () => acompanharPagamentoDoAcordo({ oportunidadeId: comValor }))
    expect(pago.situacao).toBe('pago')
    const pagamentos = await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, comValor))
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0].origem).toBe('efi')
    expect(await db.select().from(atendimentos).where(eq(atendimentos.oportunidadeId, comValor))).toHaveLength(1)
  })
})

describe('plano da Vincis', () => {
  it('o Pix do semestre ativa a assinatura uma vez só', async () => {
    const [linha] = await db
      .insert(assinaturas)
      .values({
        clienteUsuarioId: contas.clienteA.id,
        planoCodigo: 'padrao',
        planoNome: 'Contabilidade Padrão',
        periodoCodigo: 'seis_meses',
        periodicidade: 'semestral',
        meses: 6,
        valorMensalCheioCentavos: 43_000,
        descontoMilesimos: 80,
        valorMensalCentavos: 24_000,
        valorTotalCentavos: 144_000,
        oferta: {},
        chaveIntencao: `pix-${crypto.randomUUID()}`,
      })
      .returning({ id: assinaturas.id })
    await gerarCompetenciasPrevistas(db, linha.id)

    expect((await comSessao(contas.clienteB.token, () => iniciarPagamentoDoPlano({ assinaturaId: linha.id }))).situacao).toBe('recusado')
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoPlano({ assinaturaId: linha.id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    expect(emitida.cobranca.valorCentavos).toBe(144_000)

    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    expect((await comSessao(contas.clienteA.token, () => acompanharPagamentoDoPlano({ assinaturaId: linha.id }))).situacao).toBe('pago')
    await sincronizarCobranca(emitida.cobranca.id, { forcar: true })

    const [ativa] = await db.select().from(assinaturas).where(eq(assinaturas.id, linha.id))
    expect(ativa.status).toBe('ativa')
    const pagamentos = await db
      .select()
      .from(assinaturaPagamentos)
      .where(and(eq(assinaturaPagamentos.assinaturaId, linha.id), eq(assinaturaPagamentos.provedor, 'efi')))
    expect(pagamentos).toHaveLength(1)
  })
})

describe('configuração da Efí', () => {
  it('aponta as variáveis que faltam, só pelo nome', () => {
    expect(variaveisEfiFaltando({})).toEqual([
      'EFI_CLIENT_ID',
      'EFI_CLIENT_SECRET',
      'EFI_PIX_KEY',
      'EFI_CERTIFICATE_BASE64 (ou EFI_CERTIFICATE_PATH)',
    ])
  })

  it('EFI_SANDBOX torto (linha do .env colada à seguinte) é recusado, não vira sandbox por acaso', () => {
    expect(() => resolverSandboxEfi({ EFI_SANDBOX: 'true"EFI_CERTIFICATE_PATH=/x.p12' })).toThrow(/EFI_SANDBOX inválido/)
    expect(resolverSandboxEfi({ EFI_SANDBOX: 'true' })).toBe(true)
    expect(resolverSandboxEfi({ EFI_SANDBOX: 'false' })).toBe(false)
  })

  it('certificado por caminho absoluto: aceito na máquina local, recusado na Vercel e fora de .p12', () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'efi-cert-'))
    const p12 = path.join(pasta, 'homologacao.p12')
    const txt = path.join(pasta, 'segredo.txt')
    writeFileSync(p12, 'certificado-de-teste')
    writeFileSync(txt, 'nao-e-certificado')
    const base = { EFI_CLIENT_ID: 'id', EFI_CLIENT_SECRET: 'segredo', EFI_PIX_KEY: 'chave', EFI_SANDBOX: 'true' }

    expect(obterConfiguracaoEfi({ ...base, EFI_CERTIFICATE_PATH: p12 }).certificado.toString()).toBe('certificado-de-teste')
    expect(() => obterConfiguracaoEfi({ ...base, EFI_CERTIFICATE_PATH: p12, VERCEL: '1' })).toThrow(/Vercel/)
    expect(() => obterConfiguracaoEfi({ ...base, EFI_CERTIFICATE_PATH: txt })).toThrow(/\.p12/)
    // Relativo continua preso ao projeto.
    expect(() => obterConfiguracaoEfi({ ...base, EFI_CERTIFICATE_PATH: '../fora.p12' })).toThrow(/fora do projeto/)
  })

  it('produção nunca usa sandbox; homologação nunca usa produção', () => {
    expect(() => resolverSandboxEfi({ VERCEL_ENV: 'production' })).toThrow()
    expect(resolverSandboxEfi({ VERCEL_ENV: 'production', EFI_SANDBOX: 'false' })).toBe(false)
    expect(() => resolverSandboxEfi({ VINCIS_AMBIENTE: 'homologacao', EFI_SANDBOX: 'false' })).toThrow()
    expect(resolverSandboxEfi({})).toBe(true)
  })
})
