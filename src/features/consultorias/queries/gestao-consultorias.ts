import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentos,
  avaliacoesAtendimento,
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaPagamentos,
  usuarios,
} from '@/db/schema'
import { janelaDaVideochamada } from '@/features/videochamada/lib/janela'
import type { FiltrosConsultoriasGestao } from '../schemas/gestao-consultorias'
import {
  dataLocalDoInstante,
  horaDeMinutos,
  minutosLocaisDoInstante,
} from '../lib/tempo'
import type {
  ConsultoriaGestaoDTO,
  DetalheConsultoriaGestaoDTO,
  IndicadoresConsultoriasDTO,
} from '../types/gestao-consultorias'

const clienteConta = alias(usuarios, 'gestao_cliente')
const prestadorConta = alias(usuarios, 'gestao_prestador')

/**
 * A Consultoria Agendada vista pela Gestão da Vincis.
 *
 * ## O que a Gestão vê, e por que não é tudo
 *
 * A Vincis administra a plataforma; ela não é parte da consulta. O que estas
 * consultas devolvem é o **registro operacional** — quem, quando, quanto,
 * status, protocolo, pagamento, eventos técnicos — porque é disso que o suporte
 * precisa para responder "o que aconteceu com o meu agendamento?".
 *
 * O que fica de fora é deliberado e não é esquecimento:
 *
 * - **o assunto que o Cliente escreveu** (`consultoria_agendamentos.descricao`)
 *   nunca é selecionado. É a manifestação privada dele, vive dentro do
 *   Protocolo e só as duas partes têm motivo para lê-la. Um painel que a
 *   exibisse por padrão transformaria toda consulta de suporte numa leitura do
 *   problema jurídico ou contábil de alguém.
 * - **a conversa e os anexos** do Atendimento não são carregados. O histórico de
 *   **eventos** é — ele conta o que a plataforma fez, não o que as pessoas
 *   disseram.
 * - **`daily_room_name`** não atravessa. A sala é privada e o nome é o
 *   identificador dela; o que o suporte precisa saber é *se* a sala existe e
 *   *quando* a janela abre, e é só isso que sai daqui.
 *
 * ## Somente leitura
 *
 * Não há função de escrita neste arquivo, e isso é a regra da etapa: cancelar,
 * remarcar, concluir e avaliar continuam pertencendo a quem contratou e a quem
 * atende. A Gestão observa.
 */

/** As horas de parede, no fuso gravado na própria consultoria. */
function horarios(registro: { inicioEm: Date; fimEm: Date; timezone: string }) {
  return {
    data: dataLocalDoInstante(registro.inicioEm, registro.timezone),
    inicio: horaDeMinutos(minutosLocaisDoInstante(registro.inicioEm, registro.timezone)),
    fim: horaDeMinutos(minutosLocaisDoInstante(registro.fimEm, registro.timezone)),
  }
}

const selecaoDaLista = {
  id: consultoriaAgendamentos.id,
  inicioEm: consultoriaAgendamentos.inicioEm,
  fimEm: consultoriaAgendamentos.fimEm,
  timezone: consultoriaAgendamentos.timezone,
  duracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
  valorCentavos: consultoriaAgendamentos.valorCentavos,
  status: consultoriaAgendamentos.status,
  remarcacoes: consultoriaAgendamentos.remarcacoes,
  criadoEm: consultoriaAgendamentos.createdAt,
  atualizadoEm: consultoriaAgendamentos.updatedAt,
  clienteNome: clienteConta.nome,
  prestadorNome: prestadorConta.nome,
  prestadorId: consultoriaAgendamentos.prestadorId,
  atendimentoId: atendimentos.id,
  protocolo: atendimentos.protocolo,
  pagamentoStatus: consultoriaPagamentos.status,
  pagamentoReferencia: consultoriaPagamentos.referencia,
  avaliacaoNota: avaliacoesAtendimento.nota,
  // Só o booleano: o nome da sala é o identificador de acesso e não sai daqui.
  temSala: sql<boolean>`${consultoriaAgendamentos.dailyRoomName} is not null`,
}

/** As junções compartilhadas pela lista, pela contagem e pelos indicadores. */
function baseDaConsulta() {
  return db
    .select(selecaoDaLista)
    .from(consultoriaAgendamentos)
    .innerJoin(
      clienteConta,
      eq(clienteConta.id, consultoriaAgendamentos.clienteUsuarioId),
    )
    .innerJoin(
      prestadorConta,
      eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
    )
    .leftJoin(
      atendimentos,
      eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      consultoriaPagamentos,
      eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      avaliacoesAtendimento,
      and(
        eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
        eq(avaliacoesAtendimento.prestadorId, consultoriaAgendamentos.prestadorId),
      ),
    )
}

/**
 * O recorte do período, em instantes.
 *
 * Convertido a partir de datas locais do servidor porque é assim que a Gestão
 * pensa ("hoje", "esta semana"). O corte é meio-aberto — `[de, ate)` — a mesma
 * convenção que a janela da videochamada e o gerador de horários usam.
 */
function recorteDoPeriodo(filtros: FiltrosConsultoriasGestao, agora: Date) {
  const inicioDoDia = new Date(agora)
  inicioDoDia.setHours(0, 0, 0, 0)

  switch (filtros.periodo) {
    case 'hoje': {
      const fim = new Date(inicioDoDia)
      fim.setDate(fim.getDate() + 1)
      return { de: inicioDoDia, ate: fim }
    }
    case 'semana': {
      const fim = new Date(inicioDoDia)
      fim.setDate(fim.getDate() + 7)
      return { de: inicioDoDia, ate: fim }
    }
    case 'mes': {
      const fim = new Date(inicioDoDia)
      fim.setMonth(fim.getMonth() + 1)
      return { de: inicioDoDia, ate: fim }
    }
    case 'personalizado': {
      if (!filtros.de || !filtros.ate) return null
      const fim = new Date(`${filtros.ate}T00:00:00`)
      fim.setDate(fim.getDate() + 1)
      return { de: new Date(`${filtros.de}T00:00:00`), ate: fim }
    }
    default:
      return null
  }
}

/**
 * Uma consultoria com problema estrutural.
 *
 * Não é "deu erro": é "os dados não fecham". Consultoria de pé sem Atendimento
 * significa protocolo que nunca abriu; consultoria de pé sem pagamento
 * aprovado significa uma contratação que passou pela reserva e não fechou o
 * ciclo. As duas são invisíveis para quem usa a plataforma e é exatamente por
 * isso que a Gestão precisa de uma lista delas.
 */
function condicaoDeProblema() {
  return or(
    and(eq(consultoriaAgendamentos.status, 'agendada'), isNull(atendimentos.id)),
    and(
      eq(consultoriaAgendamentos.status, 'agendada'),
      isNull(consultoriaPagamentos.id),
    ),
  )
}

function condicoesDe(filtros: FiltrosConsultoriasGestao, agora: Date) {
  const condicoes = []

  if (filtros.busca) {
    const alvo = `%${filtros.busca}%`
    /**
     * Os três identificadores que alguém informa ao pedir suporte: o protocolo
     * que anotou, o nome do Cliente ou o nome do Profissional. Nada além —
     * buscar por texto do assunto faria o painel varrer conteúdo privado.
     */
    condicoes.push(
      or(
        ilike(atendimentos.protocolo, alvo),
        ilike(clienteConta.nome, alvo),
        ilike(prestadorConta.nome, alvo),
      ),
    )
  }

  if (filtros.status !== 'todos') {
    condicoes.push(eq(consultoriaAgendamentos.status, filtros.status))
  }

  if (filtros.prestadorId) {
    condicoes.push(eq(consultoriaAgendamentos.prestadorId, filtros.prestadorId))
  }

  if (filtros.pagamento === 'aprovado') {
    condicoes.push(eq(consultoriaPagamentos.status, 'aprovado'))
  } else if (filtros.pagamento === 'sem_pagamento') {
    condicoes.push(isNull(consultoriaPagamentos.id))
  }

  if (filtros.avaliacao === 'avaliadas') {
    condicoes.push(isNotNull(avaliacoesAtendimento.id))
  } else if (filtros.avaliacao === 'sem_avaliacao') {
    condicoes.push(isNull(avaliacoesAtendimento.id))
  }

  const recorte = recorteDoPeriodo(filtros, agora)
  if (recorte) {
    condicoes.push(gte(consultoriaAgendamentos.inicioEm, recorte.de))
    condicoes.push(lt(consultoriaAgendamentos.inicioEm, recorte.ate))
  }

  if (filtros.somenteProblemas) {
    const problema = condicaoDeProblema()
    if (problema) condicoes.push(problema)
  }

  return condicoes.length ? and(...condicoes) : undefined
}

export async function listarConsultoriasGestao(
  filtros: FiltrosConsultoriasGestao,
  agora: Date = new Date(),
): Promise<{
  consultorias: ConsultoriaGestaoDTO[]
  total: number
  pagina: number
  totalPaginas: number
}> {
  const onde = condicoesDe(filtros, agora)

  const [linhas, [totais]] = await Promise.all([
    baseDaConsulta()
      .where(onde)
      // A mais recente primeiro: o suporte quase sempre procura algo de agora.
      .orderBy(desc(consultoriaAgendamentos.inicioEm))
      .limit(filtros.porPagina)
      .offset((filtros.pagina - 1) * filtros.porPagina),
    db
      .select({ total: count() })
      .from(consultoriaAgendamentos)
      .innerJoin(
        clienteConta,
        eq(clienteConta.id, consultoriaAgendamentos.clienteUsuarioId),
      )
      .innerJoin(
        prestadorConta,
        eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
      )
      .leftJoin(
        atendimentos,
        eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
      )
      .leftJoin(
        consultoriaPagamentos,
        eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
      )
      .leftJoin(
        avaliacoesAtendimento,
        and(
          eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
          eq(avaliacoesAtendimento.prestadorId, consultoriaAgendamentos.prestadorId),
        ),
      )
      .where(onde),
  ])

  const total = totais?.total ?? 0
  return {
    consultorias: linhas.map(vestir),
    total,
    pagina: filtros.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / filtros.porPagina)),
  }
}

function vestir(registro: {
  id: string
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  status: string
  remarcacoes: number
  criadoEm: Date
  atualizadoEm: Date
  clienteNome: string
  prestadorNome: string
  prestadorId: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
  pagamentoReferencia: string | null
  avaliacaoNota: number | null
  temSala: boolean
}): ConsultoriaGestaoDTO {
  return {
    id: registro.id,
    ...horarios(registro),
    inicioEm: registro.inicioEm.toISOString(),
    timezone: registro.timezone,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
    status: registro.status,
    remarcacoes: registro.remarcacoes,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
    clienteNome: registro.clienteNome,
    prestadorNome: registro.prestadorNome,
    prestadorId: registro.prestadorId,
    atendimentoId: registro.atendimentoId,
    protocolo: registro.protocolo,
    pagamentoStatus: registro.pagamentoStatus,
    pagamentoReferencia: registro.pagamentoReferencia,
    avaliacaoNota: registro.avaliacaoNota,
    temSala: registro.temSala,
    /**
     * O problema é derivado, não persistido: perguntar "falta Atendimento?" na
     * leitura sempre dá a resposta atual, enquanto uma coluna de "tem problema"
     * envelheceria no instante em que alguém consertasse o dado.
     */
    problemas: problemasDe(registro),
  }
}

function problemasDe(registro: {
  status: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
}): string[] {
  const problemas: string[] = []
  if (registro.status === 'agendada' && !registro.atendimentoId) {
    problemas.push('Sem atendimento vinculado')
  }
  if (registro.atendimentoId && !registro.protocolo) {
    problemas.push('Atendimento sem protocolo')
  }
  if (registro.status === 'agendada' && !registro.pagamentoStatus) {
    problemas.push('Sem pagamento registrado')
  }
  return problemas
}

/**
 * Os números do topo da tela.
 *
 * Uma consulta agregada em vez de contar linhas em memória: a lista é paginada,
 * então somar o que veio na página daria um total errado assim que houvesse
 * mais de uma. `filter` do Postgres resolve os quatro recortes numa varredura.
 */
export async function obterIndicadoresConsultorias(
  agora: Date = new Date(),
): Promise<IndicadoresConsultoriasDTO> {
  const [linha] = await db
    .select({
      total: count(),
      agendadas: sql<number>`count(*) filter (where ${consultoriaAgendamentos.status} = 'agendada')::int`,
      concluidas: sql<number>`count(*) filter (where ${consultoriaAgendamentos.status} = 'concluida')::int`,
      canceladas: sql<number>`count(*) filter (where ${consultoriaAgendamentos.status} = 'cancelada')::int`,
      // Só o que foi efetivamente pago: uma consultoria sem pagamento aprovado
      // não é receita, nem simulada.
      valorTotalCentavos: sql<number>`coalesce(sum(${consultoriaPagamentos.valorCentavos}) filter (where ${consultoriaPagamentos.status} = 'aprovado'), 0)::int`,
      proximas: sql<number>`count(*) filter (where ${consultoriaAgendamentos.status} = 'agendada' and ${consultoriaAgendamentos.inicioEm} > now())::int`,
    })
    .from(consultoriaAgendamentos)
    .leftJoin(
      consultoriaPagamentos,
      eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
    )

  const [avaliacoes] = await db
    .select({
      total: count(),
      media: sql<number | null>`avg(${avaliacoesAtendimento.nota})::float8`,
    })
    .from(avaliacoesAtendimento)
    .innerJoin(atendimentos, eq(atendimentos.id, avaliacoesAtendimento.atendimentoId))
    .where(isNotNull(atendimentos.consultoriaAgendamentoId))

  const [problemas] = await db
    .select({ total: count() })
    .from(consultoriaAgendamentos)
    .leftJoin(
      atendimentos,
      eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      consultoriaPagamentos,
      eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
    )
    .where(condicaoDeProblema())

  void agora
  return {
    total: linha?.total ?? 0,
    agendadas: linha?.agendadas ?? 0,
    concluidas: linha?.concluidas ?? 0,
    canceladas: linha?.canceladas ?? 0,
    proximas: linha?.proximas ?? 0,
    valorTotalCentavos: linha?.valorTotalCentavos ?? 0,
    avaliacoes: avaliacoes?.total ?? 0,
    mediaAvaliacoes: avaliacoes?.media ?? null,
    comProblema: problemas?.total ?? 0,
  }
}

/**
 * O detalhe de uma consultoria — operacional, e só.
 *
 * Traz o histórico de **eventos** do Atendimento (o que a plataforma fez) e
 * ignora mensagens e arquivos (o que as pessoas trocaram). A diferença é a
 * linha inteira desta etapa: a Gestão precisa saber que a consultoria foi
 * remarcada em tal dia, não o que foi dito na conversa.
 */
export async function obterConsultoriaGestao(
  agendamentoId: string,
): Promise<DetalheConsultoriaGestaoDTO | null> {
  const [linha] = await baseDaConsulta()
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)

  if (!linha) return null

  const [extras] = await db
    .select({
      canceladoEm: consultoriaAgendamentos.canceladoEm,
      motivoCancelamento: consultoriaAgendamentos.motivoCancelamento,
      concluidoEm: consultoriaAgendamentos.concluidoEm,
      remarcadoEm: consultoriaAgendamentos.remarcadoEm,
      salaCriadaEm: consultoriaAgendamentos.dailyRoomCriadaEm,
      pagamentoAprovadoEm: consultoriaPagamentos.aprovadoEm,
      pagamentoOrigem: consultoriaPagamentos.origem,
      pagamentoValor: consultoriaPagamentos.valorCentavos,
      avaliacaoComentario: avaliacoesAtendimento.comentario,
      configuracaoTitulo: consultoriaConfiguracoes.titulo,
    })
    .from(consultoriaAgendamentos)
    .leftJoin(
      consultoriaPagamentos,
      eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      atendimentos,
      eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      avaliacoesAtendimento,
      and(
        eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
        eq(avaliacoesAtendimento.prestadorId, consultoriaAgendamentos.prestadorId),
      ),
    )
    .leftJoin(
      consultoriaConfiguracoes,
      eq(consultoriaConfiguracoes.id, consultoriaAgendamentos.configuracaoId),
    )
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)

  const eventos = linha.atendimentoId
    ? await db
        .select({
          id: atendimentoEventos.id,
          tipo: atendimentoEventos.tipo,
          descricao: atendimentoEventos.descricao,
          criadoEm: atendimentoEventos.createdAt,
        })
        .from(atendimentoEventos)
        .where(eq(atendimentoEventos.atendimentoId, linha.atendimentoId))
        .orderBy(asc(atendimentoEventos.createdAt))
    : []

  const janela = janelaDaVideochamada({
    inicioEm: linha.inicioEm,
    fimEm: linha.fimEm,
  })

  return {
    ...vestir(linha),
    servico: extras?.configuracaoTitulo ?? 'Consultoria online',
    canceladoEm: extras?.canceladoEm?.toISOString() ?? null,
    motivoCancelamento: extras?.motivoCancelamento ?? null,
    concluidoEm: extras?.concluidoEm?.toISOString() ?? null,
    remarcadoEm: extras?.remarcadoEm?.toISOString() ?? null,
    pagamento: extras?.pagamentoAprovadoEm
      ? {
          status: linha.pagamentoStatus ?? 'aprovado',
          referencia: linha.pagamentoReferencia,
          origem: extras.pagamentoOrigem ?? 'simulado',
          valorCentavos: extras.pagamentoValor ?? linha.valorCentavos,
          aprovadoEm: extras.pagamentoAprovadoEm.toISOString(),
        }
      : null,
    avaliacaoComentario: extras?.avaliacaoComentario ?? null,
    videochamada: {
      salaCriada: linha.temSala,
      salaCriadaEm: extras?.salaCriadaEm?.toISOString() ?? null,
      janelaAbreEm: janela.abreEm.toISOString(),
      janelaFechaEm: janela.fechaEm.toISOString(),
    },
    eventos: eventos.map((evento) => ({
      id: evento.id,
      tipo: evento.tipo,
      descricao: evento.descricao,
      criadoEm: evento.criadoEm.toISOString(),
    })),
  }
}

/** Os Profissionais que têm consultoria — alimenta o filtro, sem varrer contas. */
export async function listarPrestadoresComConsultoria() {
  return db
    .selectDistinct({
      id: consultoriaAgendamentos.prestadorId,
      nome: prestadorConta.nome,
    })
    .from(consultoriaAgendamentos)
    .innerJoin(
      prestadorConta,
      eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
    )
    .orderBy(asc(prestadorConta.nome))
}
