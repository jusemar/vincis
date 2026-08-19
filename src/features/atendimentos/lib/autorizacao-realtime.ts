import { and, eq, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoConvites } from '@/db/schema'
import type { CanalIdentificado } from '@/integracoes/realtime/canais'
import { obterAcessoAtendimento } from './autorizacao'

/**
 * Pode esta sessão assinar este canal?
 *
 * Toda a segurança do tempo real está nesta função. O navegador diz qual canal
 * quer; o servidor confere o vínculo **no banco** e responde sim ou não. O id
 * que chegou na requisição não é prova de nada — é só o alvo da pergunta.
 *
 * - `usuario`: só o dono da sessão. É por isso que o toast e a contagem
 *   pessoal podem viajar com texto.
 * - `atendimento`: o mesmo vínculo que abre o Atendimento na tela
 *   (`obterAcessoAtendimento`). Um convite pendente não serve: participação
 *   começa no aceite.
 * - `convite`: apenas remetente e destinatário daquela negociação. Nem o resto
 *   da equipe do Atendimento entra — valor combinado não é assunto de todos.
 */
export async function podeAssinarCanal(
  canal: CanalIdentificado,
  usuarioId: string,
): Promise<boolean> {
  if (canal.escopo === 'usuario') {
    return canal.id === usuarioId
  }

  if (canal.escopo === 'atendimento') {
    return (await obterAcessoAtendimento(canal.id, usuarioId)) !== null
  }

  const [convite] = await db
    .select({ id: atendimentoConvites.id })
    .from(atendimentoConvites)
    .where(
      and(
        eq(atendimentoConvites.id, canal.id),
        or(
          eq(atendimentoConvites.remetenteId, usuarioId),
          eq(atendimentoConvites.destinatarioId, usuarioId),
        ),
      ),
    )
    .limit(1)

  return Boolean(convite)
}
