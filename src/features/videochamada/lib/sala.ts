import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaAgendamentos } from '@/db/schema'
import { criarSala, obterSala, type SalaDaily } from './daily/cliente-daily'
import { gerarNomeDeSala } from './nome-da-sala'

/**
 * Garante que a consultoria tenha **uma** sala Daily — e só uma.
 *
 * ## Onde a corrida é decidida
 *
 * No `UPDATE ... WHERE daily_room_name IS NULL`. Cliente e Profissional clicam
 * em "Entrar" no mesmo segundo, os dois sorteiam um nome, e os dois mandam o
 * mesmo comando ao banco. O Postgres serializa: um `UPDATE` encontra a coluna
 * nula e grava; o outro encontra a coluna já preenchida, não afeta linha
 * nenhuma e vai **ler** o nome que o vencedor gravou. O nome do perdedor é
 * descartado sem nunca ter chegado à Daily.
 *
 * Isto é o oposto de `if (!sala) criar()`: aquele padrão tem uma janela entre a
 * leitura e a escrita, e é exatamente nessa janela que dois cliques simultâneos
 * criam duas salas. Aqui não existe janela, porque ler e escrever são a mesma
 * instrução.
 *
 * ## Por que a Daily é chamada fora da transação
 *
 * Uma chamada HTTP dentro de uma transação segura a linha travada pelo tempo da
 * rede. Como o nome já foi decidido de forma atômica, a criação na Daily pode
 * acontecer depois, com calma: ela é idempotente por nome — se a sala já
 * existir, a Daily recusa com `already-exists` e nós lemos a que está lá.
 *
 * ## Sala que expirou
 *
 * O `exp` da sala é o fim da janela, então dentro da janela ela existe. Se
 * ainda assim a leitura não encontrar (a Daily apagou antes, houve desvio de
 * relógio), recriamos **com o mesmo nome**: o vínculo persistido continua
 * válido e nenhuma segunda sala nasce.
 */
export async function garantirSalaDaConsultoria(
  agendamentoId: string,
  janela: { abreEm: Date; fechaEm: Date },
): Promise<SalaDaily> {
  const nome = await reservarNomeDaSala(agendamentoId)

  const existente = await obterSala(nome)
  if (existente) return existente

  return criarSala({
    nome,
    nbf: paraUnix(janela.abreEm),
    exp: paraUnix(janela.fechaEm),
  })
}

/**
 * Decide, de uma vez por todas, qual é o nome da sala desta consultoria.
 *
 * Devolve o nome recém-gravado ou o que já estava lá. Nunca devolve dois nomes
 * diferentes para a mesma consultoria, nem sob concorrência.
 */
async function reservarNomeDaSala(agendamentoId: string): Promise<string> {
  const candidato = gerarNomeDeSala()

  const [ganhou] = await db
    .update(consultoriaAgendamentos)
    .set({ dailyRoomName: candidato, dailyRoomCriadaEm: new Date() })
    .where(
      and(
        eq(consultoriaAgendamentos.id, agendamentoId),
        isNull(consultoriaAgendamentos.dailyRoomName),
      ),
    )
    .returning({ nome: consultoriaAgendamentos.dailyRoomName })

  if (ganhou?.nome) return ganhou.nome

  // Não afetou linha: ou já havia nome (o caso comum — reentrada, F5, o outro
  // participante chegou antes), ou o agendamento não existe.
  const [atual] = await db
    .select({ nome: consultoriaAgendamentos.dailyRoomName })
    .from(consultoriaAgendamentos)
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)

  if (!atual?.nome) {
    throw new Error(`Consultoria ${agendamentoId} não encontrada ao reservar sala.`)
  }
  return atual.nome
}

/** A Daily conta o tempo em segundos desde a epoch; o JavaScript, em milissegundos. */
export function paraUnix(instante: Date): number {
  return Math.floor(instante.getTime() / 1000)
}
