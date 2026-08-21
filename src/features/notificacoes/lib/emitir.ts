import { db } from '@/db/connection'
import { notificacoes } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import type {
  DestinoNotificacao,
  RecursoNotificacao,
  TipoNotificacao,
} from '../constants/notificacao'

export type NovaNotificacao = {
  /** Quem deve ser avisado. Repetidos e o próprio autor são descartados aqui. */
  destinatarios: string[]
  autorId: string | null
  tipo: TipoNotificacao
  titulo: string
  resumo: string
  recursoTipo: RecursoNotificacao
  recursoId: string
  atendimentoId?: string | null
  protocolo?: string | null
  destino: DestinoNotificacao
  /**
   * Chave do fato, quando ele é recorrente por natureza.
   *
   * Preenchida, o índice único de `notificacoes` garante um aviso por
   * destinatário e o insert repetido vira no-op. Ausente (o normal), cada
   * chamada gera um aviso — que é o correto para mensagem, arquivo e
   * manifestação, onde repetir o fato significa um fato novo.
   */
  chaveDedupe?: string | null
}

/**
 * Cria as notificações de um fato de domínio.
 *
 * Duas regras vivem aqui, e não em cada chamador, para que ninguém possa
 * esquecê-las:
 *
 * 1. **Ninguém é avisado da própria ação.** Quem escreveu a mensagem sabe que
 *    escreveu; receber um aviso disso transformaria o sino em eco.
 * 2. **Um aviso por pessoa.** A lista de destinatários costuma vir de junções
 *    que repetem ids (responsável que também é participante, por exemplo).
 *
 * Recebe um `ExecutorDb` para poder gravar dentro da mesma transação do fato
 * que a originou: ou o convite e o aviso existem, ou nenhum dos dois. Sem isso
 * uma falha no meio deixaria a pessoa avisada de algo que não aconteceu.
 *
 * Com `chaveDedupe`, a terceira regra entra: **um aviso por fato recorrente**.
 * Ela é aplicada pelo índice único do banco, e não por uma consulta anterior ao
 * insert — duas requisições simultâneas passariam pelas duas consultas antes de
 * qualquer uma inserir, que foi como o mesmo prazo virou dois avisos idênticos
 * com 233ms de diferença.
 */
export async function emitirNotificacoes(
  executor: ExecutorDb,
  entrada: NovaNotificacao,
) {
  const alvos = Array.from(new Set(entrada.destinatarios)).filter(
    (id) => id && id !== entrada.autorId,
  )
  if (!alvos.length) return 0

  const criadas = await executor
    .insert(notificacoes)
    .values(
      alvos.map((destinatarioId) => ({
        destinatarioId,
        autorId: entrada.autorId,
        tipo: entrada.tipo,
        titulo: entrada.titulo.slice(0, 160),
        resumo: entrada.resumo.slice(0, 240),
        recursoTipo: entrada.recursoTipo,
        recursoId: entrada.recursoId,
        atendimentoId: entrada.atendimentoId ?? null,
        protocolo: entrada.protocolo ?? null,
        chaveDedupe: entrada.chaveDedupe ?? null,
        destino: entrada.destino,
      })),
    )
    // Sem chave, nada colide e todas entram. Com chave, a repetida é
    // descartada pelo banco em vez de virar aviso duplicado.
    .onConflictDoNothing()
    .returning({ id: notificacoes.id })

  return criadas.length
}

/** Atalho para quem emite fora de uma transação em andamento. */
export function emitir(entrada: NovaNotificacao) {
  return emitirNotificacoes(db, entrada)
}

/**
 * Um trecho curto do texto, para caber no resumo do sino.
 *
 * Corta na palavra e não no caractere: "Preciso entender se a revi…" é pior de
 * ler do que "Preciso entender se a…".
 */
export function resumirTexto(texto: string, limite = 120) {
  const limpo = texto.trim().replace(/\s+/g, ' ')
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite)
  const ultimoEspaco = corte.lastIndexOf(' ')
  return `${corte.slice(0, ultimoEspaco > 40 ? ultimoEspaco : limite)}…`
}
