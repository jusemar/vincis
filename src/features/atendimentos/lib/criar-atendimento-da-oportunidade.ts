import { and, eq } from 'drizzle-orm'
import {
  atendimentoArquivos,
  atendimentoEventos,
  atendimentoParticipantes,
  atendimentos,
  oportunidadeArquivos,
  oportunidadePropostas,
  oportunidades,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { garantirClienteNaCarteira } from '@/features/clientes/lib/garantir-cliente-na-carteira'
import {
  AREA_CARTEIRA_DA_OPORTUNIDADE,
  CATEGORIA_ATENDIMENTO_DA_OPORTUNIDADE,
  type CategoriaOportunidade,
} from '@/features/oportunidades/constants/oportunidade'
import {
  STATUS_INICIAL_ATENDIMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
} from '../constants/atendimento'
import type { ExecutorDb } from './executor'
import { registrarManifestacaoDeContratacao } from './manifestacoes'
import { reservarProtocolo } from './protocolo'

export type AtendimentoDaOportunidade = {
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

async function buscarAtendimento(executor: ExecutorDb, oportunidadeId: string) {
  const [registro] = await executor
    .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
    .from(atendimentos)
    .where(eq(atendimentos.oportunidadeId, oportunidadeId))
    .limit(1)
  return registro ?? null
}

/**
 * Garante o Atendimento operacional de uma oportunidade paga.
 *
 * Gêmea de `garantirAtendimentoDaContratacao`, e de propósito: as duas portas
 * de entrada terminam na **mesma** estrutura — mesmo `atendimentos`, mesmo
 * gerador de protocolo, mesmos participantes, mesmo histórico, mesma
 * autorização, mesmo Kanban. Não existe um segundo sistema de Atendimento para
 * as Oportunidades, e é por isso que este arquivo não inventa nenhuma tabela.
 *
 * A idempotência é a mesma e tem a mesma garantia final: o índice único
 * `atendimentos_oportunidade_unico`. O `select` de conferência é só o caminho
 * rápido; quem realmente decide sob concorrência é o banco, e quando ele recusa
 * a segunda inserção a gravação é desfeita até o savepoint e o registro do
 * vencedor é devolvido.
 *
 * O que **não** é inventado aqui: não existe `contratacao_id` (o acordo nasceu
 * de uma proposta, não do catálogo), não existe checklist de modelo (nenhum
 * serviço do catálogo foi contratado — o Atendimento começa sem roteiro e o
 * prestador monta o dele) e o prazo só existe quando a proposta trouxe um.
 */
export async function garantirAtendimentoDaOportunidade(
  executor: ExecutorDb,
  oportunidadeId: string,
): Promise<AtendimentoDaOportunidade> {
  const existente = await buscarAtendimento(executor, oportunidadeId)
  if (existente) return { ...existente, jaExistia: true }

  try {
    // Savepoint próprio: se o índice único recusar, só esta parte é desfeita e
    // a transação de quem chamou continua utilizável.
    return await executor.transaction(async (tx) => criar(tx, oportunidadeId))
  } catch (erro) {
    if (!ehViolacaoDeUnicidade(erro)) throw erro
    const vencedor = await buscarAtendimento(executor, oportunidadeId)
    if (!vencedor) throw erro
    return { ...vencedor, jaExistia: true }
  }
}

async function criar(
  tx: ExecutorDb,
  oportunidadeId: string,
): Promise<AtendimentoDaOportunidade> {
  const [acordo] = await tx
    .select({
      oportunidadeId: oportunidades.id,
      categoria: oportunidades.categoria,
      titulo: oportunidades.titulo,
      descricao: oportunidades.descricao,
      especialidades: oportunidades.especialidades,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      propostaId: oportunidadePropostas.id,
      prestadorId: oportunidadePropostas.prestadorId,
      prazoEstimadoDias: oportunidadePropostas.prazoEstimadoDias,
      valorAcordadoCentavos: oportunidadePropostas.valorAcordadoCentavos,
      aceitaEm: oportunidadePropostas.aceitaEm,
      empresaId: usuarios.empresaId,
    })
    .from(oportunidades)
    .innerJoin(
      oportunidadePropostas,
      eq(oportunidadePropostas.oportunidadeId, oportunidades.id),
    )
    .innerJoin(usuarios, eq(usuarios.id, oportunidadePropostas.prestadorId))
    .where(
      and(
        eq(oportunidades.id, oportunidadeId),
        eq(oportunidadePropostas.status, 'aceita'),
      ),
    )
    .limit(1)

  if (!acordo) {
    throw new Error(
      `Oportunidade ${oportunidadeId} não tem acordo comercial fechado.`,
    )
  }

  const categoria = acordo.categoria as CategoriaOportunidade
  const carteiraId = await garantirClienteNaCarteira(tx, {
    prestadorId: acordo.prestadorId,
    clienteUsuarioId: acordo.clienteUsuarioId,
    area: AREA_CARTEIRA_DA_OPORTUNIDADE[categoria] ?? 'contabil',
  })

  const protocolo = await reservarProtocolo(tx)
  const agora = new Date()
  const fechadoEm = acordo.aceitaEm ?? agora
  // Prazo só existe quando a proposta aceita prometeu um. Sem isso a coluna
  // fica nula — inventar uma data seria pior do que exibir "sem prazo".
  const prazoEm =
    acordo.prazoEstimadoDias === null
      ? null
      : new Date(
          fechadoEm.getTime() + acordo.prazoEstimadoDias * 24 * 60 * 60 * 1000,
        )

  const [atendimento] = await tx
    .insert(atendimentos)
    .values({
      protocoloAno: protocolo.ano,
      protocoloSequencia: protocolo.sequencia,
      oportunidadeId: acordo.oportunidadeId,
      prestadorId: acordo.prestadorId,
      responsavelId: acordo.prestadorId,
      clienteUsuarioId: acordo.clienteUsuarioId,
      clienteCarteiraId: carteiraId,
      empresaId: acordo.empresaId,
      titulo: acordo.titulo,
      categoria:
        CATEGORIA_ATENDIMENTO_DA_OPORTUNIDADE[categoria] ?? acordo.categoria,
      status: STATUS_INICIAL_ATENDIMENTO,
      prazoEm,
    })
    .returning({ id: atendimentos.id, protocolo: atendimentos.protocolo })

  await tx.insert(atendimentoParticipantes).values({
    atendimentoId: atendimento.id,
    usuarioId: acordo.prestadorId,
    papel: 'responsavel',
  })

  await tx.insert(atendimentoEventos).values([
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.servicoContratado,
      descricao: `Acordo fechado na solicitação de orçamento: ${acordo.titulo}`,
      autorId: acordo.clienteUsuarioId,
      metadados: {
        oportunidadeId: acordo.oportunidadeId,
        propostaId: acordo.propostaId,
        valorAcordadoCentavos: acordo.valorAcordadoCentavos,
        especialidades: acordo.especialidades ?? [],
      },
      // Data real do acordo, não a de agora: o histórico conta o que
      // aconteceu, na hora em que aconteceu.
      createdAt: fechadoEm,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoCriado,
      descricao: `Atendimento criado · protocolo ${atendimento.protocolo}`,
      autorId: null,
      metadados: { oportunidadeId: acordo.oportunidadeId },
      createdAt: agora,
    },
    {
      atendimentoId: atendimento.id,
      tipo: TIPOS_EVENTO_ATENDIMENTO.responsavelDefinido,
      descricao: 'Responsável inicial definido',
      autorId: acordo.prestadorId,
      // Organização interna da equipe: não entra no histórico do Cliente.
      visivelCliente: false,
      metadados: { responsavelId: acordo.prestadorId },
      createdAt: agora,
    },
  ])

  await levarAnexosDaSolicitacao(tx, {
    oportunidadeId: acordo.oportunidadeId,
    atendimentoId: atendimento.id,
  })

  // A descrição da solicitação abre o **Protocolo**: ela é o pedido formal do
  // Cliente, o registro do que ele precisa — exatamente o papel que a mensagem
  // da contratação cumpre no outro caminho. A Conversa começa vazia.
  await registrarManifestacaoDeContratacao(tx, {
    atendimentoId: atendimento.id,
    clienteUsuarioId: acordo.clienteUsuarioId,
    conteudo: acordo.descricao,
  })

  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.atendimentoCriado,
      entidade: 'atendimentos',
      registroAfetado: atendimento.id,
      autorId: acordo.clienteUsuarioId,
      usuarioId: acordo.prestadorId,
      empresaId: acordo.empresaId,
      origem: 'sistema',
      metadados: {
        oportunidadeId: acordo.oportunidadeId,
        propostaId: acordo.propostaId,
        protocolo: atendimento.protocolo,
      },
    },
    tx,
  )

  return { ...atendimento, jaExistia: false }
}

/**
 * Traz para o Atendimento os anexos que o Cliente enviou na solicitação.
 *
 * O que viaja é a **referência** ao objeto no armazenamento privado (`chave`),
 * nunca uma segunda cópia dos bytes: o mesmo arquivo passa a ser alcançável
 * pela rota autorizada do Atendimento, que confere o vínculo antes de servir
 * qualquer conteúdo. Reenviar produziria duas cópias do mesmo documento com
 * dois custos de storage e duas verdades sobre "o contrato social que o Cliente
 * mandou".
 *
 * O remetente continua sendo o Cliente e a origem continua sendo `cliente`,
 * porque foi ele quem enviou — o Atendimento herda o fato, não o reescreve.
 */
async function levarAnexosDaSolicitacao(
  tx: ExecutorDb,
  {
    oportunidadeId,
    atendimentoId,
  }: { oportunidadeId: string; atendimentoId: string },
) {
  const anexos = await tx
    .select({
      nome: oportunidadeArquivos.nome,
      tipoMime: oportunidadeArquivos.tipoMime,
      tamanhoBytes: oportunidadeArquivos.tamanhoBytes,
      remetenteId: oportunidadeArquivos.remetenteId,
      chave: oportunidadeArquivos.chave,
      createdAt: oportunidadeArquivos.createdAt,
    })
    .from(oportunidadeArquivos)
    .where(eq(oportunidadeArquivos.oportunidadeId, oportunidadeId))

  if (!anexos.length) return 0

  await tx.insert(atendimentoArquivos).values(
    anexos.map((anexo) => ({
      atendimentoId,
      nome: anexo.nome,
      tipoMime: anexo.tipoMime,
      tamanhoBytes: anexo.tamanhoBytes,
      origem: 'cliente' as const,
      finalidade: 'anexo' as const,
      remetenteId: anexo.remetenteId,
      chave: anexo.chave,
      createdAt: anexo.createdAt,
    })),
  )

  await tx.insert(atendimentoEventos).values({
    atendimentoId,
    tipo: TIPOS_EVENTO_ATENDIMENTO.arquivoAnexado,
    descricao:
      anexos.length === 1
        ? 'Anexo da solicitação de orçamento incorporado ao Atendimento'
        : `${anexos.length} anexos da solicitação de orçamento incorporados ao Atendimento`,
    autorId: anexos[0].remetenteId,
    metadados: { oportunidadeId, total: anexos.length },
  })

  return anexos.length
}
