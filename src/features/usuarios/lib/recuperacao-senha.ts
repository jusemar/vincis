import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { db } from '@/db/connection'
import { tokensUsuario } from '@/db/schema'
import { INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS } from '../constants/recuperacao-senha'

/**
 * Regras comuns aos dois canais de recuperação (link por e-mail e código por
 * SMS): o intervalo entre pedidos e "só o pedido mais recente vale" valem para
 * a CONTA, seja qual for o canal.
 */

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Link do e-mail, código do SMS e a autorização emitida depois do código. */
export const TIPOS_RECUPERACAO = ['recuperacao_senha', 'recuperacao_senha_otp'] as const

/** Houve pedido desta conta há menos de 1 minuto? (evita e-mail/SMS duplicado) */
export async function contaEmIntervaloDeReenvio(tx: Transacao, usuarioId: string): Promise<boolean> {
  const [maisRecente] = await tx
    .select({ createdAt: tokensUsuario.createdAt })
    .from(tokensUsuario)
    .where(and(eq(tokensUsuario.usuarioId, usuarioId), inArray(tokensUsuario.tipo, [...TIPOS_RECUPERACAO])))
    .orderBy(desc(tokensUsuario.createdAt))
    .limit(1)
  return Boolean(maisRecente && Date.now() - maisRecente.createdAt.getTime() < INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS * 1000)
}

/** Novo pedido: links, códigos e autorizações anteriores, ainda abertos, deixam de valer. */
export async function invalidarRecuperacoesAbertas(tx: Transacao, usuarioId: string, agora: Date) {
  await tx
    .update(tokensUsuario)
    .set({ usadoEm: agora })
    .where(
      and(
        eq(tokensUsuario.usuarioId, usuarioId),
        inArray(tokensUsuario.tipo, [...TIPOS_RECUPERACAO]),
        isNull(tokensUsuario.usadoEm),
      ),
    )
}
