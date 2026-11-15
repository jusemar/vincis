import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { repassesProfissionais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import type { OrigemRepasse, SituacaoRepasse } from '../constants/repasse'
import { sincronizarRepasses } from './sincronizar-repasses'

export type ResultadoRegistroRepasse =
  | { ok: true; valorProfissionalCentavos: number }
  | { ok: false; motivo: 'inexistente' | 'ja_repassado' | 'data_futura' }
  | { ok: false; motivo: 'nao_disponivel'; situacao: SituacaoRepasse }

/**
 * Registra que a parte do profissional foi transferida (por fora da Vincis).
 *
 * Tudo numa transação, com a linha travada:
 * 1. trava a linha do livro (`for update`) — dois cliques ou dois gestores
 *    ao mesmo tempo esperam um pelo outro;
 * 2. já repassado → recusa (sem segundo repasse);
 * 3. reapura **esta origem** agora, das fontes de verdade: pagamento
 *    confirmado, prestação concluída, sem cancelamento nem estorno;
 * 4. só `disponivel` vira `repassado`, com o valor congelado do retrato;
 * 5. evento de auditoria na mesma transação.
 *
 * Quem pode chamar é decidido pela Server Action (somente Gestor da Vincis).
 */
export async function registrarRepasse(entrada: {
  repasseId: string
  gestorId: string
  repassadoEm: Date
  comprovante: string
  observacao: string | null
  ip: string | null
}): Promise<ResultadoRegistroRepasse> {
  // Compara datas de calendário em São Paulo: "hoje" vale o dia inteiro.
  const dia = (instante: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(instante)
  if (dia(entrada.repassadoEm) > dia(new Date())) return { ok: false, motivo: 'data_futura' }

  return db.transaction(async (tx) => {
    const [travada] = await tx
      .select({ id: repassesProfissionais.id, origem: repassesProfissionais.origem, origemId: repassesProfissionais.origemId, situacao: repassesProfissionais.situacao })
      .from(repassesProfissionais)
      .where(eq(repassesProfissionais.id, entrada.repasseId))
      .for('update')
    if (!travada) return { ok: false as const, motivo: 'inexistente' as const }
    if (travada.situacao === 'repassado') return { ok: false as const, motivo: 'ja_repassado' as const }

    await sincronizarRepasses(tx, { origem: travada.origem as OrigemRepasse, origemId: travada.origemId })

    const [atual] = await tx
      .select()
      .from(repassesProfissionais)
      .where(eq(repassesProfissionais.id, travada.id))
    if (
      atual.situacao !== 'disponivel' ||
      atual.valorProfissionalCentavos === null ||
      atual.profissionalId === null
    ) {
      return { ok: false as const, motivo: 'nao_disponivel' as const, situacao: atual.situacao as SituacaoRepasse }
    }

    const agora = new Date()
    await tx
      .update(repassesProfissionais)
      .set({
        situacao: 'repassado',
        repassadoEm: entrada.repassadoEm,
        repassadoPorId: entrada.gestorId,
        comprovante: entrada.comprovante,
        observacao: entrada.observacao,
        updatedAt: agora,
      })
      .where(eq(repassesProfissionais.id, atual.id))

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.repasseProfissionalRegistrado,
        entidade: 'repasses_profissionais',
        registroAfetado: atual.id,
        autorId: entrada.gestorId,
        usuarioId: atual.profissionalId,
        origem: 'gestao_vincis',
        ip: entrada.ip,
        metadados: {
          origem: atual.origem,
          origemId: atual.origemId,
          profissionalId: atual.profissionalId,
          valorBrutoCentavos: atual.valorBrutoCentavos,
          comissaoVincisMilesimos: atual.comissaoVincisMilesimos,
          comissaoVincisCentavos: atual.comissaoVincisCentavos,
          valorProfissionalCentavos: atual.valorProfissionalCentavos,
          comissaoIndicadorCentavos: atual.comissaoIndicadorCentavos,
          referenciaPagamento: atual.referenciaPagamento,
          repassadoEm: entrada.repassadoEm.toISOString(),
          comprovante: entrada.comprovante,
        },
      },
      tx,
    )
    return { ok: true as const, valorProfissionalCentavos: atual.valorProfissionalCentavos }
  })
}
