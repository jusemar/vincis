import { describe, expect, it } from 'vitest'
import {
  ANTECEDENCIA_PADRAO_MINUTOS,
  DURACAO_MAXIMA_MINUTOS,
  HORIZONTE_MAXIMO_DIAS,
  TIMEZONE_PADRAO,
} from '@/features/consultorias/constants/consultoria'
import {
  type ExcecaoDoDia,
  type FaixaLocal,
  type RegrasDaAgenda,
  calcularSlotsDoDia,
  iniciosNaFaixa,
  janelasDoDia,
  normalizarFaixas,
  subtrairFaixas,
} from '@/features/consultorias/lib/slots'
import {
  dataLocalDoInstante,
  dataLocalValida,
  deslocamentoMinutos,
  diaDaSemanaDeDataLocal,
  horaDeMinutos,
  horaLocalExiste,
  instanteDeLocal,
  minutosDeHora,
  minutosLocaisDoInstante,
  somarDiasEmDataLocal,
  timezoneValido,
} from '@/features/consultorias/lib/tempo'
import { conferirFaixasSemanais } from '@/features/consultorias/lib/validacao-faixas'
import {
  ConsultoriaConfiguracaoSchema,
  ExcecaoSchema,
  FaixasSemanaisSchema,
} from '@/features/consultorias/schemas/consultoria'

/**
 * As regras da agenda, sem banco.
 *
 * Tudo que decide se um horário existe é função pura — e é aqui que isso é
 * provado. O instante "agora" entra por parâmetro em todo cenário: nenhum teste
 * deste arquivo depende do relógio da máquina, do fuso do sistema operacional
 * ou da data em que a suíte roda. Um teste de agenda que passa em agosto e
 * falha em novembro não é um teste.
 */

const SP = TIMEZONE_PADRAO
const NY = 'America/New_York'
/** UTC+14. Qualquer confusão entre data local e data UTC estoura aqui. */
const KIRITIMATI = 'Pacific/Kiritimati'

/** Uma quinta-feira. Longe de qualquer virada de horário de verão no Brasil. */
const QUINTA = '2026-08-27'
const DOMINGO = '2026-08-30'

function regras(parcial: Partial<RegrasDaAgenda> = {}): RegrasDaAgenda {
  return {
    timezone: SP,
    duracaoMinutos: 60,
    intervaloMinutos: 15,
    antecedenciaMinimaMinutos: 0,
    horizonteDias: 60,
    ...parcial,
  }
}

/** Faixa a partir de `HH:MM`, para os cenários se lerem como a tela. */
function faixa(inicio: string, fim: string): FaixaLocal {
  return { inicio: minutosDeHora(inicio), fim: minutosDeHora(fim) }
}

/** Um instante bem antes de qualquer cenário — antecedência nunca interfere. */
const ONTEM = new Date('2026-08-26T12:00:00Z')

function inicios(slots: { inicio: string }[]) {
  return slots.map((slot) => slot.inicio)
}

describe('tempo: data local, hora de parede e instante', () => {
  it('converte hora local em instante usando o fuso, não o do processo', () => {
    // 23:00 em São Paulo é 02:00 UTC do dia seguinte. Um `new Date()` ingênuo
    // devolveria o dia errado — é exatamente o erro que este módulo existe para
    // impedir.
    const instante = instanteDeLocal(QUINTA, 23 * 60, SP)
    expect(instante.toISOString()).toBe('2026-08-28T02:00:00.000Z')
    expect(dataLocalDoInstante(instante, SP)).toBe(QUINTA)
    expect(minutosLocaisDoInstante(instante, SP)).toBe(23 * 60)
  })

  it('não desloca a data em fuso muito à frente de Greenwich', () => {
    const instante = instanteDeLocal(QUINTA, 60, KIRITIMATI)
    // 01:00 do dia 27 em Kiritimati é 11:00 UTC do dia 26.
    expect(instante.toISOString()).toBe('2026-08-26T11:00:00.000Z')
    expect(dataLocalDoInstante(instante, KIRITIMATI)).toBe(QUINTA)
  })

  it('acompanha a mudança de horário de verão do fuso', () => {
    expect(deslocamentoMinutos(new Date('2026-01-15T12:00:00Z'), NY)).toBe(-300)
    expect(deslocamentoMinutos(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-240)
    // A mesma hora de parede, dois instantes diferentes: é o que garante que a
    // consulta das 09:00 continue às 09:00 depois da virada.
    expect(instanteDeLocal('2026-03-07', 540, NY).toISOString()).toBe(
      '2026-03-07T14:00:00.000Z',
    )
    expect(instanteDeLocal('2026-03-08', 540, NY).toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    )
  })

  it('reconhece a hora que não existe na entrada do horário de verão', () => {
    expect(horaLocalExiste('2026-03-08', 150, NY)).toBe(false)
    expect(horaLocalExiste('2026-03-08', 210, NY)).toBe(true)
    expect(horaLocalExiste(QUINTA, 150, SP)).toBe(true)
  })

  it('faz aritmética de calendário sem passar por instante', () => {
    expect(diaDaSemanaDeDataLocal(QUINTA)).toBe(4)
    expect(diaDaSemanaDeDataLocal(DOMINGO)).toBe(0)
    expect(somarDiasEmDataLocal('2026-02-28', 1)).toBe('2026-03-01')
    expect(somarDiasEmDataLocal('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDiasEmDataLocal('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('valida datas, fusos e horas', () => {
    expect(dataLocalValida('2026-08-27')).toBe(true)
    expect(dataLocalValida('2026-02-31')).toBe(false)
    expect(dataLocalValida('27/08/2026')).toBe(false)
    expect(timezoneValido(SP)).toBe(true)
    expect(timezoneValido('Marte/Olympus')).toBe(false)
    expect(timezoneValido('')).toBe(false)
    expect(minutosDeHora('09:00:00')).toBe(540)
    expect(minutosDeHora('14:30')).toBe(870)
    expect(Number.isNaN(minutosDeHora('25:00'))).toBe(true)
    expect(horaDeMinutos(870)).toBe('14:30')
  })
})

describe('faixas: normalização e subtração', () => {
  it('funde faixas sobrepostas e coladas', () => {
    expect(
      normalizarFaixas([faixa('14:00', '18:00'), faixa('09:00', '12:00')]),
    ).toEqual([faixa('09:00', '12:00'), faixa('14:00', '18:00')])
    expect(
      normalizarFaixas([faixa('09:00', '12:00'), faixa('12:00', '14:00')]),
    ).toEqual([faixa('09:00', '14:00')])
    expect(
      normalizarFaixas([faixa('09:00', '12:00'), faixa('11:00', '14:00')]),
    ).toEqual([faixa('09:00', '14:00')])
    expect(normalizarFaixas([faixa('10:00', '10:00')])).toEqual([])
  })

  it('parte a janela quando o bloqueio cai no meio', () => {
    expect(
      subtrairFaixas([faixa('09:00', '18:00')], [faixa('13:00', '15:00')]),
    ).toEqual([faixa('09:00', '13:00'), faixa('15:00', '18:00')])
    expect(
      subtrairFaixas([faixa('09:00', '12:00')], [faixa('08:00', '13:00')]),
    ).toEqual([])
    expect(
      subtrairFaixas([faixa('09:00', '12:00')], [faixa('12:00', '13:00')]),
    ).toEqual([faixa('09:00', '12:00')])
  })
})

describe('geração de slots dentro de uma faixa', () => {
  it('respeita o ciclo duração + intervalo e exige a consulta inteira dentro', () => {
    // O cenário do requisito: 09:00–12:00, 60 de duração, 15 de folga.
    const encontrados = iniciosNaFaixa(faixa('09:00', '12:00'), 60, 15).map(
      horaDeMinutos,
    )
    expect(encontrados).toEqual(['09:00', '10:15'])
    // 11:30 não entra porque terminaria às 12:30, fora da faixa.
    expect(encontrados).not.toContain('11:30')
  })

  it('deixa a última consulta terminar exatamente no fim da faixa', () => {
    expect(iniciosNaFaixa(faixa('09:00', '12:00'), 60, 0).map(horaDeMinutos)).toEqual([
      '09:00',
      '10:00',
      '11:00',
    ])
  })

  it('não gera nada quando a duração não cabe', () => {
    expect(iniciosNaFaixa(faixa('09:00', '09:45'), 60, 0)).toEqual([])
    expect(iniciosNaFaixa(faixa('09:00', '12:00'), 0, 15)).toEqual([])
  })

  it('gera sequências independentes para faixas separadas', () => {
    const slots = calcularSlotsDoDia({
      dataLocal: QUINTA,
      faixasRecorrentes: [faixa('09:00', '12:00'), faixa('14:00', '18:00')],
      excecoes: [],
      regras: regras(),
      agora: ONTEM,
    })
    expect(inicios(slots)).toEqual(['09:00', '10:15', '14:00', '15:15', '16:30'])
  })
})

describe('exceções sobre a recorrência', () => {
  const semana = [faixa('09:00', '12:00'), faixa('14:00', '18:00')]

  it('dia inteiro indisponível zera a recorrência', () => {
    expect(janelasDoDia(semana, [{ tipo: 'indisponivel_dia' }])).toEqual([])
  })

  it('bloqueio parcial recorta a janela', () => {
    const excecoes: ExcecaoDoDia[] = [
      { tipo: 'bloqueio_parcial', ...faixa('13:00', '15:00') },
    ]
    expect(janelasDoDia(semana, excecoes)).toEqual([
      faixa('09:00', '12:00'),
      faixa('15:00', '18:00'),
    ])
  })

  it('disponibilidade excepcional abre um dia que a recorrência não cobre', () => {
    const excecoes: ExcecaoDoDia[] = [
      { tipo: 'disponivel_extra', ...faixa('09:00', '12:00') },
    ]
    const slots = calcularSlotsDoDia({
      dataLocal: DOMINGO,
      faixasRecorrentes: [],
      excecoes,
      regras: regras({ intervaloMinutos: 0 }),
      agora: ONTEM,
    })
    expect(inicios(slots)).toEqual(['09:00', '10:00', '11:00'])
  })

  it('atende num dia fechado sem desmontar a recorrência', () => {
    // "Não trabalho neste dia" + "mas neste dia atendo das 9 às 12".
    const excecoes: ExcecaoDoDia[] = [
      { tipo: 'indisponivel_dia' },
      { tipo: 'disponivel_extra', ...faixa('09:00', '12:00') },
    ]
    expect(janelasDoDia(semana, excecoes)).toEqual([faixa('09:00', '12:00')])
  })

  it('o bloqueio vence a disponibilidade excepcional, em qualquer ordem', () => {
    const bloqueio: ExcecaoDoDia = {
      tipo: 'bloqueio_parcial',
      ...faixa('10:00', '11:00'),
    }
    const extra: ExcecaoDoDia = {
      tipo: 'disponivel_extra',
      ...faixa('09:00', '12:00'),
    }
    const esperado = [faixa('09:00', '10:00'), faixa('11:00', '12:00')]
    expect(janelasDoDia([], [bloqueio, extra])).toEqual(esperado)
    // Determinismo: a ordem de cadastro das exceções não muda o resultado.
    expect(janelasDoDia([], [extra, bloqueio])).toEqual(esperado)
  })

  it('combina recorrência, bloqueio e disponibilidade extra no mesmo dia', () => {
    const slots = calcularSlotsDoDia({
      dataLocal: QUINTA,
      faixasRecorrentes: [faixa('09:00', '12:00')],
      excecoes: [
        { tipo: 'disponivel_extra', ...faixa('14:00', '16:00') },
        { tipo: 'bloqueio_parcial', ...faixa('10:00', '11:00') },
      ],
      regras: regras({ intervaloMinutos: 0 }),
      agora: ONTEM,
    })
    expect(inicios(slots)).toEqual(['09:00', '11:00', '14:00', '15:00'])
  })
})

describe('antecedência mínima', () => {
  const base = {
    dataLocal: QUINTA,
    faixasRecorrentes: [faixa('09:00', '12:00')],
    excecoes: [],
  }

  it('remove os horários cedo demais', () => {
    // 08:00 local (11:00 UTC), antecedência de 120 minutos: 09:00 está fora,
    // 10:00 entra.
    const slots = calcularSlotsDoDia({
      ...base,
      regras: regras({ intervaloMinutos: 0, antecedenciaMinimaMinutos: 120 }),
      agora: new Date('2026-08-27T11:00:00Z'),
    })
    expect(inicios(slots)).toEqual(['10:00', '11:00'])
  })

  it('aceita o horário exatamente no limite', () => {
    // Agora + 120 minutos dá exatamente 09:00 local. O limite é inclusivo.
    const slots = calcularSlotsDoDia({
      ...base,
      regras: regras({ intervaloMinutos: 0, antecedenciaMinimaMinutos: 120 }),
      agora: new Date('2026-08-27T10:00:00Z'),
    })
    expect(inicios(slots)).toContain('09:00')
  })

  it('um minuto além do limite já elimina o horário', () => {
    const slots = calcularSlotsDoDia({
      ...base,
      regras: regras({ intervaloMinutos: 0, antecedenciaMinimaMinutos: 121 }),
      agora: new Date('2026-08-27T10:00:00Z'),
    })
    expect(inicios(slots)).not.toContain('09:00')
  })

  it('sem antecedência configurada, só o passado sai', () => {
    const slots = calcularSlotsDoDia({
      ...base,
      regras: regras({ intervaloMinutos: 0, antecedenciaMinimaMinutos: 0 }),
      agora: new Date('2026-08-27T13:30:00Z'), // 10:30 local
      })
    expect(inicios(slots)).toEqual(['11:00'])
  })
})

describe('horizonte máximo', () => {
  const dia = (dataLocal: string, horizonteDias: number) =>
    calcularSlotsDoDia({
      dataLocal,
      faixasRecorrentes: [faixa('09:00', '12:00')],
      excecoes: [],
      regras: regras({ intervaloMinutos: 0, horizonteDias }),
      agora: new Date('2026-08-27T12:00:00Z'), // 09:00 local de quinta
    })

  it('o último dia do horizonte ainda vale', () => {
    expect(dia(somarDiasEmDataLocal(QUINTA, 60), 60).length).toBeGreaterThan(0)
  })

  it('um dia além do horizonte não vale', () => {
    expect(dia(somarDiasEmDataLocal(QUINTA, 61), 60)).toEqual([])
  })

  it('data no passado não vale', () => {
    expect(dia(somarDiasEmDataLocal(QUINTA, -1), 60)).toEqual([])
  })
})

describe('ocupações futuras', () => {
  it('remove o horário tomado e respeita a folga ao redor dele', () => {
    const slots = calcularSlotsDoDia({
      dataLocal: QUINTA,
      faixasRecorrentes: [faixa('09:00', '13:00')],
      excecoes: [],
      regras: regras({ intervaloMinutos: 0 }),
      agora: ONTEM,
      ocupacoes: [
        {
          inicioEm: instanteDeLocal(QUINTA, minutosDeHora('10:00'), SP),
          fimEm: instanteDeLocal(QUINTA, minutosDeHora('11:00'), SP),
        },
      ],
    })
    expect(inicios(slots)).toEqual(['09:00', '11:00', '12:00'])
  })
})

describe('validação da configuração', () => {
  const valida = {
    titulo: 'Consultoria tributária',
    descricaoCurta: 'Conversa ao vivo sobre decisões fiscais.',
    valorCentavos: 18_000,
    duracaoMinutos: 60,
  }

  it('aceita uma configuração mínima e aplica os padrões', () => {
    const resultado = ConsultoriaConfiguracaoSchema.safeParse(valida)
    expect(resultado.success).toBe(true)
    if (!resultado.success) return
    expect(resultado.data.timezone).toBe(TIMEZONE_PADRAO)
    expect(resultado.data.modalidade).toBe('online')
    expect(resultado.data.intervaloMinutos).toBe(0)
    expect(resultado.data.antecedenciaMinimaMinutos).toBe(
      ANTECEDENCIA_PADRAO_MINUTOS,
    )
  })

  it('recusa duração, preço, intervalo, antecedência e horizonte impossíveis', () => {
    const recusa = (patch: Record<string, unknown>) =>
      ConsultoriaConfiguracaoSchema.safeParse({ ...valida, ...patch }).success
    expect(recusa({ duracaoMinutos: 0 })).toBe(false)
    expect(recusa({ duracaoMinutos: -30 })).toBe(false)
    expect(recusa({ duracaoMinutos: DURACAO_MAXIMA_MINUTOS + 1 })).toBe(false)
    expect(recusa({ valorCentavos: 0 })).toBe(false)
    expect(recusa({ valorCentavos: 180.5 })).toBe(false)
    expect(recusa({ intervaloMinutos: -1 })).toBe(false)
    expect(recusa({ antecedenciaMinimaMinutos: -1 })).toBe(false)
    expect(recusa({ horizonteDias: 0 })).toBe(false)
    expect(recusa({ horizonteDias: HORIZONTE_MAXIMO_DIAS + 1 })).toBe(false)
  })

  it('aceita intervalo zero e antecedência zero', () => {
    const resultado = ConsultoriaConfiguracaoSchema.safeParse({
      ...valida,
      intervaloMinutos: 0,
      antecedenciaMinimaMinutos: 0,
    })
    expect(resultado.success).toBe(true)
  })

  it('recusa fuso inexistente e aceita qualquer IANA real', () => {
    expect(
      ConsultoriaConfiguracaoSchema.safeParse({ ...valida, timezone: 'Marte/Olympus' })
        .success,
    ).toBe(false)
    expect(
      ConsultoriaConfiguracaoSchema.safeParse({ ...valida, timezone: NY }).success,
    ).toBe(true)
  })
})

describe('validação das faixas semanais', () => {
  it('aceita uma faixa, várias faixas no mesmo dia e nenhuma faixa', () => {
    expect(
      FaixasSemanaisSchema.safeParse([
        { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
      ]).success,
    ).toBe(true)
    expect(
      FaixasSemanaisSchema.safeParse([
        { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
        { diaSemana: 1, horaInicio: '14:00', horaFim: '18:00' },
        { diaSemana: 2, horaInicio: '09:00', horaFim: '12:00' },
      ]).success,
    ).toBe(true)
    expect(FaixasSemanaisSchema.safeParse([]).success).toBe(true)
  })

  it('recusa faixa invertida ou de duração zero', () => {
    expect(
      FaixasSemanaisSchema.safeParse([
        { diaSemana: 1, horaInicio: '12:00', horaFim: '09:00' },
      ]).success,
    ).toBe(false)
    expect(
      FaixasSemanaisSchema.safeParse([
        { diaSemana: 1, horaInicio: '09:00', horaFim: '09:00' },
      ]).success,
    ).toBe(false)
  })

  it('recusa faixas sobrepostas no mesmo dia', () => {
    const problemas = conferirFaixasSemanais([
      { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
      { diaSemana: 1, horaInicio: '11:00', horaFim: '14:00' },
    ])
    expect(problemas).toHaveLength(1)
    expect(problemas[0].mensagem).toContain('sobrepõe')
  })

  it('não confunde faixas coladas com sobreposição, nem dias diferentes', () => {
    expect(
      conferirFaixasSemanais([
        { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
        { diaSemana: 1, horaInicio: '12:00', horaFim: '14:00' },
      ]),
    ).toEqual([])
    expect(
      conferirFaixasSemanais([
        { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
        { diaSemana: 2, horaInicio: '09:00', horaFim: '12:00' },
      ]),
    ).toEqual([])
  })
})

describe('validação das exceções', () => {
  it('dia indisponível não aceita horário', () => {
    expect(
      ExcecaoSchema.safeParse({ data: '2026-12-25', tipo: 'indisponivel_dia' })
        .success,
    ).toBe(true)
    expect(
      ExcecaoSchema.safeParse({
        data: '2026-12-25',
        tipo: 'indisponivel_dia',
        horaInicio: '09:00',
        horaFim: '12:00',
      }).success,
    ).toBe(false)
  })

  it('bloqueio e disponibilidade extra exigem horário coerente', () => {
    expect(
      ExcecaoSchema.safeParse({ data: QUINTA, tipo: 'bloqueio_parcial' }).success,
    ).toBe(false)
    expect(
      ExcecaoSchema.safeParse({
        data: QUINTA,
        tipo: 'bloqueio_parcial',
        horaInicio: '15:00',
        horaFim: '13:00',
      }).success,
    ).toBe(false)
    expect(
      ExcecaoSchema.safeParse({
        data: DOMINGO,
        tipo: 'disponivel_extra',
        horaInicio: '09:00',
        horaFim: '12:00',
      }).success,
    ).toBe(true)
  })

  it('recusa data impossível', () => {
    expect(
      ExcecaoSchema.safeParse({ data: '2026-02-31', tipo: 'indisponivel_dia' })
        .success,
    ).toBe(false)
  })
})
