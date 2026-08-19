import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoLeituras, notificacoes } from '@/db/schema'
import type {
  CanalLeitura,
  EscopoLeitura,
} from '../constants/atendimento'
import type { ExecutorDb } from './executor'

/** Marca-d'água de uma conversa: até quando aquela pessoa leu. */
export type MarcaDeLeitura = {
  recursoId: string
  canal: CanalLeitura
  lidoAte: Date
}

/** Chave da marca dentro do mapa devolvido por `obterMarcasDeLeitura`. */
export function chaveDaMarca(recursoId: string, canal: CanalLeitura) {
  return `${recursoId}:${canal}`
}

/**
 * Marcas de leitura de uma pessoa, em lote.
 *
 * Uma consulta para todos os Atendimentos da tela — o quadro carrega até 200
 * cards, e uma ida ao banco por card seria um problema de verdade.
 */
export async function obterMarcasDeLeitura(
  usuarioId: string,
  escopo: EscopoLeitura,
  recursoIds: string[],
): Promise<Map<string, Date>> {
  if (!recursoIds.length) return new Map()

  const linhas = await db
    .select({
      recursoId: atendimentoLeituras.recursoId,
      canal: atendimentoLeituras.canal,
      lidoAte: atendimentoLeituras.lidoAte,
    })
    .from(atendimentoLeituras)
    .where(
      and(
        eq(atendimentoLeituras.usuarioId, usuarioId),
        eq(atendimentoLeituras.escopo, escopo),
        inArray(atendimentoLeituras.recursoId, recursoIds),
      ),
    )

  return new Map(
    linhas.map((linha) => [
      chaveDaMarca(linha.recursoId, linha.canal as CanalLeitura),
      linha.lidoAte,
    ]),
  )
}

/**
 * Grava até onde a pessoa leu.
 *
 * A marca **nunca anda para trás**: `greatest` no `on conflict` garante que
 * reabrir uma conversa antiga, ou uma requisição atrasada chegando fora de
 * ordem, não ressuscite mensagens já lidas. Sem isso o badge vermelho voltaria
 * a aparecer sozinho, que é justamente o defeito que esta tabela existe para
 * evitar.
 */
export async function registrarLeitura(
  executor: ExecutorDb,
  {
    usuarioId,
    escopo,
    recursoId,
    canal,
    lidoAte,
    ultimaMensagemLidaId,
  }: {
    usuarioId: string
    escopo: EscopoLeitura
    recursoId: string
    canal: CanalLeitura
    lidoAte: Date
    ultimaMensagemLidaId?: string | null
  },
) {
  await executor
    .insert(atendimentoLeituras)
    .values({
      usuarioId,
      escopo,
      recursoId,
      canal,
      lidoAte,
      ultimaMensagemLidaId: ultimaMensagemLidaId ?? null,
    })
    .onConflictDoUpdate({
      target: [
        atendimentoLeituras.usuarioId,
        atendimentoLeituras.escopo,
        atendimentoLeituras.recursoId,
        atendimentoLeituras.canal,
      ],
      set: {
        lidoAte: sql`greatest(${atendimentoLeituras.lidoAte}, excluded.lido_ate)`,
        // A âncora só acompanha quando a marca de fato avançou.
        ultimaMensagemLidaId: sql`case when excluded.lido_ate >= ${atendimentoLeituras.lidoAte} then excluded.ultima_mensagem_lida_id else ${atendimentoLeituras.ultimaMensagemLidaId} end`,
        updatedAt: new Date(),
      },
    })
}

/** Uma mensagem qualquer, no mínimo que o cálculo de não lidas precisa. */
export type MensagemParaLeitura = {
  id: string
  autorId: string
  criadoEm: Date | string
}

export type ResumoNaoLidas = {
  total: number
  /** Primeira mensagem ainda não lida — o alvo do clique no badge vermelho. */
  primeiraNaoLidaId: string | null
}

/**
 * Quantas mensagens daquele canal a pessoa ainda não leu.
 *
 * Função pura: recebe as mensagens que a consulta já carregou e a marca da
 * pessoa. O quadro lista Atendimentos com as mensagens juntas — recontar no
 * banco seria uma segunda viagem para responder o que já está na memória.
 *
 * Mensagem escrita pela própria pessoa nunca conta como não lida para ela. Sem
 * essa regra, enviar uma resposta acenderia o próprio badge.
 */
export function calcularNaoLidas(
  mensagens: MensagemParaLeitura[],
  usuarioId: string,
  lidoAte: Date | undefined,
): ResumoNaoLidas {
  let total = 0
  let primeiraNaoLidaId: string | null = null

  for (const mensagem of mensagens) {
    if (mensagem.autorId === usuarioId) continue
    const quando =
      mensagem.criadoEm instanceof Date
        ? mensagem.criadoEm
        : new Date(mensagem.criadoEm)
    if (lidoAte && quando <= lidoAte) continue
    total += 1
    if (!primeiraNaoLidaId) primeiraNaoLidaId = mensagem.id
  }

  return { total, primeiraNaoLidaId }
}

/**
 * Silencia os avisos que a leitura resolveu.
 *
 * Abrir a conversa e continuar com o sino aceso seria pedir à pessoa que
 * marcasse à mão o que ela acabou de ler. Só as notificações **dela**, e só as
 * do recurso que ela abriu — a cláusula por destinatário é o que impede que
 * marcar como lida sirva de atalho para tocar em linha alheia.
 */
export async function marcarNotificacoesDoRecursoComoLidas(
  executor: ExecutorDb,
  {
    destinatarioId,
    recursoTipo,
    recursoId,
    tipos,
  }: {
    destinatarioId: string
    recursoTipo: 'atendimento' | 'convite'
    recursoId: string
    /** Restringe a certos tipos. Ausente, resolve todos os do recurso. */
    tipos?: string[]
  },
) {
  const condicoes = [
    eq(notificacoes.destinatarioId, destinatarioId),
    eq(notificacoes.recursoTipo, recursoTipo),
    eq(notificacoes.recursoId, recursoId),
    sql`${notificacoes.lidaEm} is null`,
  ]
  if (tipos?.length) condicoes.push(inArray(notificacoes.tipo, tipos))

  await executor
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(and(...condicoes))
}
