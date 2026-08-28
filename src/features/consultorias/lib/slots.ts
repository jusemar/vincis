import {
  type DataLocal,
  dataLocalDoInstante,
  diferencaEmDiasLocais,
  horaDeMinutos,
  horaLocalExiste,
  instanteDeLocal,
} from './tempo'

/**
 * O cálculo da disponibilidade. **Fonte única** da regra de agenda.
 *
 * Nenhum componente React, nenhuma query e nenhuma Server Action repete o que
 * está aqui: elas carregam os dados e chamam estas funções. Regra de agenda
 * espalhada é como duas telas passam a discordar sobre o mesmo horário.
 *
 * O módulo é **puro** — sem banco, sem sessão, sem `new Date()` implícito. O
 * instante atual entra por parâmetro, e é isso que permite testar meia-noite,
 * virada de horário de verão e antecedência no limite sem mexer no relógio do
 * processo.
 *
 * ## Nada é materializado
 *
 * Não existe tabela de slots. Os horários dos próximos meses são derivados a
 * cada consulta a partir das faixas recorrentes, das exceções, do relógio e
 * (quando existirem) das ocupações. Mudar a duração de 60 para 45 minutos muda
 * a agenda inteira na mesma hora, sem regeração de nada.
 */

/** Uma janela do dia, em minutos desde a meia-noite local. `fim` exclusivo. */
export type FaixaLocal = { inicio: number; fim: number }

/** As exceções **daquela** data, já filtradas por quem chamou. */
export type ExcecaoDoDia =
  | { tipo: 'indisponivel_dia' }
  | { tipo: 'bloqueio_parcial'; inicio: number; fim: number }
  | { tipo: 'disponivel_extra'; inicio: number; fim: number }

/**
 * Um intervalo já tomado — consulta confirmada ou reserva temporária viva.
 *
 * Ainda não existe nenhuma nesta etapa, e o parâmetro entra vazio. Ele existe
 * agora para que a etapa da reserva acrescente a origem do dado sem reescrever
 * o cálculo: a regra de "horário ocupado não aparece" já está escrita e testada.
 */
export type Ocupacao = { inicioEm: Date; fimEm: Date }

/** As regras da consultoria que o cálculo precisa conhecer. */
export type RegrasDaAgenda = {
  timezone: string
  duracaoMinutos: number
  intervaloMinutos: number
  antecedenciaMinimaMinutos: number
  horizonteDias: number
}

export type SlotCalculado = {
  dataLocal: DataLocal
  /** `HH:MM` no fuso da agenda. É o que a tela mostra. */
  inicio: string
  fim: string
  /** Os mesmos horários como instante absoluto. É o que o banco guardaria. */
  inicioEm: Date
  fimEm: Date
}

const MS_POR_MINUTO = 60_000

/**
 * Ordena e funde janelas que se tocam ou se sobrepõem.
 *
 * Duas faixas coladas (09:00–12:00 e 12:00–14:00) viram uma só de 09:00 às
 * 14:00 — e é isso que faz nascer o slot das 11:30, que não existiria se cada
 * faixa gerasse a própria sequência. Fundir também é o que impede uma
 * disponibilidade excepcional sobreposta à recorrência de produzir horário
 * duplicado.
 */
export function normalizarFaixas(faixas: FaixaLocal[]): FaixaLocal[] {
  const validas = faixas
    .filter((faixa) => faixa.inicio < faixa.fim)
    .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim)

  const resultado: FaixaLocal[] = []
  for (const faixa of validas) {
    const ultima = resultado[resultado.length - 1]
    if (ultima && faixa.inicio <= ultima.fim) {
      ultima.fim = Math.max(ultima.fim, faixa.fim)
      continue
    }
    resultado.push({ ...faixa })
  }
  return resultado
}

/** Remove das janelas tudo que os bloqueios cobrem. */
export function subtrairFaixas(
  janelas: FaixaLocal[],
  bloqueios: FaixaLocal[],
): FaixaLocal[] {
  const cortes = normalizarFaixas(bloqueios)
  let atuais = normalizarFaixas(janelas)

  for (const corte of cortes) {
    const proximas: FaixaLocal[] = []
    for (const janela of atuais) {
      // Sem interseção: a janela passa inteira.
      if (corte.fim <= janela.inicio || corte.inicio >= janela.fim) {
        proximas.push(janela)
        continue
      }
      // Sobra à esquerda e/ou à direita. Um corte no meio parte a janela em
      // duas, que é o caso do bloqueio das 13:00 às 15:00 numa tarde inteira.
      if (janela.inicio < corte.inicio) {
        proximas.push({ inicio: janela.inicio, fim: corte.inicio })
      }
      if (corte.fim < janela.fim) {
        proximas.push({ inicio: corte.fim, fim: janela.fim })
      }
    }
    atuais = proximas
  }

  return atuais
}

/**
 * As janelas de atendimento de um dia, depois das exceções.
 *
 * Ordem, e o porquê de cada passo:
 *
 * 1. **recorrência** — a rotina semanal daquele dia da semana;
 * 2. **dia indisponível** — zera a rotina. É "não trabalho neste dia";
 * 3. **disponibilidade excepcional** — entra *depois* do passo 2, de propósito:
 *    é assim que "não atendo aos sábados, mas neste sábado atendo das 9 às 12"
 *    funciona sem desmontar a recorrência;
 * 4. **bloqueio parcial** — subtraído por **último**, e por isso sempre vence.
 *
 * O passo 4 é o único ponto em que a ordem conceitual foi ajustada: subtrair os
 * bloqueios antes de somar a disponibilidade excepcional deixaria uma janela
 * extra reintroduzir justamente o horário que o Profissional bloqueou naquele
 * dia. Bloqueio por último é a leitura segura, e é determinística: o resultado
 * não depende da ordem em que as exceções foram cadastradas.
 */
export function janelasDoDia(
  faixasRecorrentes: FaixaLocal[],
  excecoes: ExcecaoDoDia[],
): FaixaLocal[] {
  const diaFechado = excecoes.some(
    (excecao) => excecao.tipo === 'indisponivel_dia',
  )

  const base = diaFechado ? [] : faixasRecorrentes
  const extras = excecoes.filter((excecao) => excecao.tipo === 'disponivel_extra')
  const bloqueios = excecoes.filter(
    (excecao) => excecao.tipo === 'bloqueio_parcial',
  )

  const disponiveis = normalizarFaixas([
    ...base,
    ...extras.map(({ inicio, fim }) => ({ inicio, fim })),
  ])

  return subtrairFaixas(
    disponiveis,
    bloqueios.map(({ inicio, fim }) => ({ inicio, fim })),
  )
}

/**
 * Os começos de consulta possíveis dentro de uma janela.
 *
 * O ciclo é `duração + intervalo`, mas a condição de parada olha só para a
 * **duração**: a consulta precisa terminar dentro da janela; o intervalo é o
 * espaço reservado *antes da próxima*, e quando não há próxima ele não precisa
 * caber. Numa janela 09:00–12:00 com duração 60 e intervalo 15 isso produz
 * 09:00 e 10:15 — e não 11:30, porque 11:30 terminaria às 12:30. Com intervalo
 * 0 a mesma janela produz 09:00, 10:00 e 11:00, e a última termina exatamente
 * no fim da faixa.
 */
export function iniciosNaFaixa(
  faixa: FaixaLocal,
  duracaoMinutos: number,
  intervaloMinutos: number,
): number[] {
  if (duracaoMinutos <= 0) return []
  const passo = duracaoMinutos + Math.max(0, intervaloMinutos)
  const inicios: number[] = []
  for (
    let cursor = faixa.inicio;
    cursor + duracaoMinutos <= faixa.fim;
    cursor += passo
  ) {
    inicios.push(cursor)
  }
  return inicios
}

export type EntradaDoDia = {
  dataLocal: DataLocal
  faixasRecorrentes: FaixaLocal[]
  excecoes: ExcecaoDoDia[]
  regras: RegrasDaAgenda
  /** O instante atual. Sempre vem de fora — este módulo não olha o relógio. */
  agora: Date
  /** Consultas e reservas já existentes. Vazio nesta etapa. */
  ocupacoes?: Ocupacao[]
}

/**
 * Os horários que um Cliente pode contratar naquele dia.
 *
 * Depois das janelas, quatro filtros — todos no servidor, nenhum deles
 * cosmético:
 *
 * - **hora inexistente**: na madrugada em que o relógio pula (horário de verão)
 *   aquele minuto não aconteceu, e oferecê-lo criaria uma consulta sem instante;
 * - **antecedência**: começar em menos de `antecedenciaMinimaMinutos` está
 *   fora. O limite é inclusivo — exatamente no limite ainda vale;
 * - **horizonte**: dia anterior a hoje, nunca; depois de `hoje + horizonteDias`,
 *   também não. O último dia do horizonte está dentro;
 * - **ocupação**: qualquer sobreposição elimina o slot, e a comparação inclui o
 *   intervalo de folga dos dois lados — encostar numa consulta existente sem
 *   respeitar o buffer não é horário livre.
 */
export function calcularSlotsDoDia({
  dataLocal,
  faixasRecorrentes,
  excecoes,
  regras,
  agora,
  ocupacoes = [],
}: EntradaDoDia): SlotCalculado[] {
  const { timezone, duracaoMinutos, intervaloMinutos } = regras
  if (duracaoMinutos <= 0) return []

  const hojeLocal = dataLocalDoInstante(agora, timezone)
  const distancia = diferencaEmDiasLocais(hojeLocal, dataLocal)
  if (distancia < 0 || distancia > regras.horizonteDias) return []

  const limiteAntecedencia =
    agora.getTime() + regras.antecedenciaMinimaMinutos * MS_POR_MINUTO
  const folga = Math.max(0, intervaloMinutos) * MS_POR_MINUTO

  const slots: SlotCalculado[] = []
  for (const janela of janelasDoDia(faixasRecorrentes, excecoes)) {
    for (const inicio of iniciosNaFaixa(janela, duracaoMinutos, intervaloMinutos)) {
      if (!horaLocalExiste(dataLocal, inicio, timezone)) continue

      const inicioEm = instanteDeLocal(dataLocal, inicio, timezone)
      if (inicioEm.getTime() < limiteAntecedencia) continue

      const fim = inicio + duracaoMinutos
      const fimEm = instanteDeLocal(dataLocal, fim, timezone)

      const colide = ocupacoes.some(
        (ocupacao) =>
          inicioEm.getTime() < ocupacao.fimEm.getTime() + folga &&
          fimEm.getTime() + folga > ocupacao.inicioEm.getTime(),
      )
      if (colide) continue

      slots.push({
        dataLocal,
        inicio: horaDeMinutos(inicio),
        fim: horaDeMinutos(fim),
        inicioEm,
        fimEm,
      })
    }
  }

  // Janelas separadas geram sequências independentes; a tela espera uma lista
  // em ordem cronológica, e ordenar aqui evita que cada consumidor reordene.
  return slots.sort((a, b) => a.inicioEm.getTime() - b.inicioEm.getTime())
}
