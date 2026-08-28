import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentos,
  avaliacoesAtendimento,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  usuarios,
} from '@/db/schema'
import type { PapelDoCiclo } from '../constants/ciclo'
import { avaliarAlteracao } from '../lib/ciclo'
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
    canceladoEm: consultoriaAgendamentos.canceladoEm,
    canceladoPor: consultoriaAgendamentos.canceladoPor,
    motivoCancelamento: consultoriaAgendamentos.motivoCancelamento,
    remarcacoes: consultoriaAgendamentos.remarcacoes,
    concluidoEm: consultoriaAgendamentos.concluidoEm,
    avaliacaoNota: avaliacoesAtendimento.nota,
    avaliacaoComentario: avaliacoesAtendimento.comentario,
    prestadorId: consultoriaAgendamentos.prestadorId,
    clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
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
      /**
       * A avaliação vem da tabela oficial da plataforma.
       *
       * Não há nota própria de consultoria: a reputação do Profissional é uma
       * só, e criar uma segunda média para este caminho faria o perfil público
       * discordar de si mesmo. O vínculo é pelo Atendimento — o mesmo que a
       * tela de avaliação já usa — e pelo Profissional avaliado.
       */
      .leftJoin(
        avaliacoesAtendimento,
        and(
          eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
          eq(avaliacoesAtendimento.prestadorId, consultoriaAgendamentos.prestadorId),
        ),
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
    futuras: futuras.map((r) => vestirParaCliente(r, agora)),
    passadas: passadas.map((r) => vestirParaCliente(r, agora)),
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
    canceladoEm: consultoriaAgendamentos.canceladoEm,
    canceladoPor: consultoriaAgendamentos.canceladoPor,
    motivoCancelamento: consultoriaAgendamentos.motivoCancelamento,
    remarcacoes: consultoriaAgendamentos.remarcacoes,
    concluidoEm: consultoriaAgendamentos.concluidoEm,
    avaliacaoNota: avaliacoesAtendimento.nota,
    avaliacaoComentario: avaliacoesAtendimento.comentario,
    prestadorId: consultoriaAgendamentos.prestadorId,
    clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
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
      /**
       * A avaliação vem da tabela oficial da plataforma.
       *
       * Não há nota própria de consultoria: a reputação do Profissional é uma
       * só, e criar uma segunda média para este caminho faria o perfil público
       * discordar de si mesmo. O vínculo é pelo Atendimento — o mesmo que a
       * tela de avaliação já usa — e pelo Profissional avaliado.
       */
      .leftJoin(
        avaliacoesAtendimento,
        and(
          eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
          eq(avaliacoesAtendimento.prestadorId, consultoriaAgendamentos.prestadorId),
        ),
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
    futuras: futuras.map((r) => vestirParaPrestador(r, agora)),
    passadas: passadas.map((r) => vestirParaPrestador(r, agora)),
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
  canceladoEm: Date | null
  canceladoPor: string | null
  motivoCancelamento: string | null
  remarcacoes: number
  concluidoEm: Date | null
  avaliacaoNota: number | null
  avaliacaoComentario: string | null
  prestadorId: string
  clienteUsuarioId: string
  prestadorNome: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
}, agora: Date): ConsultoriaDoClienteDTO {
  return {
    id: registro.id,
    prestadorNome: registro.prestadorNome,
    ...horariosLocais(registro),
    inicioEm: registro.inicioEm.toISOString(),
    fimEm: registro.fimEm.toISOString(),
    timezone: registro.timezone,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
    status: registro.status,
    ...cicloDoRegistro(registro, 'cliente', agora),
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
  canceladoEm: Date | null
  canceladoPor: string | null
  motivoCancelamento: string | null
  remarcacoes: number
  concluidoEm: Date | null
  avaliacaoNota: number | null
  avaliacaoComentario: string | null
  prestadorId: string
  clienteUsuarioId: string
  descricao: string
  clienteNome: string
  atendimentoId: string | null
  protocolo: string | null
  pagamentoStatus: string | null
}, agora: Date): ConsultoriaDoPrestadorDTO2 {
  return {
    id: registro.id,
    clienteNome: registro.clienteNome,
    ...horariosLocais(registro),
    inicioEm: registro.inicioEm.toISOString(),
    fimEm: registro.fimEm.toISOString(),
    timezone: registro.timezone,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
    status: registro.status,
    // O texto **inteiro** atravessa: quem corta é a tela, com "ver mais", e
    // não a consulta. Truncar aqui perderia informação que o Profissional
    // precisa para se preparar, e ele já tem direito de ler.
    descricao: registro.descricao,
    ...cicloDoRegistro(registro, 'prestador', agora),
    pagamentoStatus: registro.pagamentoStatus,
    atendimentoId: registro.atendimentoId,
    protocolo: registro.protocolo,
  }
}

/**
 * A parte do DTO que fala do ciclo: cancelamento, remarcações e prazo.
 *
 * Uma função só para as duas visões porque a regra é uma só — mudar o prazo do
 * Cliente não pode deixar a tela do Profissional dizendo outra coisa. O papel
 * entra como parâmetro justamente porque é o que diferencia o prazo, e não a
 * forma de calculá-lo.
 *
 * `podeAlterar` é desenho, nunca permissão: a ação recheca tudo no clique, com
 * o relógio dela. Uma tela aberta há uma hora mostra um botão desatualizado —
 * e o servidor recusa mesmo assim.
 */
function cicloDoRegistro(
  registro: {
    inicioEm: Date
    fimEm: Date
    status: string
    canceladoEm: Date | null
    canceladoPor: string | null
    motivoCancelamento: string | null
    remarcacoes: number
    concluidoEm: Date | null
    avaliacaoNota: number | null
    avaliacaoComentario: string | null
    prestadorId: string
    clienteUsuarioId: string
  },
  papel: PapelDoCiclo,
  agora: Date,
) {
  const canceladoPorPapel = !registro.canceladoPor
    ? null
    : registro.canceladoPor === registro.prestadorId
      ? ('prestador' as const)
      : registro.canceladoPor === registro.clienteUsuarioId
        ? ('cliente' as const)
        : null

  return {
    canceladoEm: registro.canceladoEm?.toISOString() ?? null,
    canceladoPorPapel,
    motivoCancelamento: registro.motivoCancelamento,
    remarcacoes: registro.remarcacoes,
    concluidoEm: registro.concluidoEm?.toISOString() ?? null,
    avaliacao:
      registro.avaliacaoNota === null
        ? null
        : { nota: registro.avaliacaoNota, comentario: registro.avaliacaoComentario },
    podeAlterar: avaliarAlteracao(registro, papel, agora).pode,
    /**
     * Concluir é do Profissional, e só depois do fim contratado.
     *
     * A fronteira é fechada: no instante exato do término já vale. O papel
     * entra porque o Cliente nunca conclui — mostrar-lhe o botão desabilitado
     * sugeriria um poder que ele não tem em momento nenhum.
     */
    podeConcluir:
      papel === 'prestador' &&
      registro.status === 'agendada' &&
      agora.getTime() >= registro.fimEm.getTime(),
  }
}
