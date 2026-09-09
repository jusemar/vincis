'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { parceiroSaqueItens, parceiroSaques } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/** Mesma constante local de `definir-prazo`: a Gestão do módulo vive aqui. */
const ROTA_PARCEIROS_ADMIN = '/admin/parceiros'

const RecusarSchema = z.object({
  saqueId: z.string().uuid('Saque inválido.'),
  /**
   * Motivo administrativo, opcional.
   *
   * Opcional porque não existe regra de negócio que exija justificar, e exigir
   * texto para concluir um ato transformaria um formulário em obstáculo. Quando
   * vem preenchido, fica com o saque e na trilha.
   */
  motivo: z.string().trim().max(500).optional(),
})

/**
 * Encerra um saque sem pagá-lo, devolvendo o valor ao saldo do parceiro.
 *
 * ## O que muda, e o que não muda
 *
 * O saque vira `recusado` e os itens são liberados. As **comissões não são
 * tocadas**: elas continuam `disponivel`, porque nunca deixaram de estar — o
 * pedido reservava o dinheiro, não o gastava. Mexer nelas aqui seria desfazer
 * um estado que a recusa não criou.
 *
 * ## Liberar o item é o que devolve o dinheiro
 *
 * O saldo livre é "disponível menos reservado", e reservado só conta saque
 * `solicitado` ou `pago`. Trocar o status já devolveria o número na tela — mas
 * o índice único de `parceiro_saque_itens` travaria o próximo saque, porque a
 * comissão ainda apareceria comprometida com a reserva antiga. Por isso os dois
 * atos andam juntos, na mesma transação: dinheiro que volta na conta e não pode
 * ser sacado é pior do que dinheiro que não voltou.
 *
 * ## Só o que ainda está aguardando
 *
 * O `where` exige `status = 'solicitado'`. Saque pago não é desfeito por aqui —
 * estorno é outra conversa, com outras regras — e saque já recusado não é
 * recusado de novo. Dois cliques disputam essa condição: um vence, o outro não
 * escreve nada e recebe o estado final.
 */
export async function recusarSaque(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) return SEM_AUTORIZACAO

  const validacao = RecusarSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Saque inválido.' }
  }

  const { saqueId, motivo } = validacao.data
  const agora = new Date()

  try {
    const resultado = await db.transaction(async (tx) => {
      const [recusado] = await tx
        .update(parceiroSaques)
        .set({
          status: 'recusado',
          recusadoEm: agora,
          observacao: motivo && motivo.length ? motivo : null,
          updatedAt: agora,
        })
        // A condição de status é a trava da idempotência e da concorrência.
        .where(
          and(
            eq(parceiroSaques.id, saqueId),
            eq(parceiroSaques.status, 'solicitado'),
          ),
        )
        .returning({
          id: parceiroSaques.id,
          parceiroId: parceiroSaques.parceiroId,
          valorCentavos: parceiroSaques.valorCentavos,
        })

      if (!recusado) {
        return {
          sucesso: false as const,
          mensagem: 'Este saque não está aguardando pagamento.',
        }
      }

      /*
        Os itens saem da reserva, mas continuam na tabela.

        Apagá-los devolveria o saldo do mesmo jeito e apagaria a prova do que
        aquele saque continha — e é justamente um saque recusado que alguém vai
        querer reconstituir depois.
      */
      const liberados = await tx
        .update(parceiroSaqueItens)
        .set({ liberadoEm: agora })
        .where(
          and(
            eq(parceiroSaqueItens.saqueId, recusado.id),
            isNull(parceiroSaqueItens.liberadoEm),
          ),
        )
        .returning({ comissaoId: parceiroSaqueItens.comissaoId })

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.saqueParceiroRecusado,
          entidade: 'parceiro_saques',
          registroAfetado: recusado.id,
          autorId: sessao.id,
          origem: 'gestao_vincis',
          metadados: {
            parceiroId: recusado.parceiroId,
            valorCentavos: recusado.valorCentavos,
            comissoes: liberados.map((item) => item.comissaoId),
            motivo: motivo && motivo.length ? motivo : null,
          },
        },
        tx,
      )

      return {
        sucesso: true as const,
        mensagem: 'Saque recusado. O valor voltou ao saldo do parceiro.',
        dados: { saqueId: recusado.id, comissoes: liberados.length },
      }
    })

    if (resultado.sucesso) {
      revalidatePath(ROTA_PARCEIROS_ADMIN)
      revalidatePath(ROTA_PARCEIROS)
    }
    return resultado
  } catch (erro) {
    console.error('[PARCEIROS] falha ao recusar saque', {
      saqueId,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível recusar o saque. Tente novamente.',
    }
  }
}
