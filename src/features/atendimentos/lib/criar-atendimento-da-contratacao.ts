import { eq } from 'drizzle-orm'
import {
  atendimentoEventos,
  atendimentoParticipantes,
  atendimentos,
  contratacoesServico,
  servicos,
  usuarios,
} from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import {
  STATUS_INICIAL_ATENDIMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
} from '../constants/atendimento'
import { copiarChecklistDoCatalogo } from './checklist'
import type { ExecutorDb } from './executor'
import { registrarManifestacaoDeContratacao } from './manifestacoes'
import { reservarProtocolo } from './protocolo'

export type AtendimentoDaContratacao = {
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

async function buscarAtendimento(executor: ExecutorDb, contratacaoId: string) {
  const [registro] = await executor
    .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
    .from(atendimentos)
    .where(eq(atendimentos.contratacaoId, contratacaoId))
    .limit(1)
  return registro ?? null
}

/**
 * Garante o Atendimento operacional de uma contratação.
 *
 * É idempotente por definição: abrir, reabrir ou reprocessar a mesma
 * contratação devolve sempre o mesmo Atendimento. A garantia final não é o
 * `select` de conferência — que perderia numa corrida — e sim o índice único
 * `atendimentos_contratacao_unico`. Quando o índice recusa a segunda inserção,
 * a gravação é desfeita até o savepoint e o registro do vencedor é devolvido.
 *
 * O responsável inicial é o prestador da contratação, gravado nas duas pontas:
 * em `responsavel_id`, que é a resposta rápida de "de quem é isto", e em
 * `atendimento_participantes`, que é a lista preparada para receber os
 * colaboradores convidados no futuro.
 */
export async function garantirAtendimentoDaContratacao(
  executor: ExecutorDb,
  contratacaoId: string,
  /**
   * Mensagem que o Cliente escreveu ao contratar.
   *
   * Vira a primeira manifestação do Protocolo. Só é gravada quando o
   * Atendimento é criado agora: numa reprocessagem, o Protocolo existente é a
   * verdade e não deve receber uma cópia da mensagem.
   */
  mensagemInicial?: string | null,
): Promise<AtendimentoDaContratacao> {
  const existente = await buscarAtendimento(executor, contratacaoId)
  if (existente) return { ...existente, jaExistia: true }

  try {
    // Savepoint próprio: se o índice único recusar, só esta parte é desfeita e
    // a transação de quem chamou continua utilizável.
    return await executor.transaction(async (tx) =>
      criar(tx, contratacaoId, mensagemInicial),
    )
  } catch (erro) {
    if (!ehViolacaoDeUnicidade(erro)) throw erro
    const vencedor = await buscarAtendimento(executor, contratacaoId)
    if (!vencedor) throw erro
    return { ...vencedor, jaExistia: true }
  }
}

async function criar(
  tx: ExecutorDb,
  contratacaoId: string,
  mensagemInicial?: string | null,
): Promise<AtendimentoDaContratacao> {
  const [contratacao] = await tx
    .select({
      id: contratacoesServico.id,
      prestadorId: contratacoesServico.prestadorId,
      clienteUsuarioId: contratacoesServico.clienteUsuarioId,
      clienteCarteiraId: contratacoesServico.clienteCarteiraId,
      nomeServico: contratacoesServico.nomeServicoSnapshot,
      prazoEstimadoDias: contratacoesServico.prazoEstimadoDias,
      criadaEm: contratacoesServico.createdAt,
      categoria: servicos.categoria,
      checklistModelo: servicos.checklistModelo,
      empresaId: usuarios.empresaId,
    })
    .from(contratacoesServico)
    .innerJoin(servicos, eq(servicos.id, contratacoesServico.servicoId))
    .innerJoin(usuarios, eq(usuarios.id, contratacoesServico.prestadorId))
    .where(eq(contratacoesServico.id, contratacaoId))
    .limit(1)

  if (!contratacao) {
    throw new Error(`Contratação ${contratacaoId} não encontrada.`)
  }

  const protocolo = await reservarProtocolo(tx)
  const agora = new Date()
  // Prazo só existe quando a contratação traz um. Sem isso a coluna fica nula —
  // inventar uma data seria pior do que exibir "sem prazo".
  const prazoEm =
    contratacao.prazoEstimadoDias === null
      ? null
      : new Date(
          contratacao.criadaEm.getTime() +
            contratacao.prazoEstimadoDias * 24 * 60 * 60 * 1000,
        )

  const [atendimento] = await tx
    .insert(atendimentos)
    .values({
      protocoloAno: protocolo.ano,
      protocoloSequencia: protocolo.sequencia,
      contratacaoId: contratacao.id,
      prestadorId: contratacao.prestadorId,
      responsavelId: contratacao.prestadorId,
      clienteUsuarioId: contratacao.clienteUsuarioId,
      clienteCarteiraId: contratacao.clienteCarteiraId,
      empresaId: contratacao.empresaId,
      titulo: contratacao.nomeServico,
      categoria: contratacao.categoria,
      status: STATUS_INICIAL_ATENDIMENTO,
      prazoEm,
    })
    .returning({ id: atendimentos.id, protocolo: atendimentos.protocolo })

  await tx.insert(atendimentoParticipantes).values({
    atendimentoId: atendimento.id,
    usuarioId: contratacao.prestadorId,
    papel: 'responsavel',
  })

  await tx.insert(atendimentoEventos).values([
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.servicoContratado,
      descricao: `Serviço contratado pelo Cliente: ${contratacao.nomeServico}`,
      autorId: contratacao.clienteUsuarioId,
      metadados: { contratacaoId: contratacao.id },
      // Data real da contratação, não a de agora: o histórico conta o que
      // aconteceu, na hora em que aconteceu.
      createdAt: contratacao.criadaEm,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoCriado,
      descricao: `Atendimento criado · protocolo ${atendimento.protocolo}`,
      autorId: null,
      metadados: { contratacaoId: contratacao.id },
      createdAt: agora,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.responsavelDefinido,
      descricao: 'Responsável inicial definido',
      autorId: contratacao.prestadorId,
      // Organização interna da equipe: não entra no histórico do Cliente.
      visivelCliente: false,
      metadados: { responsavelId: contratacao.prestadorId },
      createdAt: agora,
    },
  ])

  // O checklist do Atendimento nasce como cópia do modelo que o serviço tinha
  // agora — e não como referência a ele. Editar o catálogo amanhã não reescreve
  // o roteiro combinado com este Cliente.
  await copiarChecklistDoCatalogo(tx, {
    atendimentoId: atendimento.id,
    etapas: contratacao.checklistModelo ?? [],
  })

  // A mensagem escrita na contratação abre o **Protocolo**: ela é a solicitação
  // formal do Cliente, o registro do que ele pediu. Não é gravada também na
  // Conversa — o mesmo texto nos dois canais faria o Cliente ver duas vezes a
  // única coisa que escreveu uma vez. A Conversa começa vazia.
  if (mensagemInicial?.trim()) {
    await registrarManifestacaoDeContratacao(tx, {
      atendimentoId: atendimento.id,
      clienteUsuarioId: contratacao.clienteUsuarioId,
      conteudo: mensagemInicial,
    })
  }

  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.atendimentoCriado,
      entidade: 'atendimentos',
      registroAfetado: atendimento.id,
      autorId: contratacao.clienteUsuarioId,
      usuarioId: contratacao.prestadorId,
      empresaId: contratacao.empresaId,
      origem: 'sistema',
      metadados: {
        contratacaoId: contratacao.id,
        protocolo: atendimento.protocolo,
      },
    },
    tx,
  )

  return { ...atendimento, jaExistia: false }
}
