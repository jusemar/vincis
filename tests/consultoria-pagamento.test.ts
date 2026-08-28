import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql as bruto } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoParticipantes,
  atendimentos,
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaPagamentos,
  consultoriaReservas,
  notificacoes,
  oportunidadePagamentos,
} from '@/db/schema'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { rotaDoAtendimento } from '@/features/consultorias/constants/contratacao'
import { MENSAGEM_RESERVA_EXPIRADA } from '@/features/consultorias/constants/reserva'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { ORIGEM_SIMULADA } from '@/features/pagamentos/constants/pagamento'
import {
  MENSAGEM_PAGAMENTO_RECUSADO,
  processarPagamentoSimulado,
} from '@/features/pagamentos/lib/simulador'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O fecho do fluxo: pagar, confirmar, abrir Atendimento e protocolo.
 *
 * ## O que este arquivo precisa provar
 *
 * Que a contratação nasce **uma vez só**. Duplo clique, retry, F5 e duas
 * requisições simultâneas produzem um agendamento, um pagamento, um Atendimento
 * e um protocolo — nunca dois de nada. E que a reserva vencida não vira
 * contratação por insistência do navegador.
 *
 * ## Por que a expiração é forçada no banco
 *
 * Ninguém espera dez minutos numa suíte. Empurrar `expira_em` para o passado
 * reproduz exatamente o estado do mundo real depois do prazo, e permite testar
 * o limite sem relógio falso e sem alterar a duração de produção.
 */

const SUFIXO = '@consultoria-pagamento.teste'
const FUSO = 'America/Sao_Paulo'

type Chave = 'profissional' | 'outroProfissional' | 'clienteA' | 'clienteB'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  profissional: { perfil: 'profissional', prestador: 'profissional' },
  /** Segunda agenda, com preço e duração diferentes: prova o snapshot. */
  outroProfissional: { perfil: 'profissional', prestador: 'profissional' },
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
}

const CONFIG_A = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
  valorCentavos: 18_000,
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

const CONFIG_B = {
  titulo: 'Consultoria jurídica',
  descricaoCurta: 'Orientação para contratos.',
  valorCentavos: 25_000,
  duracaoMinutos: 45,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
let dataAlvo: string
let horariosA: string[]
let horariosB: string[]

async function configurar(conta: ContaDeTeste, config: typeof CONFIG_A) {
  entrarComo(conta.token)
  const salva = await salvarConsultoria(config)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades([
    { diaSemana: diaDaSemanaDeDataLocal(dataAlvo), horaInicio: '08:00', horaFim: '18:00' },
  ])
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()
}

function reservar(conta: ContaDeTeste, prestador: ContaDeTeste, inicio: string, texto: string) {
  return comSessao(conta.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: prestador.id,
      data: dataAlvo,
      inicio,
      descricao: texto,
    }),
  )
}

function pagar(conta: ContaDeTeste, reservaId: string, desfecho?: 'recusado') {
  return comSessao(conta.token, () =>
    pagarConsultoriaSimulado({ reservaId, desfecho }),
  )
}

/** Reserva de A no primeiro horário livre, pronta para pagar. */
async function reservaDeA(inicio: string, texto = 'Assunto do cliente A.') {
  const resultado = await reservar(contas.clienteA, contas.profissional, inicio, texto)
  if (resultado.situacao !== 'reservado') {
    throw new Error(`Reserva não obtida: ${resultado.situacao}`)
  }
  return resultado.reserva
}

async function totalDe(tabela: typeof atendimentos | typeof oportunidadePagamentos) {
  const [{ n }] = await db.select({ n: bruto<number>`count(*)::int` }).from(tabela)
  return n
}

async function limparTransacoes() {
  const configuracoes = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(
      bruto`${consultoriaConfiguracoes.prestadorId} in (${contas.profissional.id}, ${contas.outroProfissional.id})`,
    )
  const ids = configuracoes.map((c) => c.id)
  if (!ids.length) return

  const agendamentos = await db
    .select({ id: consultoriaAgendamentos.id })
    .from(consultoriaAgendamentos)
    .where(bruto`${consultoriaAgendamentos.configuracaoId} in ${bruto.raw(`('${ids.join("','")}')`)}`)

  for (const { id } of agendamentos) {
    const [atendimento] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.consultoriaAgendamentoId, id))
    if (atendimento) {
      await db
        .delete(atendimentoManifestacoes)
        .where(eq(atendimentoManifestacoes.atendimentoId, atendimento.id))
      await db
        .delete(atendimentoEventos)
        .where(eq(atendimentoEventos.atendimentoId, atendimento.id))
      await db
        .delete(atendimentoParticipantes)
        .where(eq(atendimentoParticipantes.atendimentoId, atendimento.id))
      await db.delete(atendimentos).where(eq(atendimentos.id, atendimento.id))
    }
  }
  await db
    .delete(consultoriaPagamentos)
    .where(bruto`${consultoriaPagamentos.agendamentoId} in (select id from consultoria_agendamentos where configuracao_id in ${bruto.raw(`('${ids.join("','")}')`)})`)
  await db
    .delete(consultoriaAgendamentos)
    .where(bruto`${consultoriaAgendamentos.configuracaoId} in ${bruto.raw(`('${ids.join("','")}')`)}`)
  await db
    .delete(consultoriaReservas)
    .where(bruto`${consultoriaReservas.configuracaoId} in ${bruto.raw(`('${ids.join("','")}')`)}`)
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119467')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)

  await configurar(contas.profissional, CONFIG_A)
  await configurar(contas.outroProfissional, CONFIG_B)

  horariosA = (
    await listarHorariosDoDia({ prestadorId: contas.profissional.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)
  horariosB = (
    await listarHorariosDoDia({ prestadorId: contas.outroProfissional.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)

  if (horariosA.length < 4 || horariosB.length < 2) {
    throw new Error('Cenário sem horários suficientes.')
  }
}, 120_000)

afterEach(async () => {
  sairDaSessao()
  await limparTransacoes()
})

afterAll(async () => {
  sairDaSessao()
  await limparTransacoes()
  await limparContas(SUFIXO)
})

describe('o simulador genérico', () => {
  it('aprova por padrão e marca origem e referência', () => {
    const resultado = processarPagamentoSimulado({ valorCentavos: 18_000 })
    expect(resultado.aprovado).toBe(true)
    if (!resultado.aprovado) return
    expect(resultado.origem).toBe(ORIGEM_SIMULADA)
    expect(resultado.referencia).toMatch(/^SIM-\d{4}-[A-Z2-9]{8}$/)
    expect(resultado.valorCentavos).toBe(18_000)
  })

  it('recusa quando pedido, e recusa valor inválido sempre', () => {
    const recusado = processarPagamentoSimulado({
      valorCentavos: 18_000,
      desfecho: 'recusado',
    })
    expect(recusado.aprovado).toBe(false)
    if (recusado.aprovado) return
    expect(recusado.motivo).toBe(MENSAGEM_PAGAMENTO_RECUSADO)

    expect(processarPagamentoSimulado({ valorCentavos: 0 }).aprovado).toBe(false)
    expect(processarPagamentoSimulado({ valorCentavos: -1 }).aprovado).toBe(false)
  })
})

describe('pagamento aprovado', () => {
  it('confirma, cria Atendimento com protocolo real e leva a descrição junto', async () => {
    const reserva = await reservaDeA(horariosA[0], 'Preciso revisar o regime tributário.')
    const resultado = await pagar(contas.clienteA, reserva.id)

    expect(resultado.situacao).toBe('confirmado')
    if (resultado.situacao !== 'confirmado') return
    expect(resultado.novo).toBe(true)
    // Protocolo do gerador real: `#AAAA-NNNN`, e não um formato inventado.
    expect(resultado.protocolo).toMatch(/^#\d{4}-\d{4}$/)
    expect(resultado.referencia).toMatch(/^SIM-\d{4}-[A-Z2-9]{8}$/)
    expect(resultado.valorCentavos).toBe(CONFIG_A.valorCentavos)

    const [atendimento] = await db
      .select()
      .from(atendimentos)
      .where(eq(atendimentos.id, resultado.atendimentoId))

    expect(atendimento.consultoriaAgendamentoId).toBe(resultado.agendamentoId)
    // Nenhuma oportunidade e nenhuma contratação de catálogo foram forjadas.
    expect(atendimento.oportunidadeId).toBeNull()
    expect(atendimento.contratacaoId).toBeNull()
    expect(atendimento.categoria).toBe('consultoria')
    expect(atendimento.clienteUsuarioId).toBe(contas.clienteA.id)
    expect(atendimento.prestadorId).toBe(contas.profissional.id)
    expect(atendimento.responsavelId).toBe(contas.profissional.id)
    // Consultoria tem hora marcada, não prazo de entrega.
    expect(atendimento.prazoEm).toBeNull()

    // O assunto do Cliente abre o Protocolo, sem ser pedido de novo.
    const manifestacoes = await db
      .select({ conteudo: atendimentoManifestacoes.conteudo })
      .from(atendimentoManifestacoes)
      .where(eq(atendimentoManifestacoes.atendimentoId, atendimento.id))
    expect(manifestacoes.map((m) => m.conteudo)).toContain(
      'Preciso revisar o regime tributário.',
    )

    // O Profissional entra como responsável, e ninguém mais é convidado.
    const participantes = await db
      .select({ usuarioId: atendimentoParticipantes.usuarioId, papel: atendimentoParticipantes.papel })
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimento.id))
    expect(participantes).toEqual([
      { usuarioId: contas.profissional.id, papel: 'responsavel' },
    ])
  })

  it('a reserva vira confirmada e o pagamento fica auditável', async () => {
    const reserva = await reservaDeA(horariosA[0])
    const resultado = await pagar(contas.clienteA, reserva.id)
    if (resultado.situacao !== 'confirmado') throw new Error('não confirmou')

    const [depois] = await db
      .select({ status: consultoriaReservas.status })
      .from(consultoriaReservas)
      .where(eq(consultoriaReservas.id, reserva.id))
    expect(depois.status).toBe('confirmada')

    const [pagamento] = await db
      .select()
      .from(consultoriaPagamentos)
      .where(eq(consultoriaPagamentos.reservaId, reserva.id))
    expect(pagamento.status).toBe('aprovado')
    expect(pagamento.origem).toBe(ORIGEM_SIMULADA)
    expect(pagamento.valorCentavos).toBe(CONFIG_A.valorCentavos)
    expect(pagamento.clienteUsuarioId).toBe(contas.clienteA.id)
    expect(pagamento.prestadorId).toBe(contas.profissional.id)
  })

  it('o botão de sucesso aponta para a rota real da Área do Cliente', async () => {
    const reserva = await reservaDeA(horariosA[0])
    const resultado = await pagar(contas.clienteA, reserva.id)
    if (resultado.situacao !== 'confirmado') throw new Error('não confirmou')

    const rota = rotaDoAtendimento(resultado.protocolo)
    expect(rota.startsWith('/cliente?aba=atendimentos&atendimento=')).toBe(true)
    // O `#` do protocolo precisa sobreviver à URL.
    expect(rota).toContain(encodeURIComponent(resultado.protocolo))
  })

  it('avisa o Profissional uma vez só, e não avisa quem pagou', async () => {
    const reserva = await reservaDeA(horariosA[0])
    await pagar(contas.clienteA, reserva.id)
    await pagar(contas.clienteA, reserva.id)

    const avisos = await db
      .select({ tipo: notificacoes.tipo, destinatarioId: notificacoes.destinatarioId })
      .from(notificacoes)
      .where(
        bruto`${notificacoes.destinatarioId} in (${contas.clienteA.id}, ${contas.profissional.id})`,
      )
    const paraOProfissional = avisos.filter(
      (a) => a.tipo === 'consultoria_agendada',
    )
    expect(paraOProfissional).toHaveLength(1)
    expect(paraOProfissional[0].destinatarioId).toBe(contas.profissional.id)
    // Ninguém é avisado da própria ação: quem pagou já viu o protocolo na tela.
    expect(avisos.filter((a) => a.destinatarioId === contas.clienteA.id)).toHaveLength(0)

    await db
      .delete(notificacoes)
      .where(
        bruto`${notificacoes.destinatarioId} in (${contas.clienteA.id}, ${contas.profissional.id})`,
      )
  })
})

describe('o valor é o do snapshot', () => {
  it('mudança de preço durante a reserva não afeta quem já reservou', async () => {
    const reserva = await reservaDeA(horariosA[0])
    expect(reserva.valorCentavos).toBe(18_000)

    // O Profissional reajusta enquanto o Cliente decide.
    entrarComo(contas.profissional.token)
    const reajuste = await salvarConsultoria({ ...CONFIG_A, valorCentavos: 30_000 })
    if (!reajuste.sucesso) throw new Error(reajuste.mensagem)
    sairDaSessao()

    const resultado = await pagar(contas.clienteA, reserva.id)
    expect(resultado.situacao).toBe('confirmado')
    if (resultado.situacao !== 'confirmado') return
    // Paga o que foi prometido, não o preço novo.
    expect(resultado.valorCentavos).toBe(18_000)

    const [agendamento] = await db
      .select({ valorCentavos: consultoriaAgendamentos.valorCentavos })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
    expect(agendamento.valorCentavos).toBe(18_000)

    entrarComo(contas.profissional.token)
    await salvarConsultoria(CONFIG_A)
    sairDaSessao()
  })

  it('cada Profissional cobra o próprio preço e a própria duração', async () => {
    const daA = await reservaDeA(horariosA[0])
    const reservaB = await reservar(
      contas.clienteB,
      contas.outroProfissional,
      horariosB[0],
      'Assunto do cliente B.',
    )
    if (reservaB.situacao !== 'reservado') throw new Error('B não reservou')

    const pagoA = await pagar(contas.clienteA, daA.id)
    const pagoB = await pagar(contas.clienteB, reservaB.reserva.id)

    if (pagoA.situacao !== 'confirmado' || pagoB.situacao !== 'confirmado') {
      throw new Error('faltou confirmar')
    }
    expect(pagoA.valorCentavos).toBe(18_000)
    expect(pagoA.duracaoMinutos).toBe(60)
    expect(pagoB.valorCentavos).toBe(25_000)
    expect(pagoB.duracaoMinutos).toBe(45)
    expect(pagoA.protocolo).not.toBe(pagoB.protocolo)
  })
})

describe('pagamento recusado', () => {
  it('não confirma, não cria Atendimento e não gera protocolo', async () => {
    const antes = await totalDe(atendimentos)
    const reserva = await reservaDeA(horariosA[0])

    const resultado = await pagar(contas.clienteA, reserva.id, 'recusado')
    expect(resultado.situacao).toBe('recusado')

    expect(await totalDe(atendimentos)).toBe(antes)
    const agendamentos = await db
      .select()
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
    expect(agendamentos).toHaveLength(0)
    const pagamentos = await db
      .select()
      .from(consultoriaPagamentos)
      .where(eq(consultoriaPagamentos.reservaId, reserva.id))
    expect(pagamentos).toHaveLength(0)
  })

  it('a reserva continua válida e o relógio original não é reiniciado', async () => {
    const reserva = await reservaDeA(horariosA[0])
    await pagar(contas.clienteA, reserva.id, 'recusado')

    const [depois] = await db
      .select({ status: consultoriaReservas.status, expiraEm: consultoriaReservas.expiraEm })
      .from(consultoriaReservas)
      .where(eq(consultoriaReservas.id, reserva.id))
    expect(depois.status).toBe('ativa')
    expect(depois.expiraEm.toISOString()).toBe(reserva.expiraEm.toISOString())

    // E a nova tentativa, agora aprovada, funciona.
    const segunda = await pagar(contas.clienteA, reserva.id)
    expect(segunda.situacao).toBe('confirmado')
  })
})

describe('idempotência', () => {
  it('duplo clique simultâneo produz uma contratação só', async () => {
    const reserva = await reservaDeA(horariosA[0])

    const [a, b] = await Promise.all([
      pagar(contas.clienteA, reserva.id),
      pagar(contas.clienteA, reserva.id),
    ])

    expect(a.situacao).toBe('confirmado')
    expect(b.situacao).toBe('confirmado')
    if (a.situacao !== 'confirmado' || b.situacao !== 'confirmado') return
    expect(a.protocolo).toBe(b.protocolo)
    expect(a.agendamentoId).toBe(b.agendamentoId)
    expect(a.atendimentoId).toBe(b.atendimentoId)

    expect(
      await db
        .select()
        .from(consultoriaAgendamentos)
        .where(eq(consultoriaAgendamentos.reservaId, reserva.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(consultoriaPagamentos)
        .where(eq(consultoriaPagamentos.reservaId, reserva.id)),
    ).toHaveLength(1)
    expect(
      await db
        .select()
        .from(atendimentos)
        .where(eq(atendimentos.consultoriaAgendamentoId, a.agendamentoId)),
    ).toHaveLength(1)
  })

  it('retry depois do sucesso devolve o mesmo protocolo, sem cobrar de novo', async () => {
    const reserva = await reservaDeA(horariosA[0])
    const primeira = await pagar(contas.clienteA, reserva.id)
    if (primeira.situacao !== 'confirmado') throw new Error('não confirmou')

    for (let vez = 0; vez < 3; vez += 1) {
      const repetida = await pagar(contas.clienteA, reserva.id)
      expect(repetida.situacao).toBe('confirmado')
      if (repetida.situacao !== 'confirmado') return
      expect(repetida.novo).toBe(false)
      expect(repetida.protocolo).toBe(primeira.protocolo)
      expect(repetida.referencia).toBe(primeira.referencia)
    }

    expect(
      await db
        .select()
        .from(consultoriaPagamentos)
        .where(eq(consultoriaPagamentos.reservaId, reserva.id)),
    ).toHaveLength(1)
  })

  it('um único evento de abertura, mesmo com retry', async () => {
    const reserva = await reservaDeA(horariosA[0])
    const primeira = await pagar(contas.clienteA, reserva.id)
    await pagar(contas.clienteA, reserva.id)
    if (primeira.situacao !== 'confirmado') throw new Error('não confirmou')

    const eventos = await db
      .select({ tipo: atendimentoEventos.tipo })
      .from(atendimentoEventos)
      .where(eq(atendimentoEventos.atendimentoId, primeira.atendimentoId))
    expect(eventos.filter((e) => e.tipo === 'atendimento_criado')).toHaveLength(1)
    expect(eventos.filter((e) => e.tipo === 'servico_contratado')).toHaveLength(1)
  })
})

describe('reserva vencida ou alheia', () => {
  it('reserva expirada não vira contratação', async () => {
    const antes = await totalDe(atendimentos)
    const reserva = await reservaDeA(horariosA[0])

    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() - 1_000) })
      .where(eq(consultoriaReservas.id, reserva.id))

    const resultado = await pagar(contas.clienteA, reserva.id)
    expect(resultado.situacao).toBe('reserva_expirada')
    if (resultado.situacao === 'confirmado') return
    expect(resultado.mensagem).toBe(MENSAGEM_RESERVA_EXPIRADA)
    expect(await totalDe(atendimentos)).toBe(antes)
  })

  it('reserva válida no limite ainda confirma', async () => {
    const reserva = await reservaDeA(horariosA[0])
    // Um segundo de vida: entrou válido, termina.
    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() + 30_000) })
      .where(eq(consultoriaReservas.id, reserva.id))

    const resultado = await pagar(contas.clienteA, reserva.id)
    expect(resultado.situacao).toBe('confirmado')
  })

  it('outro Cliente não paga com o id da reserva alheia', async () => {
    const reserva = await reservaDeA(horariosA[0], 'Assunto privado do Cliente A.')
    const resultado = await pagar(contas.clienteB, reserva.id)

    // A recusa é a mesma de uma reserva inexistente: B não descobre nem que ela
    // existe, nem de quem é, nem o que estava escrito.
    expect(resultado.situacao).toBe('reserva_expirada')
    expect(JSON.stringify(resultado)).not.toContain('Assunto privado')
    expect(JSON.stringify(resultado)).not.toContain(contas.clienteA.id)

    const [aindaAtiva] = await db
      .select({ status: consultoriaReservas.status })
      .from(consultoriaReservas)
      .where(eq(consultoriaReservas.id, reserva.id))
    expect(aindaAtiva.status).toBe('ativa')
  })

  it('id inventado não confirma nada', async () => {
    const antes = await totalDe(atendimentos)
    const resultado = await pagar(
      contas.clienteA,
      // UUID bem formado (versão 4, variante 8) e inexistente: a recusa precisa
      // vir da posse, e não da validação de formato.
      '11111111-1111-4111-8111-111111111111',
    )
    expect(resultado.situacao).toBe('reserva_expirada')
    expect(await totalDe(atendimentos)).toBe(antes)
  })

  it('visitante sem sessão não paga', async () => {
    const reserva = await reservaDeA(horariosA[0])
    sairDaSessao()
    const resultado = await pagarConsultoriaSimulado({ reservaId: reserva.id })
    expect(resultado.situacao).toBe('precisa_entrar')
  })
})

describe('o horário fica ocupado para sempre', () => {
  it('some da agenda mesmo depois de a reserva de origem vencer', async () => {
    const reserva = await reservaDeA(horariosA[0])
    const confirmado = await pagar(contas.clienteA, reserva.id)
    expect(confirmado.situacao).toBe('confirmado')

    // O prazo da reserva vence — e não devolve nada, porque agora quem bloqueia
    // é a consultoria contratada.
    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() - 1_000) })
      .where(eq(consultoriaReservas.id, reserva.id))

    const agenda = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(agenda.horarios.map((h) => h.inicio)).not.toContain(horariosA[0])

    // Nem para o próprio dono, que já tem o compromisso.
    const paraODono = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      ignorarClienteId: contas.clienteA.id,
    })
    expect(paraODono.horarios.map((h) => h.inicio)).not.toContain(horariosA[0])
  })

  it('outro Cliente não consegue reservar horário já contratado', async () => {
    const reserva = await reservaDeA(horariosA[0])
    await pagar(contas.clienteA, reserva.id)
    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() - 1_000) })
      .where(eq(consultoriaReservas.id, reserva.id))

    const tentativa = await reservar(
      contas.clienteB,
      contas.profissional,
      horariosA[0],
      'Quero este horário.',
    )
    expect(tentativa.situacao).toBe('horario_indisponivel')
  })
})

describe('o fluxo antigo continua intacto', () => {
  it('a consultoria não cria oportunidade nem pagamento de oportunidade', async () => {
    const antes = await totalDe(oportunidadePagamentos)
    const reserva = await reservaDeA(horariosA[0])
    await pagar(contas.clienteA, reserva.id)
    expect(await totalDe(oportunidadePagamentos)).toBe(antes)

    const [agendamento] = await db
      .select()
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.reservaId, reserva.id))
    // Nenhuma coluna aqui aponta para oportunidade ou proposta.
    expect(Object.keys(agendamento)).not.toContain('oportunidadeId')
    expect(Object.keys(agendamento)).not.toContain('propostaId')
  })
})
