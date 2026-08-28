import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaConfiguracoes } from '@/db/schema'
import {
  buscarAgendaDoMes,
  buscarHorariosDaData,
} from '@/features/consultorias/actions/agenda'
import {
  criarExcecao,
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import {
  type EstadoDoCard,
  estadoInicial,
  horarioEscolhido,
  mesNavegavel,
  podeAgendar,
  podeNavegar,
  selecionarDia,
  selecionarHorario,
  trocarMes,
} from '@/features/consultorias/lib/estado-do-card'
import {
  compararMeses,
  diasNoMes,
  mesDaData,
  mesDoInstante,
  montarGradeDoMes,
  rotuloDoMes,
  somarMeses,
} from '@/features/consultorias/lib/mes'
import type { HorarioDisponivelDTO } from '@/features/consultorias/types/consultoria'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O calendário público ligado aos dados reais.
 *
 * Duas metades: a grade do mês e as transições de seleção, que são puras e
 * saem do componente de propósito; e as Server Actions que o card chama,
 * exercidas contra o banco. O que não dá para testar aqui é pintura de pixel —
 * e é justamente o que não mudou.
 */

const SUFIXO = '@consultoria-calendario.teste'

type Chave = 'ana' | 'bruno' | 'marina'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  ana: { perfil: 'profissional', prestador: 'profissional' },
  // Sem consultoria nenhuma: o card dele precisa mostrar ausência.
  bruno: { perfil: 'profissional', prestador: 'profissional' },
  marina: { perfil: 'cliente' },
}

const CONFIGURACAO = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
  valorCentavos: 18_000,
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: 'America/Sao_Paulo',
}

/** Segundas e quintas de manhã; segunda também à tarde. */
const FAIXAS = [
  { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
  { diaSemana: 1, horaInicio: '14:00', horaFim: '18:00' },
  { diaSemana: 4, horaInicio: '09:00', horaFim: '12:00' },
]

let contas: Record<Chave, ContaDeTeste>

/**
 * As Server Actions não recebem `agora` de propósito — o relógio é do servidor,
 * e deixá-lo entrar pela requisição daria ao navegador o poder de "ver" a
 * agenda de outro dia. Então os cenários que passam pelo banco derivam o mês do
 * relógio real, em vez de fixar agosto de 2026: um teste de agenda que passa
 * neste mês e quebra no que vem não prova nada.
 */
const FUSO = CONFIGURACAO.timezone
function mesCorrente() {
  return mesDoInstante(new Date(), FUSO)
}

/** Primeira data daquele dia da semana a partir de `de`, inclusive. */
function proximoDiaDaSemana(de: string, diaSemana: number) {
  const [ano, mes, dia] = de.split('-').map(Number)
  const cursor = new Date(Date.UTC(ano, mes - 1, dia))
  while (cursor.getUTCDay() !== diaSemana) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return cursor.toISOString().slice(0, 10)
}

function horario(inicio: string, fim: string): HorarioDisponivelDTO {
  return {
    inicio,
    fim,
    inicioEm: new Date('2026-08-27T12:00:00Z'),
    fimEm: new Date('2026-08-27T13:00:00Z'),
  }
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119462')
  entrarComo(contas.ana.token)
  const salva = await salvarConsultoria(CONFIGURACAO)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades(FAIXAS)
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()
}, 120_000)

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('grade do mês', () => {
  it('calcula células vazias, total de dias e rótulo em pt-BR', () => {
    // Agosto de 2026 começa num sábado: seis células vazias antes do dia 1.
    const agosto = montarGradeDoMes({ ano: 2026, mes: 8 })
    expect(agosto.vazias).toBe(6)
    expect(agosto.dias).toHaveLength(31)
    expect(agosto.primeiroDia).toBe('2026-08-01')
    expect(agosto.ultimoDia).toBe('2026-08-31')
    expect(agosto.rotulo).toBe('Agosto 2026')

    // Setembro começa numa terça: duas vazias.
    expect(montarGradeDoMes({ ano: 2026, mes: 9 }).vazias).toBe(2)
    expect(rotuloDoMes({ ano: 2026, mes: 12 })).toBe('Dezembro 2026')
  })

  it('acerta fevereiro em ano comum e bissexto', () => {
    expect(diasNoMes(2026, 2)).toBe(28)
    expect(diasNoMes(2028, 2)).toBe(29)
    expect(montarGradeDoMes({ ano: 2028, mes: 2 }).dias).toHaveLength(29)
  })

  it('vira o ano ao navegar', () => {
    expect(somarMeses({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 })
    expect(somarMeses({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 })
    expect(compararMeses({ ano: 2026, mes: 9 }, { ano: 2026, mes: 8 })).toBeGreaterThan(0)
  })

  it('o mês corrente é o da agenda, não o do relógio de quem olha', () => {
    // 01/09 às 01:00 UTC ainda é 31/08 em São Paulo: o calendário precisa abrir
    // em agosto para aquele Profissional.
    const instante = new Date('2026-09-01T01:00:00Z')
    expect(mesDoInstante(instante, 'America/Sao_Paulo')).toEqual({ ano: 2026, mes: 8 })
    expect(mesDoInstante(instante, 'UTC')).toEqual({ ano: 2026, mes: 9 })
  })
})

describe('limites de navegação', () => {
  const limites = {
    minimo: mesDaData('2026-08-24'),
    maximo: mesDaData('2026-10-23'),
  }

  it('não volta antes do mês corrente nem passa do horizonte', () => {
    expect(podeNavegar({ ano: 2026, mes: 8 }, -1, limites)).toBe(false)
    expect(podeNavegar({ ano: 2026, mes: 8 }, 1, limites)).toBe(true)
    expect(podeNavegar({ ano: 2026, mes: 10 }, 1, limites)).toBe(false)
    expect(podeNavegar({ ano: 2026, mes: 10 }, -1, limites)).toBe(true)
    expect(mesNavegavel({ ano: 2026, mes: 8 }, -1, limites)).toBeNull()
    expect(mesNavegavel({ ano: 2026, mes: 8 }, 1, limites)).toEqual({
      ano: 2026,
      mes: 9,
    })
  })
})

describe('seleção de dia, horário e botão', () => {
  const inicio: EstadoDoCard = estadoInicial({ ano: 2026, mes: 8 })
  const lista = [horario('09:00', '10:00'), horario('10:15', '11:15')]

  it('dia indisponível não pode ser escolhido', () => {
    expect(selecionarDia(inicio, '2026-08-25', false)).toEqual(inicio)
  })

  it('escolher dia e horário habilita o botão', () => {
    expect(podeAgendar(inicio, lista)).toBe(false)

    const comDia = selecionarDia(inicio, '2026-08-27', true)
    expect(comDia.data).toBe('2026-08-27')
    // Data sem horário ainda não habilita.
    expect(podeAgendar(comDia, lista)).toBe(false)

    const comHorario = selecionarHorario(comDia, '10:15')
    expect(podeAgendar(comHorario, lista)).toBe(true)
    expect(horarioEscolhido(comHorario, lista)?.fim).toBe('11:15')
  })

  it('trocar de dia limpa o horário anterior', () => {
    const escolhido = selecionarHorario(
      selecionarDia(inicio, '2026-08-27', true),
      '10:15',
    )
    const outroDia = selecionarDia(escolhido, '2026-08-24', true)
    expect(outroDia.data).toBe('2026-08-24')
    expect(outroDia.horario).toBeNull()
    expect(podeAgendar(outroDia, lista)).toBe(false)
  })

  it('trocar de mês limpa dia e horário', () => {
    const escolhido = selecionarHorario(
      selecionarDia(inicio, '2026-08-27', true),
      '10:15',
    )
    const setembro = trocarMes(escolhido, { ano: 2026, mes: 9 })
    expect(setembro).toEqual(estadoInicial({ ano: 2026, mes: 9 }))
    expect(podeAgendar(setembro, lista)).toBe(false)
  })

  it('horário que saiu da lista do servidor não habilita o botão', () => {
    const escolhido = selecionarHorario(
      selecionarDia(inicio, '2026-08-27', true),
      '10:15',
    )
    // O servidor devolveu outra lista — o botão precisa desabilitar sozinho.
    expect(podeAgendar(escolhido, [horario('09:00', '10:00')])).toBe(false)
  })

  it('escolher horário sem dia não faz nada', () => {
    expect(selecionarHorario(inicio, '09:00')).toEqual(inicio)
  })
})

describe('agenda do mês pela Server Action', () => {
  it('devolve consultoria real, preço, duração e dias disponíveis', async () => {
    const atual = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    expect(atual.consultoria?.valorCentavos).toBe(18_000)
    expect(atual.consultoria?.duracaoMinutos).toBe(60)
    expect(atual.consultoria?.timezone).toBe(FUSO)
    expect(atual.hoje).not.toBeNull()
    expect(atual.ultimoDia).not.toBeNull()
    expect(atual.mes).toEqual(mesCorrente())

    // Só segundas e quintas, nada antes de hoje e nada além do horizonte.
    for (const dia of atual.dias) {
      expect([1, 4]).toContain(new Date(`${dia.data}T00:00:00Z`).getUTCDay())
      expect(dia.data >= atual.hoje!).toBe(true)
      expect(dia.data <= atual.ultimoDia!).toBe(true)
      expect(dia.totalSlots).toBeGreaterThan(0)
    }
  })

  it('o mês seguinte também traz dias, e o anterior não existe', async () => {
    const seguinte = somarMeses(mesCorrente(), 1)
    const agenda = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...seguinte,
    })
    expect(agenda.mes).toEqual(seguinte)
    expect(agenda.dias.length).toBeGreaterThan(0)

    const anterior = somarMeses(mesCorrente(), -1)
    const passado = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...anterior,
    })
    expect(passado.dias).toEqual([])
  })

  it('respeita o horizonte: mês muito à frente volta vazio', async () => {
    const distante = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...somarMeses(mesCorrente(), 12),
    })
    expect(distante.consultoria).not.toBeNull()
    expect(distante.dias).toEqual([])
  })

  it('mês muito no passado volta vazio', async () => {
    const passado = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ano: 2020,
      mes: 1,
    })
    expect(passado.dias).toEqual([])
  })

  it('entrada inválida devolve estado vazio, não exceção', async () => {
    const lixo = await buscarAgendaDoMes({ prestadorId: 'nao-e-uuid', ano: 0, mes: 99 })
    expect(lixo.consultoria).toBeNull()
    expect(lixo.dias).toEqual([])
  })

  it('sem consultoria não inventa preço nem disponibilidade', async () => {
    const semAgenda = await buscarAgendaDoMes({
      prestadorId: contas.bruno.id,
      ...mesCorrente(),
    })
    expect(semAgenda.consultoria).toBeNull()
    expect(semAgenda.dias).toEqual([])
    expect(semAgenda.hoje).toBeNull()
    expect(JSON.stringify(semAgenda)).not.toContain('18000')
  })

  it('consultoria desligada some do card', async () => {
    entrarComo(contas.ana.token)
    await salvarConsultoria({ ...CONFIGURACAO, ativa: false })
    sairDaSessao()

    const desligada = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    expect(desligada.consultoria).toBeNull()
    expect(desligada.dias).toEqual([])

    entrarComo(contas.ana.token)
    await salvarConsultoria({ ...CONFIGURACAO, ativa: true })
    sairDaSessao()
    const religada = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    expect(religada.consultoria).not.toBeNull()
  })
})

describe('horários de um dia pela Server Action', () => {
  it('devolve os horários reais do primeiro dia disponível', async () => {
    const agenda = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    const primeiro = agenda.dias[0]
    expect(primeiro).toBeDefined()

    const dia = await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: primeiro.data,
    })
    expect(dia.horarios).toHaveLength(primeiro.totalSlots)
    expect(dia.consultoria?.duracaoMinutos).toBe(60)
    for (const horarioDisponivel of dia.horarios) {
      expect(horarioDisponivel.inicio).toMatch(/^\d{2}:\d{2}$/)
      // O instante precisa cair na mesma data local — o erro clássico de fuso
      // apareceria aqui como o dia anterior ou o seguinte.
      const dataDoInstante = new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO,
      }).format(horarioDisponivel.inicioEm)
      expect(dataDoInstante).toBe(primeiro.data)
    }
  })

  it('dia sem atendimento devolve lista vazia', async () => {
    const agenda = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    // Uma terça dentro do horizonte: não há faixa recorrente nesse dia.
    const terca = proximoDiaDaSemana(agenda.hoje!, 2)
    const dia = await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: terca,
    })
    expect(dia.consultoria).not.toBeNull()
    expect(dia.horarios).toEqual([])
  })

  it('feriado cadastrado esvazia o dia que estava disponível', async () => {
    const proximo = somarMeses(mesCorrente(), 1)
    const antes = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...proximo,
    })
    const alvo = antes.dias.at(-1)
    expect(alvo).toBeDefined()

    entrarComo(contas.ana.token)
    const criada = await criarExcecao({
      data: alvo!.data,
      tipo: 'indisponivel_dia',
      motivo: 'Feriado',
    })
    sairDaSessao()
    expect(criada.sucesso).toBe(true)

    const depois = await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: alvo!.data,
    })
    expect(depois.horarios).toEqual([])
    // E o motivo interno não acompanha a resposta pública.
    expect(JSON.stringify(depois)).not.toContain('Feriado')

    const mesDepois = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...proximo,
    })
    expect(mesDepois.dias.some((dia) => dia.data === alvo!.data)).toBe(false)
  })

  it('data inválida devolve estado vazio', async () => {
    const lixo = await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: '2027-02-31',
    })
    expect(lixo.consultoria).toBeNull()
    expect(lixo.horarios).toEqual([])
  })

  it('escolher horário não cria nada no banco', async () => {
    const antes = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.ana.id))

    const agenda = await buscarAgendaDoMes({
      prestadorId: contas.ana.id,
      ...mesCorrente(),
    })
    const primeiro = agenda.dias[0]
    await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: primeiro.data,
    })

    // As duas ações desta etapa são leitura pura: consultar a agenda duas vezes
    // devolve a mesma coisa e não deixa rastro. Reserva, pagamento e
    // Atendimento são das etapas seguintes.
    const depois = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.ana.id))
    expect(depois).toEqual(antes)

    const repetida = await buscarHorariosDaData({
      prestadorId: contas.ana.id,
      data: primeiro.data,
    })
    expect(repetida.horarios).toHaveLength(primeiro.totalSlots)
  })
})
