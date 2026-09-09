'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { parceiroRecebimentos } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { METODO_RECEBIMENTO } from '../constants/recebimento'
import { obterParceiroDaSessao } from '../queries/obter-parceiro'
import { RecebimentoSchema } from '../schemas/recebimento'

/**
 * Grava para onde a Vincis deve pagar este parceiro.
 *
 * ## Só os próprios dados
 *
 * O parceiro vem da sessão e a ação não aceita identificador nenhum. Não há
 * como gravar a chave de outra pessoa nem conhecendo o id dela — a pergunta
 * "de quem são estes dados?" nunca chega do navegador.
 *
 * ## Sobrescreve, não empilha
 *
 * `on conflict do update` no índice único de `parceiro_id`. A Vincis paga para
 * um destino; guardar a chave antiga aqui seria reter dado pessoal sem
 * ninguém para consumi-lo. O histórico que importa é o do saque, e ele já
 * carrega o próprio retrato — trocar a chave não mexe em pedido nenhum que já
 * exista.
 *
 * ## A chave não entra na trilha
 *
 * A auditoria registra **que** os dados mudaram, o tipo e os quatro últimos
 * dígitos — o suficiente para reconstituir uma conversa de suporte. Gravar a
 * chave inteira num log espalharia o dado pessoal para uma tabela com outra
 * regra de acesso, que é exatamente o que se quer evitar.
 */
export async function salvarRecebimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  const parceiro = await obterParceiroDaSessao()
  if (!sessao || !parceiro) return SEM_AUTORIZACAO

  const validacao = RecebimentoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? 'Revise os dados de recebimento.',
    }
  }

  const { tipoChave, chave, titular } = validacao.data
  const agora = new Date()

  try {
    await db
      .insert(parceiroRecebimentos)
      .values({
        parceiroId: parceiro.id,
        metodo: METODO_RECEBIMENTO,
        tipoChave,
        chave,
        titular,
        atualizadoPor: sessao.id,
      })
      .onConflictDoUpdate({
        target: parceiroRecebimentos.parceiroId,
        set: {
          metodo: METODO_RECEBIMENTO,
          tipoChave,
          chave,
          titular,
          atualizadoPor: sessao.id,
          updatedAt: agora,
        },
      })

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.recebimentoParceiroAlterado,
      entidade: 'parceiro_recebimentos',
      registroAfetado: parceiro.id,
      autorId: sessao.id,
      origem: 'admin',
      metadados: {
        parceiroId: parceiro.id,
        metodo: METODO_RECEBIMENTO,
        tipoChave,
        // Só o fim da chave: identifica o registro sem repetir o dado pessoal.
        finalDaChave: chave.slice(-4),
      },
    })

    revalidatePath(ROTA_PARCEIROS)
    return {
      sucesso: true as const,
      mensagem: 'Dados de recebimento salvos.',
    }
  } catch (erro) {
    // A mensagem do banco pode carregar o valor gravado: só o nome do erro sai.
    console.error('[PARCEIROS] falha ao salvar dados de recebimento', {
      parceiroId: parceiro.id,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível salvar os dados. Tente novamente.',
    }
  }
}
