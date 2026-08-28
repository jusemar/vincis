import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentos,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  usuarios,
} from '@/db/schema'
import {
  dataLocalDoInstante,
  horaDeMinutos,
  minutosLocaisDoInstante,
} from '../lib/tempo'
import type {
  ConsultoriaDoClienteDTO,
  ConsultoriaDoPrestadorDTO2,
} from '../types/agendamento'

const prestadorConta = alias(usuarios, 'prestador_conta')
const clienteConta = alias(usuarios, 'cliente_conta')

/**
 * As consultorias contratadas, do ponto de vista de quem as vê.
 *
 * ## Onde mora a autorização
 *
 * No `where`, e em lugar nenhum além dele. Cada consulta filtra pela coluna que
 * define posse — `cliente_usuario_id` numa, `prestador_id` na outra — e o id
 * vem sempre da sessão de quem chamou, nunca da requisição. Não existe uma
 * consulta "todas as consultorias" que depois alguém filtra na tela: a
 * consultoria alheia não é carregada, não é serializada e não chega ao
 * navegador para ser escondida por CSS.
 *
 * ## Futuras e passadas, separadas no SQL
 *
 * A divisa é `inicio_em` contra o instante atual — comparação de instantes, e
 * não de texto de data, que erraria na virada do dia e em qualquer fuso
 * diferente do da máquina. Futuras sobem da mais próxima para a mais distante
 * (é a próxima que importa); passadas descem da mais recente (é a última que se
 * procura).
 *
 * ## Por que o vínculo é estrutural
 *
 * O Atendimento é encontrado por `consultoria_agendamento_id`, a coluna que a
 * etapa do pagamento criou. Deduzir a consultoria por categoria, por protocolo
 * ou pelo texto do título seria adivinhação que quebra no primeiro Atendimento
 * parecido.
 */

/** O que o Cliente enxerga. Sem a descrição: ela vive dentro do Protocolo. */
export async function listarConsultoriasDoCliente(
  clienteUsuarioId: string,
  agora: Date = new Date(),
): Promise<{
  futuras: ConsultoriaDoClienteDTO[]
  passadas: ConsultoriaDoClienteDTO[]
}> {
  const selecao = {
    id: consultoriaAgendamentos.id,
    inicioEm: consultoriaAgendamentos.inicioEm,
    fimEm: consultoriaAgendamentos.fimEm,
    timezone: consultoriaAgendamentos.timezone,
    duracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
    valorCentavos: consultoriaAgendamentos.valorCentavos,
    status: consultoriaAgendamentos.status,
    prestadorNome: prestadorConta.nome,
    atendimentoId: atendimentos.id,
    protocolo: atendimentos.protocolo,
    pagamentoStatus: consultoriaPagamentos.status,
  }

  const base = () =>
    db
      .select(selecao)
      .from(consultoriaAgendamentos)
      .innerJoin(
        prestadorConta,
        eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
      )
      // `left join` de propósito: o Atendimento é criado na mesma transação da
      // contratação, mas a consultoria não deixa de existir para o Cliente se
      // um dia esse vínculo faltar — ela apareceria sem o botão, e não sumiria.
      .leftJoin(
        atendimentos,
        eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
      )
      .leftJoin(
        consultoriaPagamentos,
        eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
      )

  const [futuras, passadas] = await Promise.all([
    base()
      .where(
        and(
          eq(consultoriaAgendamentos.clienteUsuarioId, clienteUsuarioId),
          gte(consultoriaAgendamentos.inicioEm, agora),
        ),
      )
      .orderBy(asc(consultoriaAgendamentos.inicioEm)),
    base()
      .where(
        and(
          eq(consultoriaAgendamentos.clienteUsuarioId, clienteUsuarioId),
          lt(consultoriaAgendamentos.inicioEm, agora),
        ),
      )
      .orderBy(desc(consultoriaAgendamentos.inicioEm)),
  ])

  return {
    futuras: futuras.map(vestirParaCliente),
    passadas: passadas.map(vestirParaCliente),
  }
}

/** O que o Profissional enxerga — com o assunto, que é para ele se preparar. */
export async function listarConsultoriasDoPrestador(
  prestadorId: string,
  agora: Date = new Date(),
): Promise<{
  futuras: ConsultoriaDoPrestadorDTO2[]
  passadas: ConsultoriaDoPrestadorDTO2[]
}> {
  const selecao = {
    id: consultoriaAgendamentos.id,
    inicioEm: consultoriaAgendamentos.inicioEm,
    fimEm: consultoriaAgendamentos.fimEm,
    timezone: consultoriaAgendamentos.timezone,
    duracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
    valorCentavos: consultoriaAgendamentos.valorCentavos,
    status: consultoriaAgendamentos.status,
    descricao: consultoriaAgendamentos.descricao,
    clienteNome: clienteConta.nome,
    atendimentoId: atendimentos.id,
    protocolo: atendimentos.protocolo,
    pagamentoStatus: consultoriaPagamentos.status,
  }

  const base = () =>
    db
      .select(selecao)
      .from(consultoriaAgendamentos)
      .innerJoin(
        clienteConta,
        eq(clienteConta.id, consultoriaAgendamentos.clienteUsuarioId),
      )
      .leftJoin(
        atendimentos,
        eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
      )
      .leftJoin(
        consultoriaPagamentos,
        eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
      )

  const [futuras, passadas] = await Promise.all([
    base()
      .where(
        and(
          eq(consultoriaAgendamentos.prestadorId, prestadorId),
          gte(consultoriaAgendamentos.inicioEm, agora),
        ),
      )
      .orderBy(asc(consultoriaAgendamentos.inicioEm)),
    base()
      .where(
        and(
          eq(consultoriaAgendamentos.prestadorId, prestadorId),
          lt(consultoriaAgendamentos.inicioEm, agora),
        ),
      )
      .orderBy(desc(consultoriaAgendamentos.inicioEm)),
  ])

  return {
    futuras: futuras.map(vestirParaPrestador),
    passadas: passadas.map(vestirParaPrestador),
  }
}

/**
 * As horas de parede vêm do fuso gravado **na consultoria**.
 *
 * Não do relógio do servidor, não do navegador de quem olha e nem da
 * configuração atual do Profissional — que ele pode ter mudado depois. Quem
 * contratou 14:30 em `America/Sao_Paulo` vê 14:30, esteja onde estiver. O
 * `timezone` acompanha o DTO justamente para a tela poder dizer qual é, quando
 * fizer diferença.
 */
function horariosLocais(registro: {
  inicioEm: Date
  fimEm: Date
  timezone: string
}) {
  return {
    data: dataLocalDoInstante(registro.inicioEm, registro.timezone),
    inicio: horaDeMinutos(
      minutosLocaisDoInstante(registro.inicioEm, registro.timezone),
    ),
    fim: horaDeMinutos(minutosLocaisDoInstante(registro.fimEm, registro.timezone)),
  }
}

function vestirParaCliente(registro: {
  id: string
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  status: string
  prestadorNome: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
}): ConsultoriaDoClienteDTO {
  return {
    id: registro.id,
    prestadorNome: registro.prestadorNome,
    ...horariosLocais(registro),
    inicioEm: registro.inicioEm.toISOString(),
    timezone: registro.timezone,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
    status: registro.status,
    pagamentoStatus: registro.pagamentoStatus,
    atendimentoId: registro.atendimentoId,
    protocolo: registro.protocolo,
  }
}

function vestirParaPrestador(registro: {
  id: string
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  status: string
  descricao: string
  clienteNome: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
}): ConsultoriaDoPrestadorDTO2 {
  return {
    id: registro.id,
    clienteNome: registro.clienteNome,
    ...horariosLocais(registro),
    inicioEm: registro.inicioEm.toISOString(),
    timezone: registro.timezone,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
    status: registro.status,
    // O texto **inteiro** atravessa: quem corta é a tela, com "ver mais", e
    // não a consulta. Truncar aqui perderia informação que o Profissional
    // precisa para se preparar, e ele já tem direito de ler.
    descricao: registro.descricao,
    pagamentoStatus: registro.pagamentoStatus,
    atendimentoId: registro.atendimentoId,
    protocolo: registro.protocolo,
  }
}
