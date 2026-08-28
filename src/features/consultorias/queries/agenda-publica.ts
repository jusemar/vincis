import { and, asc, between, eq, gt, lt, ne } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaDisponibilidades,
  consultoriaExcecoes,
  consultoriaReservas,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import type { ModalidadeConsultoria, TipoExcecao } from '../constants/consultoria'
import {
  type ExcecaoDoDia,
  type FaixaLocal,
  type Ocupacao,
  type RegrasDaAgenda,
  calcularSlotsDoDia,
} from '../lib/slots'
import { type MesDaAgenda, montarGradeDoMes } from '../lib/mes'
import {
  type DataLocal,
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  diferencaEmDiasLocais,
  instanteDeLocal,
  intervaloDeDatasLocais,
  minutosDeHora,
  somarDiasEmDataLocal,
} from '../lib/tempo'
import type {
  AgendaDeDiasDTO,
  AgendaDoDiaDTO,
  AgendaDoMesDTO,
  ConsultoriaPublicaDTO,
} from '../types/consultoria'

/**
 * A agenda pública de um Profissional.
 *
 * ## Uma fonte, duas perguntas
 *
 * O calendário pergunta "quais dias têm horário?" e a lista pergunta "quais
 * horários tem este dia?". As duas respostas saem do **mesmo** carregamento e
 * do **mesmo** cálculo (`calcularSlotsDoDia`) — se cada uma tivesse a própria
 * regra, o dia apareceria verde no calendário e vazio ao ser aberto.
 *
 * ## Quem aparece
 *
 * Os mesmos critérios do resto do perfil público: conta ativa, identidade
 * verificada e cadastro de prestador habilitado — reaproveitados de
 * `condicaoContaVerificada` e `condicaoPrestadorHabilitado`, e não reescritos
 * aqui. Mais a consultoria estar `ativa`. Falhando qualquer um deles, a
 * resposta é ausência explícita (`consultoria: null`), nunca um valor de
 * exemplo.
 *
 * ## Nenhum id atravessa como permissão
 *
 * `prestadorId` é um dado público (o perfil já é público), e o que ele alcança
 * aqui é exatamente o que o perfil já mostra: título, preço, duração e horários
 * livres. O `motivo` das exceções — anotação interna — não é sequer
 * selecionado.
 */

type ConfiguracaoCarregada = ConsultoriaPublicaDTO & {
  intervaloMinutos: number
}

async function carregarConfiguracao(
  prestadorId: string,
): Promise<ConfiguracaoCarregada | null> {
  const [registro] = await db
    .select({
      id: consultoriaConfiguracoes.id,
      prestadorId: consultoriaConfiguracoes.prestadorId,
      titulo: consultoriaConfiguracoes.titulo,
      descricaoCurta: consultoriaConfiguracoes.descricaoCurta,
      modalidade: consultoriaConfiguracoes.modalidade,
      valorCentavos: consultoriaConfiguracoes.valorCentavos,
      duracaoMinutos: consultoriaConfiguracoes.duracaoMinutos,
      intervaloMinutos: consultoriaConfiguracoes.intervaloMinutos,
      antecedenciaMinimaMinutos:
        consultoriaConfiguracoes.antecedenciaMinimaMinutos,
      horizonteDias: consultoriaConfiguracoes.horizonteDias,
      timezone: consultoriaConfiguracoes.timezone,
    })
    .from(consultoriaConfiguracoes)
    .innerJoin(usuarios, eq(usuarios.id, consultoriaConfiguracoes.prestadorId))
    .innerJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(
      and(
        eq(consultoriaConfiguracoes.prestadorId, prestadorId),
        eq(consultoriaConfiguracoes.ativa, true),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorHabilitado(),
      ),
    )
    .limit(1)

  if (!registro) return null
  return {
    ...registro,
    modalidade: registro.modalidade as ModalidadeConsultoria,
  }
}

/**
 * A consultoria de um Profissional, ou `null`.
 *
 * Exposta separadamente porque o perfil precisa saber **se** existe consultoria
 * antes de decidir o que desenhar — e essa pergunta não deveria custar o
 * carregamento de um mês inteiro de agenda.
 */
export async function obterConsultoriaPublica(
  prestadorId: string,
): Promise<ConsultoriaPublicaDTO | null> {
  const configuracao = await carregarConfiguracao(prestadorId)
  if (!configuracao) return null
  const { intervaloMinutos: _intervalo, ...publica } = configuracao
  return publica
}

async function carregarFaixas(configuracaoId: string) {
  const registros = await db
    .select({
      diaSemana: consultoriaDisponibilidades.diaSemana,
      horaInicio: consultoriaDisponibilidades.horaInicio,
      horaFim: consultoriaDisponibilidades.horaFim,
    })
    .from(consultoriaDisponibilidades)
    .where(
      and(
        eq(consultoriaDisponibilidades.configuracaoId, configuracaoId),
        eq(consultoriaDisponibilidades.ativo, true),
      ),
    )
    .orderBy(
      asc(consultoriaDisponibilidades.diaSemana),
      asc(consultoriaDisponibilidades.horaInicio),
    )

  // Agrupado por dia da semana já aqui: o laço de dias consulta um mapa em vez
  // de filtrar a lista inteira a cada data.
  const porDia = new Map<number, FaixaLocal[]>()
  for (const registro of registros) {
    const faixas = porDia.get(registro.diaSemana) ?? []
    faixas.push({
      inicio: minutosDeHora(registro.horaInicio),
      fim: minutosDeHora(registro.horaFim),
    })
    porDia.set(registro.diaSemana, faixas)
  }
  return porDia
}

async function carregarExcecoes(
  configuracaoId: string,
  de: DataLocal,
  ate: DataLocal,
) {
  const registros = await db
    .select({
      data: consultoriaExcecoes.data,
      tipo: consultoriaExcecoes.tipo,
      horaInicio: consultoriaExcecoes.horaInicio,
      horaFim: consultoriaExcecoes.horaFim,
    })
    .from(consultoriaExcecoes)
    .where(
      and(
        eq(consultoriaExcecoes.configuracaoId, configuracaoId),
        eq(consultoriaExcecoes.ativo, true),
        // Comparação de `date` com strings `AAAA-MM-DD`: ordenação
        // lexicográfica e cronológica coincidem nesse formato, e nenhum
        // instante é construído no caminho.
        between(consultoriaExcecoes.data, de, ate),
      ),
    )

  const porData = new Map<DataLocal, ExcecaoDoDia[]>()
  for (const registro of registros) {
    const lista = porData.get(registro.data) ?? []
    const tipo = registro.tipo as TipoExcecao
    if (tipo === 'indisponivel_dia') {
      lista.push({ tipo })
    } else if (registro.horaInicio && registro.horaFim) {
      lista.push({
        tipo,
        inicio: minutosDeHora(registro.horaInicio),
        fim: minutosDeHora(registro.horaFim),
      })
    }
    porData.set(registro.data, lista)
  }
  return porData
}

/**
 * O que ocupa a agenda: reservas vivas e consultorias contratadas.
 *
 * Este é o único lugar do projeto que traduz "reserva no banco" para "ocupação
 * na agenda". Espalhar a condição por cada consulta seria como acabaria
 * existindo uma tela que oferece um horário que outra já considera tomado.
 *
 * As duas condições são obrigatórias e nenhuma delas depende de varredura:
 * `status = 'ativa'` descarta o que o Cliente liberou ao trocar de horário, e
 * `expira_em > agora` descarta o que venceu — mesmo que a linha continue
 * fisicamente lá, marcada como ativa, porque ninguém disputou aquele horário
 * desde então. É o que faz a liberação por expiração não depender de Cron.
 *
 * `ignorarClienteId` existe para o dono da reserva: ao reconferir o horário que
 * ele mesmo segura, a própria reserva não pode ser o motivo da recusa. Nenhuma
 * consulta pública passa esse parâmetro — para o resto do mundo o horário está
 * ocupado, e é isso que se quer.
 *
 * O `SELECT` traz período e nada mais: `descricao` é assunto privado do
 * Cliente e não tem por que atravessar a consulta de disponibilidade, pela
 * mesma razão que o `motivo` de uma exceção nunca sai daqui.
 */
async function carregarOcupacoes(
  configuracaoId: string,
  de: DataLocal,
  ate: DataLocal,
  timezone: string,
  agora: Date,
  ignorarClienteId?: string,
): Promise<Ocupacao[]> {
  // A janela consultada em instantes, com um dia de folga de cada lado para
  // que uma reserva que atravessa a borda do recorte ainda seja vista.
  const inicioJanela = instanteDeLocal(somarDiasEmDataLocal(de, -1), 0, timezone)
  const fimJanela = instanteDeLocal(somarDiasEmDataLocal(ate, 2), 0, timezone)

  const reservadas = await db
    .select({
      inicioEm: consultoriaReservas.inicioEm,
      fimEm: consultoriaReservas.fimEm,
    })
    .from(consultoriaReservas)
    .where(
      and(
        eq(consultoriaReservas.configuracaoId, configuracaoId),
        eq(consultoriaReservas.status, 'ativa'),
        gt(consultoriaReservas.expiraEm, agora),
        lt(consultoriaReservas.inicioEm, fimJanela),
        gt(consultoriaReservas.fimEm, inicioJanela),
        ignorarClienteId
          ? ne(consultoriaReservas.clienteUsuarioId, ignorarClienteId)
          : undefined,
      ),
    )

  /**
   * As consultorias já contratadas.
   *
   * Elas ocupam o horário para sempre — não têm prazo para vencer e não são
   * afetadas por `ignorarClienteId`: quem já contratou as 14:00 não deve ver
   * as 14:00 de novo como se estivessem livres, ou marcaria duas vezes o mesmo
   * encontro. É este bloqueio, e não o status da reserva de origem, que impede
   * o horário de voltar à venda quando o prazo daquela reserva vencer.
   */
  const contratadas = await db
    .select({
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
    })
    .from(consultoriaAgendamentos)
    .where(
      and(
        eq(consultoriaAgendamentos.configuracaoId, configuracaoId),
        eq(consultoriaAgendamentos.status, 'agendada'),
        lt(consultoriaAgendamentos.inicioEm, fimJanela),
        gt(consultoriaAgendamentos.fimEm, inicioJanela),
      ),
    )

  return [...reservadas, ...contratadas]
}

function regrasDe(configuracao: ConfiguracaoCarregada): RegrasDaAgenda {
  return {
    timezone: configuracao.timezone,
    duracaoMinutos: configuracao.duracaoMinutos,
    intervaloMinutos: configuracao.intervaloMinutos,
    antecedenciaMinimaMinutos: configuracao.antecedenciaMinimaMinutos,
    horizonteDias: configuracao.horizonteDias,
  }
}

/**
 * Limita o intervalo pedido ao que a agenda realmente pode responder.
 *
 * O calendário pede um mês inteiro, inclusive quando metade dele já passou ou
 * está além do horizonte. Cortar aqui evita percorrer dias que o cálculo
 * descartaria um a um — e garante que ninguém consiga varrer a agenda de 2099
 * pedindo um intervalo enorme.
 */
function recortarIntervalo(
  de: DataLocal,
  ate: DataLocal,
  configuracao: ConfiguracaoCarregada,
  agora: Date,
) {
  const hoje = dataLocalDoInstante(agora, configuracao.timezone)
  const limite = somarDiasEmDataLocal(hoje, configuracao.horizonteDias)
  const inicio = de < hoje ? hoje : de
  const fim = ate > limite ? limite : ate
  return diferencaEmDiasLocais(inicio, fim) < 0 ? null : { inicio, fim }
}

export type ConsultaDeDias = {
  prestadorId: string
  /** Datas locais `AAAA-MM-DD` na agenda do Profissional. */
  de: DataLocal
  ate: DataLocal
  agora?: Date
  /**
   * Ocupações extras, somadas às reservas que a própria consulta carrega.
   *
   * Continua existindo para o dia em que houver consulta confirmada — e para os
   * testes que querem descrever uma ocupação sem gravá-la.
   */
  ocupacoes?: Ocupacao[]
  /**
   * Reservas deste Cliente não contam como ocupação.
   *
   * Só o fluxo de aquisição usa: quem já segura o horário não pode ser
   * impedido pela própria reserva. Consulta pública nunca informa.
   */
  ignorarClienteId?: string
}

/**
 * Dias com pelo menos um horário livre, num intervalo.
 *
 * Uma consulta só para o mês inteiro — é isso que permite o calendário pintar
 * trinta dias sem trinta requisições. `totalSlots` acompanha porque já foi
 * calculado: descartá-lo obrigaria a recalcular o dia ao abri-lo.
 */
export async function listarDiasDisponiveis({
  prestadorId,
  de,
  ate,
  agora = new Date(),
  ocupacoes = [],
  ignorarClienteId,
}: ConsultaDeDias): Promise<AgendaDeDiasDTO> {
  const configuracao = await carregarConfiguracao(prestadorId)
  if (!configuracao) return { consultoria: null, dias: [] }

  const { intervaloMinutos: _intervalo, ...publica } = configuracao
  const recorte = recortarIntervalo(de, ate, configuracao, agora)
  if (!recorte) return { consultoria: publica, dias: [] }

  const [faixasPorDia, excecoesPorData, reservadas] = await Promise.all([
    carregarFaixas(configuracao.id),
    carregarExcecoes(configuracao.id, recorte.inicio, recorte.fim),
    carregarOcupacoes(
      configuracao.id,
      recorte.inicio,
      recorte.fim,
      configuracao.timezone,
      agora,
      ignorarClienteId,
    ),
  ])
  const ocupadas = [...reservadas, ...ocupacoes]

  const regras = regrasDe(configuracao)
  const dias = intervaloDeDatasLocais(recorte.inicio, recorte.fim)
    .map((data) => ({
      data,
      totalSlots: calcularSlotsDoDia({
        dataLocal: data,
        faixasRecorrentes: faixasPorDia.get(diaDaSemanaDeDataLocal(data)) ?? [],
        excecoes: excecoesPorData.get(data) ?? [],
        regras,
        agora,
        ocupacoes: ocupadas,
      }).length,
    }))
    .filter((dia) => dia.totalSlots > 0)

  return { consultoria: publica, dias }
}

export type ConsultaDeHorarios = {
  prestadorId: string
  data: DataLocal
  agora?: Date
  ocupacoes?: Ocupacao[]
  /** Ver `ConsultaDeDias.ignorarClienteId`. */
  ignorarClienteId?: string
}

/**
 * Horários livres de um dia.
 *
 * Mesmo carregamento e mesmo cálculo da consulta de dias — a única diferença é
 * o intervalo ter um dia só. Duplicar a regra aqui seria a forma mais rápida de
 * as duas telas passarem a discordar.
 */
export async function listarHorariosDoDia({
  prestadorId,
  data,
  agora = new Date(),
  ocupacoes = [],
  ignorarClienteId,
}: ConsultaDeHorarios): Promise<AgendaDoDiaDTO> {
  const configuracao = await carregarConfiguracao(prestadorId)
  if (!configuracao) return { consultoria: null, data, horarios: [] }

  const { intervaloMinutos: _intervalo, ...publica } = configuracao
  const recorte = recortarIntervalo(data, data, configuracao, agora)
  if (!recorte) return { consultoria: publica, data, horarios: [] }

  const [faixasPorDia, excecoesPorData, reservadas] = await Promise.all([
    carregarFaixas(configuracao.id),
    carregarExcecoes(configuracao.id, data, data),
    carregarOcupacoes(
      configuracao.id,
      data,
      data,
      configuracao.timezone,
      agora,
      ignorarClienteId,
    ),
  ])

  const slots = calcularSlotsDoDia({
    dataLocal: data,
    faixasRecorrentes: faixasPorDia.get(diaDaSemanaDeDataLocal(data)) ?? [],
    excecoes: excecoesPorData.get(data) ?? [],
    regras: regrasDe(configuracao),
    agora,
    ocupacoes: [...reservadas, ...ocupacoes],
  })

  return {
    consultoria: publica,
    data,
    horarios: slots.map((slot) => ({
      inicio: slot.inicio,
      fim: slot.fim,
      inicioEm: slot.inicioEm,
      fimEm: slot.fimEm,
    })),
  }
}

/**
 * Um mês inteiro do calendário, numa consulta só.
 *
 * É o formato que o card do perfil consome: a consultoria, os dias com horário
 * livre e os dois limites de navegação. Vem junto porque o navegador não pode
 * calcular "hoje na agenda do Profissional" — hoje depende do fuso **dela**, e
 * não do relógio de quem está olhando a página.
 *
 * O recorte por horizonte e por passado continua sendo o de
 * `listarDiasDisponiveis`: pedir janeiro de 2020 devolve mês vazio, não a
 * agenda de outra pessoa.
 */
export async function obterAgendaDoMes({
  prestadorId,
  mes,
  agora = new Date(),
  ocupacoes = [],
  ignorarClienteId,
}: {
  prestadorId: string
  mes: MesDaAgenda
  agora?: Date
  ocupacoes?: Ocupacao[]
  /** Ver `ConsultaDeDias.ignorarClienteId`. */
  ignorarClienteId?: string
}): Promise<AgendaDoMesDTO> {
  const grade = montarGradeDoMes(mes)
  const { consultoria, dias } = await listarDiasDisponiveis({
    prestadorId,
    de: grade.primeiroDia,
    ate: grade.ultimoDia,
    agora,
    ocupacoes,
    ignorarClienteId,
  })

  if (!consultoria) {
    return { consultoria: null, mes, dias: [], hoje: null, ultimoDia: null }
  }

  const hoje = dataLocalDoInstante(agora, consultoria.timezone)
  return {
    consultoria,
    mes,
    dias,
    hoje,
    ultimoDia: somarDiasEmDataLocal(hoje, consultoria.horizonteDias),
  }
}
