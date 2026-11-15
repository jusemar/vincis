import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentos,
  cobrancasPix,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  consultoriaReservas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  servicos,
} from '@/db/schema'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import {
  confirmarConsultoriaJuridica,
  iniciarPagamentoDaConsultoria,
} from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import {
  listarHorariosDoDia,
  obterConsultoriaPublica,
} from '@/features/consultorias/queries/agenda-publica'
import { aceitarProposta } from '@/features/oportunidades/actions/negociacao'
import { iniciarPagamentoDoAcordo } from '@/features/pagamentos/actions/pagamento-acordo'
import { abrirCobrancaPix } from '@/features/pagamentos/lib/cobrancas'
import { MENSAGEM_HONORARIOS_DIRETOS } from '@/features/profissionais/constants/honorarios'
import { iniciarPagamentoDoServico } from '@/features/servicos/actions/contratar'
import { listarServicosPublicos } from '@/features/servicos/queries/vitrine-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { efiDeTeste } from './setup/efi-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Advocacia: a Vincis conecta, conversa, intermedeia a proposta e acompanha —
 * e não participa do pagamento dos honorários.
 *
 * Prova que nenhum caminho (serviço fixo, consultoria, acordo, chamada direta
 * ao núcleo) gera Pix, chama a Efí ou grava status financeiro para advogado,
 * e que o contador continua cobrando normalmente.
 */

const SUFIXO = '@honorarios-juridicos.teste'
const FUSO = 'America/Sao_Paulo'
type Chave = 'advogado' | 'contador' | 'cliente'
let contas: Record<Chave, ContaDeTeste>
let dataAlvo: string

async function servicoFixo(prestador: ContaDeTeste, nome: string) {
  const [s] = await db
    .insert(servicos)
    .values({
      prestadorId: prestador.id,
      nome,
      descricaoCurta: 'Serviço de preço fixo para o teste.',
      modeloPreco: 'fixo',
      valorCentavos: 50_000,
    })
    .returning({ id: servicos.id })
  return s.id
}

async function acordoAceito(prestador: ContaDeTeste) {
  const [oportunidade] = await db
    .insert(oportunidades)
    .values({
      clienteUsuarioId: contas.cliente.id,
      categoria: prestador === contas.advogado ? 'advocacia' : 'contabilidade',
      titulo: 'Revisão de contrato social',
      descricao: 'Preciso revisar o contrato social da minha empresa antes de um novo sócio.',
      visibilidade: 'privada',
      destinatarioId: prestador.id,
      expiraEm: new Date(Date.now() + 7 * 86_400_000),
    })
    .returning({ id: oportunidades.id })
  const [proposta] = await db
    .insert(oportunidadePropostas)
    .values({
      oportunidadeId: oportunidade.id,
      prestadorId: prestador.id,
      mensagem: 'Revisão completa com parecer em até cinco dias úteis.',
      valorCentavos: 120_000,
      status: 'enviada',
      validaAte: new Date(Date.now() + 3 * 86_400_000),
    })
    .returning({ id: oportunidadePropostas.id })
  const aceite = await comSessao(contas.cliente.token, () => aceitarProposta({ propostaId: proposta.id }))
  return { oportunidadeId: oportunidade.id, aceite }
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      contador: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
    },
    '119477',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia' })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))

  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
  for (const conta of [contas.advogado, contas.contador]) {
    entrarComo(conta.token)
    const salva = await salvarConsultoria({
      titulo: 'Consultoria',
      descricaoCurta: 'Conversa ao vivo.',
      valorCentavos: 30_000,
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
  }
  sairDaSessao()
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  const ids = Object.values(contas).map((c) => c.id)
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.delete(oportunidadePagamentos).where(inArray(oportunidadePagamentos.clienteUsuarioId, ids))
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  await db.delete(consultoriaPagamentos).where(inArray(consultoriaPagamentos.clienteUsuarioId, ids))
  await db.delete(consultoriaAgendamentos).where(inArray(consultoriaAgendamentos.clienteUsuarioId, ids))
  await db.delete(consultoriaReservas).where(inArray(consultoriaReservas.clienteUsuarioId, ids))
  await limparContas(SUFIXO)
})

async function cobrancasDoCliente() {
  return db.select().from(cobrancasPix).where(eq(cobrancasPix.clienteUsuarioId, contas.cliente.id))
}

describe('serviço de preço fixo', () => {
  it('advogado: vai para orçamento, sem Pix, sem chamar a Efí', async () => {
    const id = await servicoFixo(contas.advogado, 'Abertura de empresa (jurídico)')
    const r = await comSessao(contas.cliente.token, () => iniciarPagamentoDoServico({ servicoId: id }))
    expect(r.situacao).toBe('requer_orcamento')
    expect(efiDeTeste.emissoes).toBe(0)
    expect(await cobrancasDoCliente()).toHaveLength(0)

    const vitrine = await listarServicosPublicos(contas.advogado.id)
    expect(vitrine.find((s) => s.id === id)).toMatchObject({
      price: 'Consultar honorários',
      cta: 'Solicitar orçamento',
      modeloPreco: 'sob_orcamento',
    })
  })

  it('contador: continua gerando Pix normalmente', async () => {
    const id = await servicoFixo(contas.contador, 'Abertura de MEI')
    const r = await comSessao(contas.cliente.token, () => iniciarPagamentoDoServico({ servicoId: id }))
    expect(r.situacao).toBe('cobranca')
    expect(efiDeTeste.emissoes).toBe(1)
  })
})

describe('chamada direta ao núcleo de cobrança', () => {
  it('nenhuma finalidade emite Pix para advogado', async () => {
    for (const finalidade of ['servico', 'consultoria', 'acordo'] as const) {
      const r = await abrirCobrancaPix({
        finalidade,
        referenciaId: crypto.randomUUID(),
        clienteUsuarioId: contas.cliente.id,
        prestadorId: contas.advogado.id,
        valorCentavos: 10_000,
        descricao: 'Tentativa direta',
        contexto: {},
        expiracaoSegundos: 600,
      })
      expect(r).toEqual({ situacao: 'indisponivel', mensagem: MENSAGEM_HONORARIOS_DIRETOS })
    }
    expect(efiDeTeste.emissoes).toBe(0)
    expect((await cobrancasDoCliente()).filter((c) => c.prestadorId === contas.advogado.id)).toHaveLength(0)
  })
})

describe('proposta privada', () => {
  it('advogado: aceite abre o Atendimento, sem pagamento nem cobrança', async () => {
    const { oportunidadeId, aceite } = await acordoAceito(contas.advogado)
    expect(aceite.sucesso).toBe(true)
    expect(aceite.mensagem).toContain('combine os honorários diretamente')

    expect(await db.select().from(atendimentos).where(eq(atendimentos.oportunidadeId, oportunidadeId))).toHaveLength(1)
    expect(await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId))).toHaveLength(0)

    // Mesmo chamando a action de Pix do acordo à mão: recusada, sem Efí.
    const pix = await comSessao(contas.cliente.token, () => iniciarPagamentoDoAcordo({ oportunidadeId }))
    expect(pix.situacao).toBe('indisponivel')
    expect(efiDeTeste.emissoes).toBe(0)
    expect(
      await db.select().from(cobrancasPix).where(and(eq(cobrancasPix.finalidade, 'acordo'), eq(cobrancasPix.referenciaId, oportunidadeId))),
    ).toHaveLength(0)
  })

  it('contador: aceite continua esperando o pagamento para abrir o Atendimento', async () => {
    const { oportunidadeId, aceite } = await acordoAceito(contas.contador)
    expect(aceite.sucesso).toBe(true)
    expect(await db.select().from(atendimentos).where(eq(atendimentos.oportunidadeId, oportunidadeId))).toHaveLength(0)
    const pix = await comSessao(contas.cliente.token, () => iniciarPagamentoDoAcordo({ oportunidadeId }))
    expect(pix.situacao).toBe('cobranca')
  })
})

describe('agenda / consultoria', () => {
  async function reservar(prestador: ContaDeTeste, indice: number) {
    const { horarios } = await listarHorariosDoDia({ prestadorId: prestador.id, data: dataAlvo })
    const r = await comSessao(contas.cliente.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: prestador.id,
        data: dataAlvo,
        inicio: horarios[indice].inicio,
        descricao: 'Quero orientação sobre um contrato.',
      }),
    )
    if (r.situacao !== 'reservado') throw new Error(r.situacao)
    return r
  }

  it('agenda pública do advogado não expõe preço', async () => {
    const publica = await obterConsultoriaPublica(contas.advogado.id)
    expect(publica).toMatchObject({ honorariosDiretos: true, valorCentavos: 0 })
    expect((await obterConsultoriaPublica(contas.contador.id))?.valorCentavos).toBe(30_000)
  })

  it('advogado: agendamento confirmado sem Pix e sem registro de pagamento', async () => {
    const r = await reservar(contas.advogado, 0)
    expect(r.resumo.honorariosDiretos).toBe(true)

    const pix = await comSessao(contas.cliente.token, () => iniciarPagamentoDaConsultoria({ reservaId: r.reserva.id }))
    expect(pix.situacao).toBe('indisponivel')

    const confirmado = await comSessao(contas.cliente.token, () => confirmarConsultoriaJuridica({ reservaId: r.reserva.id }))
    expect(confirmado.situacao).toBe('confirmado')
    if (confirmado.situacao !== 'confirmado') return
    expect(confirmado.referencia).toBeNull()
    expect(confirmado.honorariosDiretos).toBe(true)

    // Repetir não cria segundo agendamento.
    await comSessao(contas.cliente.token, () => confirmarConsultoriaJuridica({ reservaId: r.reserva.id }))
    expect(await db.select().from(consultoriaAgendamentos).where(eq(consultoriaAgendamentos.reservaId, r.reserva.id))).toHaveLength(1)
    expect(await db.select().from(consultoriaPagamentos).where(eq(consultoriaPagamentos.reservaId, r.reserva.id))).toHaveLength(0)
    expect(efiDeTeste.emissoes).toBe(0)
  })

  it('contador: confirmar sem pagar é recusado; o Pix segue normal', async () => {
    const r = await reservar(contas.contador, 1)
    const semPagar = await comSessao(contas.cliente.token, () => confirmarConsultoriaJuridica({ reservaId: r.reserva.id }))
    expect(semPagar.situacao).toBe('falhou')
    expect(await db.select().from(consultoriaAgendamentos).where(eq(consultoriaAgendamentos.reservaId, r.reserva.id))).toHaveLength(0)

    const pix = await comSessao(contas.cliente.token, () => iniciarPagamentoDaConsultoria({ reservaId: r.reserva.id }))
    expect(pix.situacao).toBe('cobranca')
  })
})
