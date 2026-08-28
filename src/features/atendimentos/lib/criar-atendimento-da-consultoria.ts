import { eq } from 'drizzle-orm'
import {
  atendimentoEventos,
  atendimentoParticipantes,
  atendimentos,
  consultoriaAgendamentos,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { garantirClienteNaCarteira } from '@/features/clientes/lib/garantir-cliente-na-carteira'
import {
  STATUS_INICIAL_ATENDIMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
} from '../constants/atendimento'
import type { ExecutorDb } from './executor'
import { registrarManifestacaoDeContratacao } from './manifestacoes'
import { reservarProtocolo } from './protocolo'

export type AtendimentoDaConsultoria = {
  id: string
  protocolo: string
  jaExistia: boolean
}

const CODIGO_UNICIDADE_POSTGRES = '23505'

function ehViolacaoDeUnicidade(erro: unknown) {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: string }).code === CODIGO_UNICIDADE_POSTGRES
  )
}

async function buscarAtendimento(executor: ExecutorDb, agendamentoId: string) {
  const [registro] = await executor
    .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
    .from(atendimentos)
    .where(eq(atendimentos.consultoriaAgendamentoId, agendamentoId))
    .limit(1)
  return registro ?? null
}

/**
 * Garante o Atendimento operacional de uma consultoria agendada.
 *
 * Irmã de `garantirAtendimentoDaOportunidade` e de
 * `garantirAtendimentoDaContratacao`, e de propósito: as **três** portas de
 * entrada terminam na mesma estrutura — mesma tabela `atendimentos`, mesmo
 * gerador de protocolo, mesmos participantes, mesmo histórico, mesma
 * autorização, mesmo Kanban. A Consultoria Agendada é uma nova origem de
 * Atendimento, e não um sistema paralelo: nenhuma tabela é inventada aqui.
 *
 * A idempotência é a mesma e tem a mesma garantia final — o índice único
 * `atendimentos_consultoria_unico`. O `select` de conferência é só o caminho
 * rápido; quem decide sob concorrência é o banco, e quando ele recusa a segunda
 * inserção a gravação é desfeita até o savepoint e o registro do vencedor é
 * devolvido. Duplo clique, F5 e retry convergem para **um** protocolo.
 *
 * O que **não** é inventado: não há `contratacao_id` (nada saiu do catálogo),
 * não há `oportunidade_id` (não houve solicitação pública) e não há prazo —
 * consultoria tem hora marcada, não prazo de entrega. O horário combinado vive
 * no agendamento, que é para onde `consultoria_agendamento_id` aponta.
 */
export async function garantirAtendimentoDaConsultoria(
  executor: ExecutorDb,
  agendamentoId: string,
): Promise<AtendimentoDaConsultoria> {
  const existente = await buscarAtendimento(executor, agendamentoId)
  if (existente) return { ...existente, jaExistia: true }

  try {
    // Savepoint próprio: se o índice único recusar, só esta parte é desfeita e
    // a transação de quem chamou continua utilizável.
    return await executor.transaction(async (tx) => criar(tx, agendamentoId))
  } catch (erro) {
    if (!ehViolacaoDeUnicidade(erro)) throw erro
    const vencedor = await buscarAtendimento(executor, agendamentoId)
    if (!vencedor) throw erro
    return { ...vencedor, jaExistia: true }
  }
}

async function criar(
  tx: ExecutorDb,
  agendamentoId: string,
): Promise<AtendimentoDaConsultoria> {
  const [agendamento] = await tx
    .select({
      id: consultoriaAgendamentos.id,
      prestadorId: consultoriaAgendamentos.prestadorId,
      clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
      timezone: consultoriaAgendamentos.timezone,
      valorCentavos: consultoriaAgendamentos.valorCentavos,
      duracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
      descricao: consultoriaAgendamentos.descricao,
      empresaId: usuarios.empresaId,
    })
    .from(consultoriaAgendamentos)
    .innerJoin(usuarios, eq(usuarios.id, consultoriaAgendamentos.prestadorId))
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)

  if (!agendamento) {
    throw new Error(`Consultoria agendada ${agendamentoId} não encontrada.`)
  }

  /**
   * A área da carteira.
   *
   * `contabil` é o padrão histórico da plataforma e continua sendo o daqui: a
   * consultoria não declara área — quem declara é o cadastro do Profissional, e
   * traduzir tipo profissional em área da carteira seria inventar uma regra que
   * ainda não existe. Quando existir, ela vale para as três portas de entrada.
   */
  const carteiraId = await garantirClienteNaCarteira(tx, {
    prestadorId: agendamento.prestadorId,
    clienteUsuarioId: agendamento.clienteUsuarioId,
  })

  const protocolo = await reservarProtocolo(tx)
  const agora = new Date()

  const dataLegivel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: agendamento.timezone,
  }).format(agendamento.inicioEm)

  const [atendimento] = await tx
    .insert(atendimentos)
    .values({
      protocoloAno: protocolo.ano,
      protocoloSequencia: protocolo.sequencia,
      consultoriaAgendamentoId: agendamento.id,
      prestadorId: agendamento.prestadorId,
      responsavelId: agendamento.prestadorId,
      clienteUsuarioId: agendamento.clienteUsuarioId,
      clienteCarteiraId: carteiraId,
      empresaId: agendamento.empresaId,
      titulo: `Consultoria online · ${dataLegivel}`,
      // `consultoria` já é categoria conhecida do Atendimento. Nada novo é
      // inventado no vocabulário.
      categoria: 'consultoria',
      status: STATUS_INICIAL_ATENDIMENTO,
      /**
       * Sem prazo, e isso é o dado verdadeiro.
       *
       * `prazo_em` responde "até quando o trabalho precisa ficar pronto". Uma
       * consultoria não tem entrega: tem hora marcada, que é
       * `consultoria_agendamentos.inicio_em`. Copiar o horário para cá faria o
       * Kanban tratar o encontro como um vencimento e alertar sobre atraso de
       * uma coisa que não atrasa.
       */
      prazoEm: null,
    })
    .returning({ id: atendimentos.id, protocolo: atendimentos.protocolo })

  await tx.insert(atendimentoParticipantes).values({
    atendimentoId: atendimento.id,
    usuarioId: agendamento.prestadorId,
    papel: 'responsavel',
  })

  await tx.insert(atendimentoEventos).values([
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.servicoContratado,
      descricao: `Consultoria agendada para ${dataLegivel} · ${agendamento.duracaoMinutos} min · online`,
      autorId: agendamento.clienteUsuarioId,
      metadados: {
        consultoriaAgendamentoId: agendamento.id,
        inicioEm: agendamento.inicioEm.toISOString(),
        fimEm: agendamento.fimEm.toISOString(),
        timezone: agendamento.timezone,
        duracaoMinutos: agendamento.duracaoMinutos,
        valorCentavos: agendamento.valorCentavos,
        modalidade: 'online',
      },
      createdAt: agora,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoCriado,
      descricao: `Atendimento criado · protocolo ${atendimento.protocolo}`,
      autorId: null,
      metadados: { consultoriaAgendamentoId: agendamento.id },
      createdAt: agora,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.responsavelDefinido,
      descricao: 'Responsável inicial definido',
      autorId: agendamento.prestadorId,
      // Organização interna da equipe: não entra no histórico do Cliente.
      visivelCliente: false,
      metadados: { responsavelId: agendamento.prestadorId },
      createdAt: agora,
    },
  ])

  /**
   * O assunto que o Cliente escreveu abre o Protocolo.
   *
   * É o mesmo papel que a descrição da solicitação cumpre no caminho da
   * oportunidade e que a mensagem inicial cumpre no da contratação: o pedido
   * formal, escrito pelo Cliente, no lugar onde o Profissional vai procurá-lo
   * para se preparar. Ele não é pedido de novo, não vira público e chega aqui
   * pela primeira vez — até este instante ele só existia dentro da reserva.
   */
  await registrarManifestacaoDeContratacao(tx, {
    atendimentoId: atendimento.id,
    clienteUsuarioId: agendamento.clienteUsuarioId,
    conteudo: agendamento.descricao,
  })

  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.atendimentoCriado,
      entidade: 'atendimentos',
      registroAfetado: atendimento.id,
      autorId: agendamento.clienteUsuarioId,
      usuarioId: agendamento.prestadorId,
      empresaId: agendamento.empresaId,
      origem: 'sistema',
      metadados: {
        consultoriaAgendamentoId: agendamento.id,
        protocolo: atendimento.protocolo,
      },
    },
    tx,
  )

  return { ...atendimento, jaExistia: false }
}
