import { inArray, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoAjustes,
  atendimentoArquivos,
  atendimentoConvites,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoParticipantes,
  atendimentos,
  avaliacoesAtendimento,
  eventosAuditoria,
} from '@/db/schema'

/**
 * Remove os Atendimentos de um conjunto de contas de teste, e o rastro deles.
 *
 * Toda contratação passou a ter um Atendimento apontando para ela, e a chave
 * estrangeira impede apagar a contratação antes. A trilha de auditoria da
 * criação também referencia as contas, então sai junto. Cada cenário chama isto
 * antes de limpar `contratacoes_servico` e `usuarios` — a ordem é dependência
 * real do banco, não detalhe do teste.
 */
export async function limparAtendimentosDosPrestadores(usuarioIds: string[]) {
  if (!usuarioIds.length) return

  const alvos = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(inArray(atendimentos.prestadorId, usuarioIds))
  const ids = alvos.map(({ id }) => id)

  if (ids.length) {
    // As solicitações de ajuste saem primeiro: elas apontam para arquivos,
    // manifestações e eventos que são apagados logo abaixo.
    await db
      .delete(atendimentoAjustes)
      .where(inArray(atendimentoAjustes.atendimentoId, ids))
    // A avaliação sai antes do Atendimento. Existe cascade, mas apagar
    // explicitamente mantém a ordem visível para quem lê a limpeza — como já é
    // feito com o Protocolo logo abaixo.
    await db
      .delete(avaliacoesAtendimento)
      .where(inArray(avaliacoesAtendimento.atendimentoId, ids))
    await db
      .delete(atendimentoArquivos)
      .where(inArray(atendimentoArquivos.atendimentoId, ids))
    // O Protocolo sai antes do Atendimento. A tabela tem cascade, mas apagar
    // explicitamente mantém a ordem visível para quem lê a limpeza.
    await db
      .delete(atendimentoManifestacoes)
      .where(inArray(atendimentoManifestacoes.atendimentoId, ids))
    await db
      .delete(atendimentoEventos)
      .where(inArray(atendimentoEventos.atendimentoId, ids))
    await db
      .delete(atendimentoParticipantes)
      .where(inArray(atendimentoParticipantes.atendimentoId, ids))
    // Os convites saem depois dos participantes: a linha de participante
    // aponta para o convite que a originou. As mensagens da negociação vão
    // junto, por cascade.
    await db
      .delete(atendimentoConvites)
      .where(inArray(atendimentoConvites.atendimentoId, ids))
    await db.delete(atendimentos).where(inArray(atendimentos.id, ids))
  }

  await db
    .delete(eventosAuditoria)
    .where(
      or(
        inArray(eventosAuditoria.autorId, usuarioIds),
        inArray(eventosAuditoria.usuarioId, usuarioIds),
      ),
    )
}
