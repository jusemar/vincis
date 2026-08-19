import { and, asc, eq, max, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoChecklistItens, atendimentoEventos } from '@/db/schema'
import {
  LIMITE_ITENS_CHECKLIST,
  TIPOS_EVENTO_ATENDIMENTO,
  type OrigemItemChecklist,
  type VisibilidadeChecklist,
} from '../constants/atendimento'
import { obterAcessoAtendimento } from './autorizacao'
import type { ExecutorDb } from './executor'

export { calcularProgresso } from './progresso-checklist'

export const TAMANHO_MAXIMO_ETAPA = 160

export type ResultadoChecklist =
  | { sucesso: true; id?: string }
  | {
      sucesso: false
      motivo: 'sem-acesso' | 'vazio' | 'nao-encontrado' | 'limite'
    }

/**
 * Quem administra o checklist.
 *
 * A equipe do Atendimento: prestador dono, responsável e participantes. O
 * Cliente acompanha as etapas públicas, mas não cria, não marca e não remove —
 * a recusa fica no servidor, não na ausência do botão.
 */
async function exigirEquipe(atendimentoId: string, usuarioId: string) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso || acesso.vinculo === 'cliente') return null
  return acesso
}

async function registrarEvento(
  executor: ExecutorDb,
  {
    atendimentoId,
    tipo,
    descricao,
    autorId,
    visivelCliente,
    metadados,
  }: {
    atendimentoId: string
    tipo: string
    descricao: string
    autorId: string | null
    visivelCliente: boolean
    metadados?: Record<string, unknown>
  },
) {
  await executor.insert(atendimentoEventos).values({
    atendimentoId,
    tipo,
    descricao,
    autorId,
    visivelCliente,
    metadados: metadados ?? {},
  })
}

/**
 * Copia para o Atendimento as etapas que o serviço tinha no catálogo.
 *
 * Roda dentro da transação da contratação. É uma cópia, não uma referência: a
 * partir daqui o catálogo pode mudar à vontade que este Atendimento continua
 * com o roteiro combinado. Serviço sem checklist padrão simplesmente não cria
 * etapa nenhuma — melhor nenhum checklist do que um inventado.
 */
export async function copiarChecklistDoCatalogo(
  tx: ExecutorDb,
  {
    atendimentoId,
    etapas,
  }: { atendimentoId: string; etapas: string[] },
) {
  const limpas = etapas
    .map((etapa) => etapa.trim().slice(0, TAMANHO_MAXIMO_ETAPA))
    .filter(Boolean)
    .slice(0, LIMITE_ITENS_CHECKLIST)

  if (!limpas.length) return 0

  await tx.insert(atendimentoChecklistItens).values(
    limpas.map((titulo, indice) => ({
      atendimentoId,
      titulo,
      ordem: indice,
      origem: 'catalogo' as const,
      visibilidade: 'cliente' as const,
    })),
  )

  await registrarEvento(tx, {
    atendimentoId,
    tipo: TIPOS_EVENTO_ATENDIMENTO.checklistCriado,
    descricao: `Checklist do serviço criado com ${limpas.length} etapa${limpas.length > 1 ? 's' : ''}`,
    autorId: null,
    visivelCliente: true,
    metadados: { etapas: limpas.length },
  })

  return limpas.length
}

async function proximaOrdem(executor: ExecutorDb, atendimentoId: string) {
  const [linha] = await executor
    .select({ maior: max(atendimentoChecklistItens.ordem) })
    .from(atendimentoChecklistItens)
    .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
  return (linha?.maior ?? -1) + 1
}

async function contarItens(executor: ExecutorDb, atendimentoId: string) {
  const [linha] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(atendimentoChecklistItens)
    .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
  return linha?.total ?? 0
}

/**
 * Acrescenta uma etapa ao checklist do Atendimento.
 *
 * Serve tanto para a equipe organizar o próprio trabalho quanto para transformar
 * um pedido feito ao Cliente numa etapa acompanhável — daí o parâmetro `origem`.
 */
export async function adicionarItemDoChecklist({
  atendimentoId,
  usuarioId,
  titulo,
  visibilidade = 'cliente',
  origem = 'equipe',
  executor,
}: {
  atendimentoId: string
  usuarioId: string
  titulo: string
  visibilidade?: VisibilidadeChecklist
  origem?: OrigemItemChecklist
  /** Transação em curso, quando a etapa nasce junto de outra operação. */
  executor?: ExecutorDb
}): Promise<ResultadoChecklist> {
  const texto = titulo.trim().slice(0, TAMANHO_MAXIMO_ETAPA)
  if (!texto) return { sucesso: false, motivo: 'vazio' }

  if (!executor) {
    const acesso = await exigirEquipe(atendimentoId, usuarioId)
    if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }
  }

  const alvo = executor ?? db
  if ((await contarItens(alvo, atendimentoId)) >= LIMITE_ITENS_CHECKLIST) {
    return { sucesso: false, motivo: 'limite' }
  }

  const ordem = await proximaOrdem(alvo, atendimentoId)
  const [item] = await alvo
    .insert(atendimentoChecklistItens)
    .values({ atendimentoId, titulo: texto, ordem, visibilidade, origem })
    .returning({ id: atendimentoChecklistItens.id })

  await registrarEvento(alvo, {
    atendimentoId,
    tipo: TIPOS_EVENTO_ATENDIMENTO.checklistItemAdicionado,
    descricao: `Etapa adicionada ao checklist: ${texto}`,
    autorId: usuarioId,
    // Etapa interna não é anunciada ao Cliente nem pelo histórico.
    visivelCliente: visibilidade === 'cliente',
    metadados: { itemId: item.id, visibilidade, origem },
  })

  return { sucesso: true, id: item.id }
}

async function obterItem(itemId: string) {
  const [item] = await db
    .select({
      id: atendimentoChecklistItens.id,
      atendimentoId: atendimentoChecklistItens.atendimentoId,
      titulo: atendimentoChecklistItens.titulo,
      concluido: atendimentoChecklistItens.concluido,
      visibilidade: atendimentoChecklistItens.visibilidade,
    })
    .from(atendimentoChecklistItens)
    .where(eq(atendimentoChecklistItens.id, itemId))
    .limit(1)
  return item ?? null
}

/**
 * Marca uma etapa como concluída — ou a reabre.
 *
 * Concluir é ato de quem executa. Mensagem do Cliente não conclui etapa: quem
 * confere se o documento chegou e serve é a equipe, e é ela que marca.
 */
export async function alternarItemDoChecklist({
  itemId,
  usuarioId,
  concluido,
}: {
  itemId: string
  usuarioId: string
  concluido: boolean
}): Promise<ResultadoChecklist> {
  const item = await obterItem(itemId)
  if (!item) return { sucesso: false, motivo: 'nao-encontrado' }

  const acesso = await exigirEquipe(item.atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  if (item.concluido === concluido) return { sucesso: true, id: item.id }

  await db.transaction(async (tx) => {
    await tx
      .update(atendimentoChecklistItens)
      .set({
        concluido,
        concluidoEm: concluido ? new Date() : null,
        concluidoPor: concluido ? usuarioId : null,
        updatedAt: new Date(),
      })
      .where(eq(atendimentoChecklistItens.id, itemId))

    await registrarEvento(tx, {
      atendimentoId: item.atendimentoId,
      tipo: concluido
        ? TIPOS_EVENTO_ATENDIMENTO.checklistItemConcluido
        : TIPOS_EVENTO_ATENDIMENTO.checklistItemReaberto,
      descricao: concluido
        ? `Etapa concluída: ${item.titulo}`
        : `Etapa reaberta: ${item.titulo}`,
      autorId: usuarioId,
      visivelCliente: item.visibilidade === 'cliente',
      metadados: { itemId },
    })
  })

  return { sucesso: true, id: itemId }
}

/** Renomeia uma etapa. O texto é do roteiro, não do histórico: nada é perdido. */
export async function renomearItemDoChecklist({
  itemId,
  usuarioId,
  titulo,
}: {
  itemId: string
  usuarioId: string
  titulo: string
}): Promise<ResultadoChecklist> {
  const texto = titulo.trim().slice(0, TAMANHO_MAXIMO_ETAPA)
  if (!texto) return { sucesso: false, motivo: 'vazio' }

  const item = await obterItem(itemId)
  if (!item) return { sucesso: false, motivo: 'nao-encontrado' }

  const acesso = await exigirEquipe(item.atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  await db
    .update(atendimentoChecklistItens)
    .set({ titulo: texto, updatedAt: new Date() })
    .where(eq(atendimentoChecklistItens.id, itemId))

  return { sucesso: true, id: itemId }
}

/** Remove uma etapa do checklist, deixando o registro no histórico. */
export async function removerItemDoChecklist({
  itemId,
  usuarioId,
}: {
  itemId: string
  usuarioId: string
}): Promise<ResultadoChecklist> {
  const item = await obterItem(itemId)
  if (!item) return { sucesso: false, motivo: 'nao-encontrado' }

  const acesso = await exigirEquipe(item.atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  await db.transaction(async (tx) => {
    await tx
      .delete(atendimentoChecklistItens)
      .where(eq(atendimentoChecklistItens.id, itemId))

    await registrarEvento(tx, {
      atendimentoId: item.atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.checklistItemRemovido,
      descricao: `Etapa removida do checklist: ${item.titulo}`,
      autorId: usuarioId,
      visivelCliente: item.visibilidade === 'cliente',
      metadados: { itemId },
    })
  })

  return { sucesso: true, id: itemId }
}

/**
 * Reordena as etapas.
 *
 * Recebe a ordem completa e regrava a posição de cada uma: é o mesmo gesto de
 * arrastar a lista inteira, e evita o vaivém de trocas duas a duas. Ids que não
 * sejam deste Atendimento são ignorados.
 */
export async function reordenarChecklist({
  atendimentoId,
  usuarioId,
  ordemDosItens,
}: {
  atendimentoId: string
  usuarioId: string
  ordemDosItens: string[]
}): Promise<ResultadoChecklist> {
  const acesso = await exigirEquipe(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  await db.transaction(async (tx) => {
    for (const [indice, itemId] of ordemDosItens.entries()) {
      await tx
        .update(atendimentoChecklistItens)
        .set({ ordem: indice, updatedAt: new Date() })
        .where(
          and(
            eq(atendimentoChecklistItens.id, itemId),
            eq(atendimentoChecklistItens.atendimentoId, atendimentoId),
          ),
        )
    }
  })

  return { sucesso: true }
}

/**
 * Etapas de um Atendimento, no recorte de quem pergunta.
 *
 * O Cliente recebe só as públicas — a etapa interna não é selecionada, e por
 * isso não existe no objeto que atravessa para o navegador dele.
 */
export async function listarChecklistDoAtendimento(
  atendimentoId: string,
  { somentePublicas }: { somentePublicas: boolean },
) {
  return await db
    .select({
      id: atendimentoChecklistItens.id,
      titulo: atendimentoChecklistItens.titulo,
      concluido: atendimentoChecklistItens.concluido,
      visibilidade: atendimentoChecklistItens.visibilidade,
      origem: atendimentoChecklistItens.origem,
      ordem: atendimentoChecklistItens.ordem,
    })
    .from(atendimentoChecklistItens)
    .where(
      somentePublicas
        ? and(
            eq(atendimentoChecklistItens.atendimentoId, atendimentoId),
            eq(atendimentoChecklistItens.visibilidade, 'cliente'),
          )
        : eq(atendimentoChecklistItens.atendimentoId, atendimentoId),
    )
    .orderBy(asc(atendimentoChecklistItens.ordem))
}
