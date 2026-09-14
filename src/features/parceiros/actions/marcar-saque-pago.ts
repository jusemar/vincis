'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
  parceiroBonus,
  parceiroComissoes,
  parceiroSaqueItens,
  parceiroSaques,
} from '@/db/schema'
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

const MarcarPagoSchema = z.object({
  saqueId: z.string().uuid('Saque inválido.'),
})

/**
 * Registra que a Vincis pagou um saque — o dinheiro saiu **fora** daqui.
 *
 * ## O que ela é
 *
 * Um registro, não uma transferência. A plataforma não gera Pix, não fala com
 * banco e não move dinheiro: o Gestor paga pelo canal dele e volta para marcar
 * o que fez. Confundir as duas coisas seria prometer uma integração que não
 * existe.
 *
 * ## Só o Gestor, e a prova nunca vem da tela
 *
 * Perfil conferido no servidor a cada chamada. O parceiro não alcança esta
 * ação nem conhecendo o id do próprio saque — muito menos o de outro.
 *
 * ## Idempotência é uma linha de SQL
 *
 * O `UPDATE` exige `status = 'solicitado'`. Dois cliques (ou dois gestores ao
 * mesmo tempo) disputam essa condição: um vence e escreve, o outro não escreve
 * nada e recebe "já estava pago". Não há dinheiro pago duas vezes, timestamp
 * sobrescrito nem evento duplicado, porque o perdedor não chega a executar
 * nada disso.
 *
 * ## Tudo ou nada
 *
 * Saque, comissões e trilha na mesma transação. Um saque pago cujas comissões
 * continuassem `disponivel` faria o saldo do parceiro ressuscitar — dinheiro
 * pago aparecendo como sacável de novo é o pior estado possível desta tela.
 *
 * ## Só as comissões daquele saque
 *
 * O `where` é `inArray` sobre os itens do saque, e nada mais. Comissão de
 * outro saque, de outro parceiro, ainda `gerada` ou sem vínculo nenhum não é
 * alcançada — nem por engano, nem por id forjado.
 */
export async function marcarSaquePago(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) return SEM_AUTORIZACAO

  const validacao = MarcarPagoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Saque inválido.' }
  }

  const { saqueId } = validacao.data
  const agora = new Date()

  try {
    const resultado = await db.transaction(async (tx) => {
      const [pago] = await tx
        .update(parceiroSaques)
        .set({ status: 'pago', pagoEm: agora, updatedAt: agora })
        // A condição de status é a trava: quem chega depois não escreve.
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

      if (!pago) {
        return {
          sucesso: false as const,
          mensagem: 'Este saque não está aguardando pagamento.',
        }
      }

      const itens = await tx
        .select({
          comissaoId: parceiroSaqueItens.comissaoId,
          bonusId: parceiroSaqueItens.bonusId,
        })
        .from(parceiroSaqueItens)
        .where(eq(parceiroSaqueItens.saqueId, pago.id))

      const comissoes = itens.flatMap((item) => (item.comissaoId ? [item.comissaoId] : []))
      const bonus = itens.flatMap((item) => (item.bonusId ? [item.bonusId] : []))
      if (comissoes.length) {
        await tx
          .update(parceiroComissoes)
          .set({ status: 'paga', pagaEm: agora, updatedAt: agora })
          .where(
            and(
              inArray(parceiroComissoes.id, comissoes),
              // Só o que estava liberado vira pago. Uma comissão em outro
              // estado indica dado inconsistente, e forçá-la esconderia isso.
              eq(parceiroComissoes.status, 'disponivel'),
            ),
          )
      }
      // Bônus de campanha sai no mesmo saque, e com a mesma regra.
      if (bonus.length) {
        await tx
          .update(parceiroBonus)
          .set({ status: 'paga', pagaEm: agora, updatedAt: agora })
          .where(and(inArray(parceiroBonus.id, bonus), eq(parceiroBonus.status, 'disponivel')))
      }

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.saqueParceiroPago,
          entidade: 'parceiro_saques',
          registroAfetado: pago.id,
          autorId: sessao.id,
          origem: 'gestao_vincis',
          metadados: {
            parceiroId: pago.parceiroId,
            valorCentavos: pago.valorCentavos,
            comissoes,
            bonus,
            // O pagamento é externo: a trilha registra o ato, não a operação
            // bancária, que a Vincis não executa nem conhece.
            formaDePagamento: 'externa',
          },
        },
        tx,
      )

      return {
        sucesso: true as const,
        mensagem: 'Saque marcado como pago.',
        dados: { saqueId: pago.id, comissoes: comissoes.length },
      }
    })

    if (resultado.sucesso) {
      revalidatePath(ROTA_PARCEIROS_ADMIN)
      revalidatePath(ROTA_PARCEIROS)
    }
    return resultado
  } catch (erro) {
    console.error('[PARCEIROS] falha ao marcar saque como pago', {
      saqueId,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível registrar o pagamento. Tente novamente.',
    }
  }
}
