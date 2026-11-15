import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoEncerramentos, atendimentoEventos, atendimentos } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import {
  ehStatusEncerrado,
  ROTULO_MOTIVO_ENCERRAMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
  type MotivoEncerramentoSemConclusao,
} from '../constants/atendimento'
import { obterAudienciaDoAtendimento } from './audiencia'

export type ResultadoEncerramento =
  | { sucesso: true; protocolo: string }
  | { sucesso: false; motivo: 'nao-encontrado' | 'ja-encerrado' }

/** O que o Cliente lê no histórico. Sem motivo interno, sem dinheiro. */
export const DESCRICAO_EVENTO_ENCERRAMENTO =
  'Atendimento encerrado sem conclusão pela Vincis por falta de retorno.'

/**
 * Encerra um Atendimento parado — decisão exclusiva da Gestão.
 *
 * Quem chama já conferiu que é o Gestor da Plataforma (a action faz isso antes
 * de tudo). Aqui ficam as garantias de dado:
 *
 * - a linha do Atendimento é travada e o status de origem é repetido no
 *   `where`: dois Gestores encerrando ao mesmo tempo produzem um encerramento;
 * - `atendimento_encerramentos` é único por Atendimento;
 * - o registro guarda gestor, data, motivo, observação e status anterior.
 *
 * ## O que fica de fora, de propósito
 *
 * - A observação administrativa **não** vai para o histórico visível ao
 *   Cliente nem para o aviso dele — só para a tabela própria e a auditoria.
 * - Nada financeiro: não há estorno, crédito, devolução, nem mudança na
 *   contratação, no pagamento ou na comissão do parceiro. Encerrar por falta de
 *   retorno não decide quem tem direito ao valor.
 */
export async function encerrarSemConclusao({
  atendimentoId,
  gestorId,
  motivo,
  observacaoInterna,
}: {
  atendimentoId: string
  gestorId: string
  motivo: MotivoEncerramentoSemConclusao
  observacaoInterna: string
}): Promise<ResultadoEncerramento> {
  const resultado = await db.transaction(async (tx) => {
    const [atual] = await tx
      .select({ status: atendimentos.status, protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
      .for('update')
      .limit(1)
    if (!atual) return { sucesso: false as const, motivo: 'nao-encontrado' as const }
    if (ehStatusEncerrado(atual.status)) {
      return { sucesso: false as const, motivo: 'ja-encerrado' as const }
    }

    const [registrado] = await tx
      .insert(atendimentoEncerramentos)
      .values({
        atendimentoId,
        gestorId,
        motivo,
        observacaoInterna: observacaoInterna.trim(),
        statusAnterior: atual.status,
      })
      .onConflictDoNothing({ target: atendimentoEncerramentos.atendimentoId })
      .returning({ id: atendimentoEncerramentos.id })
    if (!registrado) return { sucesso: false as const, motivo: 'ja-encerrado' as const }

    const agora = new Date()
    await tx
      .update(atendimentos)
      .set({ status: 'encerrado_sem_conclusao', updatedAt: agora })
      .where(and(eq(atendimentos.id, atendimentoId), eq(atendimentos.status, atual.status)))

    // Histórico visível ao Cliente: o fato, e só o fato.
    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoEncerradoSemConclusao,
      descricao: DESCRICAO_EVENTO_ENCERRAMENTO,
      autorId: gestorId,
      visivelCliente: true,
      metadados: { de: atual.status, para: 'encerrado_sem_conclusao' },
    })

    // Auditoria (interna): aqui sim o motivo e a observação completos.
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.atendimentoEncerradoSemConclusao,
        entidade: 'atendimentos',
        registroAfetado: atendimentoId,
        autorId: gestorId,
        origem: 'gestao_vincis',
        metadados: {
          protocolo: atual.protocolo,
          statusAnterior: atual.status,
          motivo,
          motivoRotulo: ROTULO_MOTIVO_ENCERRAMENTO[motivo],
          observacaoInterna: observacaoInterna.trim(),
          efeitoFinanceiro: 'nenhum',
        },
      },
      tx,
    )

    return { sucesso: true as const, protocolo: atual.protocolo }
  })

  if (resultado.sucesso) {
    const audiencia = await obterAudienciaDoAtendimento(db, atendimentoId)
    if (audiencia) {
      await emitirNotificacoes(db, {
        destinatarios: audiencia.todos,
        autorId: gestorId,
        tipo: TIPOS_NOTIFICACAO.atendimentoEncerradoSemConclusao,
        titulo: 'Atendimento encerrado sem conclusão',
        resumo: resumirTexto(
          `${audiencia.protocolo} · ${audiencia.titulo} · encerrado pela Vincis por falta de retorno`,
          200,
        ),
        recursoTipo: 'atendimento',
        recursoId: atendimentoId,
        atendimentoId,
        protocolo: audiencia.protocolo,
        destino: { pagina: 'atendimentos', atendimento: audiencia.protocolo },
        chaveDedupe: `${TIPOS_NOTIFICACAO.atendimentoEncerradoSemConclusao}:${atendimentoId}`,
      })
    }
  }
  return resultado
}
