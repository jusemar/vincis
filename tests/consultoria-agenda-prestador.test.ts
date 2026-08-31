import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaDisponibilidades,
  consultoriaExcecoes,
  eventosAuditoria,
} from '@/db/schema'
import {
  criarBloqueioDeAgenda,
  listarBloqueiosDaAgenda,
  removerBloqueioDeAgenda,
  salvarDisponibilidadeDaAgenda,
} from '@/features/consultorias/actions/agenda-do-prestador'
import {
  criarExcecao,
  obterMinhaConsultoria,
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import {
  datasDoIntervalo,
  encontrarConflitosDeAgenda,
} from '@/features/consultorias/lib/conflitos-de-agenda'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import {
  listarDiasDisponiveis,
  listarHorariosDoDia,
} from '@/features/consultorias/queries/agenda-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * A agenda vista de dentro — e o que o público passa a enxergar por causa dela.
 *
 * ## O que precisa ser provado
 *
 * Que cada controle do Profissional (preço, duração, faixas, bloqueios,
 * exceções, antecedência, horizonte) chega **à mesma engine** que desenha o
 * calendário público — e não a uma segunda cópia da regra. Por isso quase todo
 * caso aqui termina consultando `listarHorariosDoDia`/`listarDiasDisponiveis`:
 * é a prova de que a configuração não ficou só bonita na tela de administração.
 *
 * E que mudar a agenda nunca desmarca ninguém: o conflito é **informado**, as
 * consultas continuam de pé, e o snapshot das já contratadas não se mexe.
 */

const SUFIXO = '@agenda-prestador.teste'
const FUSO = 'America/Sao_Paulo'

type Chave = 'anaPro' | 'brunoPro' | 'clienteA'
const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  anaPro: { perfil: 'profissional', prestador: 'profissional' },
  brunoPro: { perfil: 'profissional', prestador: 'profissional' },
  clienteA: { perfil: 'cliente' },
}

const BASE = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo sobre impostos.',
  valorCentavos: 18_000,
  duracaoMinutos: 60,
  intervaloMinutos: 0,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
/** Uma data futura fixa, longe o bastante da antecedência mínima. */
let dataAlvo: string
let diaDaSemanaAlvo: number
/**
 * Datas dedicadas para os testes que **contratam** de verdade.
 *
 * Uma consulta confirmada ocupa o horário para sempre — se todos usassem a
 * mesma data, o primeiro teste a contratar tiraria as 09:00 de todos os
 * seguintes, e as falhas apareceriam longe da causa. Todas caem no mesmo dia da
 * semana (múltiplos de 7), então a mesma faixa recorrente vale para todas.
 */
let dataDoPreco: string
let dataDoConflito: string
let dataDaCorrida: string

/** Reconfigura a consultoria da Ana do zero — cada teste parte do mesmo lugar. */
async function reconfigurar(
  conta: ContaDeTeste,
  ajustes: Partial<typeof BASE> = {},
  faixas?: { diaSemana: number; horaInicio: string; horaFim: string }[],
) {
  await comSessao(conta.token, async () => {
    const salva = await salvarConsultoria({ ...BASE, ...ajustes })
    if (!salva.sucesso) throw new Error(salva.mensagem)
    const r = await salvarDisponibilidades(
      faixas ?? [{ diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' }],
    )
    if (!r.sucesso) throw new Error(r.mensagem)
  })
}

async function limparExcecoes(conta: ContaDeTeste) {
  const [cfg] = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, conta.id))
    .limit(1)
  if (cfg) {
    await db
      .delete(consultoriaExcecoes)
      .where(eq(consultoriaExcecoes.configuracaoId, cfg.id))
  }
}

const horariosDe = async (conta: ContaDeTeste, data = dataAlvo) =>
  (await listarHorariosDoDia({ prestadorId: conta.id, data })).horarios.map(
    (h) => h.inicio,
  )

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119473')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 14)
  diaDaSemanaAlvo = diaDaSemanaDeDataLocal(dataAlvo)
  dataDoPreco = somarDiasEmDataLocal(dataAlvo, 7)
  dataDoConflito = somarDiasEmDataLocal(dataAlvo, 14)
  dataDaCorrida = somarDiasEmDataLocal(dataAlvo, 21)
  await reconfigurar(contas.anaPro)
  await reconfigurar(contas.brunoPro)
}, 240_000)

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('preço e duração', () => {
  it('o preço novo vale para novas consultas — e não reescreve as antigas', async () => {
    await reconfigurar(contas.anaPro, { valorCentavos: 18_000 })
    const horarios = await horariosDe(contas.anaPro, dataDoPreco)

    // Contrata pelo preço antigo.
    const reserva = await comSessao(contas.clienteA.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: contas.anaPro.id,
        data: dataDoPreco,
        inicio: horarios[0],
        descricao: 'Contratada pelo preço antigo.',
      }),
    )
    if (reserva.situacao !== 'reservado') throw new Error(reserva.situacao)
    const pago = await comSessao(contas.clienteA.token, () =>
      pagarConsultoriaSimulado({ reservaId: reserva.reserva.id }),
    )
    expect(pago.situacao).toBe('confirmado')

    // O Profissional reajusta.
    await comSessao(contas.anaPro.token, () =>
      salvarConsultoria({ ...BASE, valorCentavos: 25_000 }),
    )

    /**
     * O contrato assinado não muda de preço porque a tabela mudou. É o snapshot
     * do agendamento que vale — e é isso que impede um reajuste de reescrever
     * o que alguém já pagou.
     */
    const [agendamento] = await db
      .select({ valorCentavos: consultoriaAgendamentos.valorCentavos })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.reservaId, reserva.reserva.id))
      .limit(1)
    expect(agendamento.valorCentavos).toBe(18_000)

    // Mas quem chegar agora vê o preço novo.
    const publica = await listarHorariosDoDia({
      prestadorId: contas.anaPro.id,
      data: dataDoPreco,
    })
    expect(publica.consultoria?.valorCentavos).toBe(25_000)
  })

  it('a duração muda quantos horários cabem no dia', async () => {
    await reconfigurar(contas.brunoPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '12:00' },
    ])
    expect(await horariosDe(contas.brunoPro)).toEqual(['09:00', '10:00', '11:00'])

    await reconfigurar(contas.brunoPro, { duracaoMinutos: 30, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '12:00' },
    ])
    expect(await horariosDe(contas.brunoPro)).toHaveLength(6)
  })

  it('preço zero e duração inválida são recusados pelo servidor', async () => {
    const zero = await comSessao(contas.anaPro.token, () =>
      salvarConsultoria({ ...BASE, valorCentavos: 0 }),
    )
    const negativa = await comSessao(contas.anaPro.token, () =>
      salvarConsultoria({ ...BASE, duracaoMinutos: 0 }),
    )
    expect(zero.sucesso).toBe(false)
    expect(negativa.sucesso).toBe(false)
  })
})

describe('ativar e desativar', () => {
  it('desativada some do calendário público sem apagar nada', async () => {
    await reconfigurar(contas.brunoPro, { ativa: true })
    expect((await horariosDe(contas.brunoPro)).length).toBeGreaterThan(0)

    await comSessao(contas.brunoPro.token, () =>
      salvarConsultoria({ ...BASE, ativa: false }),
    )
    const desativada = await listarHorariosDoDia({
      prestadorId: contas.brunoPro.id,
      data: dataAlvo,
    })
    expect(desativada.horarios).toHaveLength(0)

    // A configuração continua lá, com as faixas — só não está à venda.
    const minha = await comSessao(contas.brunoPro.token, () => obterMinhaConsultoria())
    expect(minha.dados?.ativa).toBe(false)
    expect(minha.dados?.faixas.length).toBeGreaterThan(0)

    await reconfigurar(contas.brunoPro, { ativa: true })
    expect((await horariosDe(contas.brunoPro)).length).toBeGreaterThan(0)
  })
})

describe('disponibilidade semanal e intervalos', () => {
  it('duas faixas no mesmo dia criam o intervalo entre elas', async () => {
    await reconfigurar(contas.anaPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '12:00' },
      { diaSemana: diaDaSemanaAlvo, horaInicio: '14:00', horaFim: '17:00' },
    ])
    const horarios = await horariosDe(contas.anaPro)
    expect(horarios).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'])
    // O almoço não vira horário: nada entre 12:00 e 14:00.
    expect(horarios).not.toContain('12:00')
    expect(horarios).not.toContain('13:00')
  })

  it('dia sem faixa não aparece na agenda', async () => {
    const outroDia = somarDiasEmDataLocal(dataAlvo, 1)
    await reconfigurar(contas.anaPro, {}, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    expect((await horariosDe(contas.anaPro, outroDia))).toHaveLength(0)
  })

  it('salvar substitui a semana inteira, e registra auditoria', async () => {
    const antes = await db
      .select({ id: eventosAuditoria.id })
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, 'agenda_consultoria_alterada'))

    const r = await comSessao(contas.anaPro.token, () =>
      salvarDisponibilidadeDaAgenda({
        faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '08:00', horaFim: '10:00' }],
      }),
    )
    expect(r.sucesso).toBe(true)
    expect(await horariosDe(contas.anaPro)).toEqual(['08:00', '09:00'])

    const depois = await db
      .select({ id: eventosAuditoria.id })
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, 'agenda_consultoria_alterada'))
    expect(depois.length).toBe(antes.length + 1)
  })
})

describe('bloqueios de vários dias', () => {
  it('bloqueia o período inteiro e depois desfaz de uma vez', async () => {
    await limparExcecoes(contas.anaPro)
    await reconfigurar(contas.anaPro)
    const fim = somarDiasEmDataLocal(dataAlvo, 2)

    const criado = await comSessao(contas.anaPro.token, () =>
      criarBloqueioDeAgenda({ dataInicio: dataAlvo, dataFim: fim, motivo: 'Férias' }),
    )
    expect(criado.sucesso).toBe(true)

    // Os três dias somem do calendário público.
    for (const dia of datasDoIntervalo(dataAlvo, fim)) {
      expect(await horariosDe(contas.anaPro, dia)).toHaveLength(0)
    }

    // A tela lista **um** bloqueio, não três exceções soltas.
    const lista = await comSessao(contas.anaPro.token, () => listarBloqueiosDaAgenda())
    expect(lista.dados).toHaveLength(1)
    expect(lista.dados[0]).toMatchObject({
      dataInicio: dataAlvo,
      dataFim: fim,
      dias: 3,
      motivo: 'Férias',
    })

    const removido = await comSessao(contas.anaPro.token, () =>
      removerBloqueioDeAgenda(lista.dados[0].grupoId),
    )
    expect(removido.sucesso).toBe(true)
    expect((await horariosDe(contas.anaPro)).length).toBeGreaterThan(0)
  })

  it('data final anterior à inicial é recusada', async () => {
    const r = await comSessao(contas.anaPro.token, () =>
      criarBloqueioDeAgenda({
        dataInicio: somarDiasEmDataLocal(dataAlvo, 3),
        dataFim: dataAlvo,
      }),
    )
    expect(r.sucesso).toBe(false)
  })

  it('o bloqueio de um Profissional não é removível por outro', async () => {
    await limparExcecoes(contas.anaPro)
    await comSessao(contas.anaPro.token, () =>
      criarBloqueioDeAgenda({ dataInicio: dataAlvo, dataFim: dataAlvo }),
    )
    const lista = await comSessao(contas.anaPro.token, () => listarBloqueiosDaAgenda())
    const grupoDaAna = lista.dados[0].grupoId

    // Bruno conhece o id do grupo e tenta removê-lo.
    const tentativa = await comSessao(contas.brunoPro.token, () =>
      removerBloqueioDeAgenda(grupoDaAna),
    )
    expect(tentativa.sucesso).toBe(false)

    // Continua bloqueado para a Ana.
    expect(await horariosDe(contas.anaPro)).toHaveLength(0)
    await limparExcecoes(contas.anaPro)
  })
})

describe('exceções pontuais', () => {
  it('fecham um dia que normalmente abriria', async () => {
    await limparExcecoes(contas.anaPro)
    await reconfigurar(contas.anaPro)
    expect((await horariosDe(contas.anaPro)).length).toBeGreaterThan(0)

    await comSessao(contas.anaPro.token, () =>
      criarExcecao({ data: dataAlvo, tipo: 'indisponivel_dia', motivo: 'Congresso' }),
    )
    expect(await horariosDe(contas.anaPro)).toHaveLength(0)
    await limparExcecoes(contas.anaPro)
  })

  /** A exceção manda: abre um dia que a recorrência semanal não cobre. */
  it('abrem um dia que a semana não cobre', async () => {
    await limparExcecoes(contas.anaPro)
    const outroDia = somarDiasEmDataLocal(dataAlvo, 1)
    await reconfigurar(contas.anaPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    expect(await horariosDe(contas.anaPro, outroDia)).toHaveLength(0)

    await comSessao(contas.anaPro.token, () =>
      criarExcecao({
        data: outroDia,
        tipo: 'disponivel_extra',
        horaInicio: '10:00',
        horaFim: '12:00',
      }),
    )
    expect(await horariosDe(contas.anaPro, outroDia)).toEqual(['10:00', '11:00'])
    await limparExcecoes(contas.anaPro)
  })

  it('bloqueiam só um pedaço do dia', async () => {
    await limparExcecoes(contas.anaPro)
    await reconfigurar(contas.anaPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '13:00' },
    ])
    await comSessao(contas.anaPro.token, () =>
      criarExcecao({
        data: dataAlvo,
        tipo: 'bloqueio_parcial',
        horaInicio: '10:00',
        horaFim: '12:00',
      }),
    )
    const horarios = await horariosDe(contas.anaPro)
    expect(horarios).toContain('09:00')
    expect(horarios).toContain('12:00')
    expect(horarios).not.toContain('10:00')
    expect(horarios).not.toContain('11:00')
    await limparExcecoes(contas.anaPro)
  })
})

describe('antecedência mínima e horizonte', () => {
  it('a antecedência corta os horários próximos demais', async () => {
    /*
      O dia observado é **amanhã**, e a escolha é o que torna este caso
      determinístico a qualquer hora do relógio.

      Antes ele olhava para hoje. Com uma faixa de 00:00 às 23:30 e duas horas
      de antecedência, um dia que já está acabando não tem horário nenhum
      sobrando — rodando às 21h40, os dois lados da comparação davam zero e o
      teste falhava sozinho, sem nada ter mudado no produto.

      Amanhã não tem essa borda, e a aritmética garante os dois extremos em
      qualquer horário: o último horário de amanhã (23:00) está entre 23h e 47h
      de distância, então duas horas de antecedência **sempre** deixam parte do
      dia de pé e quarenta e oito horas **sempre** esvaziam o dia inteiro. É a
      mesma regra de produto sendo provada; o que saiu foi a dependência do
      relógio.
    */
    const amanha = somarDiasEmDataLocal(
      dataLocalDoInstante(new Date(), FUSO),
      1,
    )
    const faixaDoDiaInteiro = [
      { diaSemana: diaDaSemanaDeDataLocal(amanha), horaInicio: '00:00', horaFim: '23:30' },
    ]

    await reconfigurar(
      contas.brunoPro,
      { antecedenciaMinimaMinutos: 120, duracaoMinutos: 30, intervaloMinutos: 0 },
      faixaDoDiaInteiro,
    )
    const comDuasHoras = await horariosDe(contas.brunoPro, amanha)

    await reconfigurar(
      contas.brunoPro,
      { antecedenciaMinimaMinutos: 2880, duracaoMinutos: 30, intervaloMinutos: 0 },
      faixaDoDiaInteiro,
    )
    const comDoisDias = await horariosDe(contas.brunoPro, amanha)

    // Duas horas de antecedência deixam o dia utilizável…
    expect(comDuasHoras.length).toBeGreaterThan(0)
    // …e exigir 48h esvazia amanhã por inteiro.
    expect(comDoisDias.length).toBeLessThan(comDuasHoras.length)
    expect(comDoisDias).toHaveLength(0)
  })

  it('o horizonte fecha a agenda além do prazo configurado', async () => {
    await reconfigurar(contas.brunoPro, { horizonteDias: 7 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    // `dataAlvo` está a 14 dias — além do horizonte de 7.
    expect(await horariosDe(contas.brunoPro)).toHaveLength(0)

    await reconfigurar(contas.brunoPro, { horizonteDias: 60 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    expect((await horariosDe(contas.brunoPro)).length).toBeGreaterThan(0)
  })

  it('horizonte infinito é recusado', async () => {
    const r = await comSessao(contas.brunoPro.token, () =>
      salvarConsultoria({ ...BASE, horizonteDias: 100_000 }),
    )
    expect(r.sucesso).toBe(false)
  })
})

describe('conflito com consulta já marcada', () => {
  /**
   * O caso central da etapa: a agenda encolhe por baixo de uma consulta
   * vendida. Nada pode ser apagado, e o Profissional precisa **ver** o que
   * ficou de fora antes de confirmar.
   */
  it('avisa em vez de apagar, e só grava quando confirmado', async () => {
    await limparExcecoes(contas.anaPro)
    await reconfigurar(contas.anaPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    const horarios = await horariosDe(contas.anaPro, dataDoConflito)
    const tarde = horarios.find((h) => h >= '15:00')!

    const reserva = await comSessao(contas.clienteA.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: contas.anaPro.id,
        data: dataDoConflito,
        inicio: tarde,
        descricao: 'Consulta da tarde.',
      }),
    )
    if (reserva.situacao !== 'reservado') throw new Error(reserva.situacao)
    const pago = await comSessao(contas.clienteA.token, () =>
      pagarConsultoriaSimulado({ reservaId: reserva.reserva.id }),
    )
    expect(pago.situacao).toBe('confirmado')

    // O Profissional tenta encolher para a manhã.
    const tentativa = await comSessao(contas.anaPro.token, () =>
      salvarDisponibilidadeDaAgenda({
        faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '12:00' }],
      }),
    )
    expect(tentativa.sucesso).toBe(false)
    if (tentativa.sucesso || !('conflitos' in tentativa)) {
      throw new Error('esperado conflito')
    }
    expect(tentativa.conflitos).toHaveLength(1)
    expect(tentativa.conflitos[0].inicio).toBe(tarde)
    expect(tentativa.conflitos[0].motivo).toBe('fora_das_faixas')

    // Nada foi gravado: a tarde continua na agenda.
    const [cfg] = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.anaPro.id))
      .limit(1)
    const faixasAtuais = await db
      .select({ horaFim: consultoriaDisponibilidades.horaFim })
      .from(consultoriaDisponibilidades)
      .where(eq(consultoriaDisponibilidades.configuracaoId, cfg.id))
    expect(faixasAtuais[0].horaFim.slice(0, 5)).toBe('17:00')

    // Confirmando, a faixa muda — e a consulta vendida continua existindo.
    const confirmada = await comSessao(contas.anaPro.token, () =>
      salvarDisponibilidadeDaAgenda({
        faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '12:00' }],
        confirmarConflitos: true,
      }),
    )
    expect(confirmada.sucesso).toBe(true)

    const [aindaExiste] = await db
      .select({ status: consultoriaAgendamentos.status })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.reservaId, reserva.reserva.id))
      .limit(1)
    expect(aindaExiste.status).toBe('agendada')
  })

  it('o bloqueio também avisa antes de cobrir uma consulta marcada', async () => {
    const bloqueio = await comSessao(contas.anaPro.token, () =>
      criarBloqueioDeAgenda({
        dataInicio: dataDoConflito,
        dataFim: dataDoConflito,
        motivo: 'Viagem',
      }),
    )
    expect(bloqueio.sucesso).toBe(false)
    if (bloqueio.sucesso || !('conflitos' in bloqueio)) throw new Error('esperado conflito')
    expect(bloqueio.conflitos[0].motivo).toBe('dia_bloqueado')

    // Nenhuma exceção foi criada.
    const [cfg] = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.anaPro.id))
      .limit(1)
    const excecoes = await db
      .select({ id: consultoriaExcecoes.id })
      .from(consultoriaExcecoes)
      .where(
        and(
          eq(consultoriaExcecoes.configuracaoId, cfg.id),
          eq(consultoriaExcecoes.data, dataDoConflito),
        ),
      )
    expect(excecoes).toHaveLength(0)
  })
})

describe('isolamento entre profissionais', () => {
  it('salvar a agenda mexe só na consultoria de quem está logado', async () => {
    await reconfigurar(contas.anaPro, {}, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '10:00' },
    ])
    await reconfigurar(contas.brunoPro, {}, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '14:00', horaFim: '18:00' },
    ])

    await comSessao(contas.anaPro.token, () =>
      salvarDisponibilidadeDaAgenda({
        faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '07:00', horaFim: '08:00' }],
        confirmarConflitos: true,
      }),
    )

    // A do Bruno não se mexeu.
    const doBruno = await comSessao(contas.brunoPro.token, () => obterMinhaConsultoria())
    expect(doBruno.dados?.faixas.map((f) => f.horaInicio.slice(0, 5))).toEqual(['14:00'])
  })

  it('sem sessão de profissional, nada é alterado', async () => {
    sairDaSessao()
    const salvar = await salvarDisponibilidadeDaAgenda({ faixas: [] })
    const bloquear = await criarBloqueioDeAgenda({
      dataInicio: dataAlvo,
      dataFim: dataAlvo,
    })
    expect(salvar.sucesso).toBe(false)
    expect(bloquear.sucesso).toBe(false)

    // Um Cliente logado também não é Profissional.
    const comoCliente = await comSessao(contas.clienteA.token, () =>
      salvarDisponibilidadeDaAgenda({ faixas: [] }),
    )
    expect(comoCliente.sucesso).toBe(false)
  })
})

describe('concorrência', () => {
  /**
   * Duas edições simultâneas da mesma semana. A trava na configuração serializa
   * as duas: uma vence e a outra escreve por cima — o que não pode acontecer é
   * a semana ficar meio antiga e meio nova.
   */
  it('duas alterações simultâneas não se intercalam', async () => {
    await reconfigurar(contas.brunoPro, {}, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])

    const [a, b] = await Promise.all([
      comSessao(contas.brunoPro.token, () =>
        salvarDisponibilidadeDaAgenda({
          faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '08:00', horaFim: '09:00' }],
          confirmarConflitos: true,
        }),
      ),
      comSessao(contas.brunoPro.token, () =>
        salvarDisponibilidadeDaAgenda({
          faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '18:00', horaFim: '19:00' }],
          confirmarConflitos: true,
        }),
      ),
    ])
    expect(a.sucesso && b.sucesso).toBe(true)

    // Exatamente uma das duas semanas venceu — nunca as duas misturadas.
    const minha = await comSessao(contas.brunoPro.token, () => obterMinhaConsultoria())
    const faixas = minha.dados!.faixas.map((f) => f.horaInicio.slice(0, 5))
    expect(faixas).toHaveLength(1)
    expect(['08:00', '18:00']).toContain(faixas[0])
  })

  it('reservar durante uma alteração não produz horário fantasma', async () => {
    await reconfigurar(contas.brunoPro, { duracaoMinutos: 60, intervaloMinutos: 0 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])

    const [reserva] = await Promise.all([
      comSessao(contas.clienteA.token, () =>
        reservarHorarioDaConsultoria({
          prestadorId: contas.brunoPro.id,
          data: dataDaCorrida,
          inicio: '10:00',
          descricao: 'Correndo contra a mudança de agenda.',
        }),
      ),
      comSessao(contas.brunoPro.token, () =>
        salvarDisponibilidadeDaAgenda({
          faixas: [{ diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '10:00' }],
          confirmarConflitos: true,
        }),
      ),
    ])

    /**
     * Os dois desfechos são corretos e nenhum é corrupção: ou a reserva chegou
     * antes e existe, ou a agenda encolheu antes e o horário foi recusado. O
     * que se prova aqui é que não há um terceiro estado.
     */
    expect(['reservado', 'horario_indisponivel', 'dados_invalidos']).toContain(
      reserva.situacao,
    )
  })
})

describe('a engine pública é a mesma', () => {
  it('o calendário do mês reflete a configuração recém-salva', async () => {
    await limparExcecoes(contas.anaPro)
    await reconfigurar(contas.anaPro, { horizonteDias: 60 }, [
      { diaSemana: diaDaSemanaAlvo, horaInicio: '09:00', horaFim: '17:00' },
    ])
    const dias = await listarDiasDisponiveis({
      prestadorId: contas.anaPro.id,
      de: dataAlvo,
      ate: somarDiasEmDataLocal(dataAlvo, 6),
    })
    const comSlots = dias.dias.filter((d) => d.totalSlots > 0).map((d) => d.data)
    // Só o dia da semana configurado abre — a engine não inventa outros.
    expect(comSlots).toContain(dataAlvo)
    for (const dia of comSlots) {
      expect(diaDaSemanaDeDataLocal(dia)).toBe(diaDaSemanaAlvo)
    }
  })
})

describe('detecção de conflito, isolada', () => {
  const faixas = [{ diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' }]

  it('a consulta precisa caber inteira na faixa', () => {
    // Segunda-feira, 2026-09-07.
    const dentro = {
      id: 'a',
      inicioEm: new Date('2026-09-07T13:00:00.000Z'), // 10:00 em SP
      fimEm: new Date('2026-09-07T14:00:00.000Z'), // 11:00
    }
    const transbordando = {
      id: 'b',
      inicioEm: new Date('2026-09-07T14:30:00.000Z'), // 11:30
      fimEm: new Date('2026-09-07T15:30:00.000Z'), // 12:30 — passa do fim
    }
    const conflitos = encontrarConflitosDeAgenda({
      consultas: [dentro, transbordando],
      faixas,
      timezone: FUSO,
    })
    expect(conflitos.map((c) => c.consultaId)).toEqual(['b'])
  })

  it('o dia bloqueado vence a faixa', () => {
    const conflitos = encontrarConflitosDeAgenda({
      consultas: [
        {
          id: 'a',
          inicioEm: new Date('2026-09-07T13:00:00.000Z'),
          fimEm: new Date('2026-09-07T14:00:00.000Z'),
        },
      ],
      faixas,
      diasBloqueados: [{ data: '2026-09-07' }],
      timezone: FUSO,
    })
    expect(conflitos[0].motivo).toBe('dia_bloqueado')
  })

  it('o intervalo inclui as duas pontas', () => {
    expect(datasDoIntervalo('2026-09-10', '2026-09-12')).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ])
    expect(datasDoIntervalo('2026-09-10', '2026-09-10')).toEqual(['2026-09-10'])
    // Vira o mês sem tropeçar.
    expect(datasDoIntervalo('2026-09-29', '2026-10-02')).toHaveLength(4)
  })
})
