import { eq } from 'drizzle-orm'
import { atendimentoParticipantes, atendimentos, usuarios } from '@/db/schema'
import type { ExecutorDb } from './executor'

export type AudienciaAtendimento = {
  atendimentoId: string
  protocolo: string
  titulo: string
  clienteUsuarioId: string
  clienteNome: string
  prestadorId: string
  responsavelId: string
  /** Prestador dono, responsável e participantes. Nunca inclui o Cliente. */
  equipe: string[]
  /** A equipe mais o Cliente proprietário. */
  todos: string[]
}

/**
 * Quem deve saber do que acontece num Atendimento.
 *
 * Existe para que cada ponto de domínio não repita a mesma junção — e, mais
 * importante, para que a fronteira entre `equipe` e `todos` seja decidida num
 * lugar só. É essa fronteira que impede uma nota interna de virar aviso no sino
 * do Cliente: quem emite escolhe a lista, e as listas são estas duas.
 *
 * Aceita um executor para ser chamada de dentro da transação do fato que gera o
 * aviso.
 */
export async function obterAudienciaDoAtendimento(
  executor: ExecutorDb,
  atendimentoId: string,
): Promise<AudienciaAtendimento | null> {
  const [registro] = await executor
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
      clienteNome: usuarios.nome,
      prestadorId: atendimentos.prestadorId,
      responsavelId: atendimentos.responsavelId,
    })
    .from(atendimentos)
    .innerJoin(usuarios, eq(usuarios.id, atendimentos.clienteUsuarioId))
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)

  if (!registro) return null

  const participantes = await executor
    .select({ usuarioId: atendimentoParticipantes.usuarioId })
    .from(atendimentoParticipantes)
    .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId))

  const equipe = Array.from(
    new Set([
      registro.prestadorId,
      registro.responsavelId,
      ...participantes.map(({ usuarioId }) => usuarioId),
    ]),
    // O Cliente pode aparecer em participantes num cenário futuro; a lista de
    // equipe é definida pela exclusão dele, e não pela esperança de que não
    // esteja lá.
  ).filter((id) => id !== registro.clienteUsuarioId)

  return {
    atendimentoId: registro.id,
    protocolo: registro.protocolo,
    titulo: registro.titulo,
    clienteUsuarioId: registro.clienteUsuarioId,
    clienteNome: registro.clienteNome,
    prestadorId: registro.prestadorId,
    responsavelId: registro.responsavelId,
    equipe,
    todos: [...equipe, registro.clienteUsuarioId],
  }
}

/** Nome de uma pessoa, para compor o texto do aviso. */
export async function nomeDoAutor(executor: ExecutorDb, usuarioId: string) {
  const [pessoa] = await executor
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  return pessoa?.nome ?? 'Alguém'
}
