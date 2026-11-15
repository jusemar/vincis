import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, cobrancasPix, contratacoesServico } from '@/db/schema'
import { sincronizarCobranca } from '@/features/pagamentos/lib/cobrancas'
import { iniciarPagamentoDoServico } from '@/features/servicos/actions/contratar'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { efiDeTeste } from './efi-de-teste'

/**
 * Contrata um serviço `fixo` pelo caminho real e pago — para os cenários que
 * só precisam de uma contratação existente.
 *
 * Antes do Pix, `contratarServico` criava contratação e Atendimento direto. A
 * ação saiu (seria contratação de graça); este auxiliar mantém o mesmo formato
 * de resposta, mas percorre o fluxo de verdade: `iniciarPagamentoDoServico`
 * (sessão, papel, serviço, preço do banco) → a Efí de teste marca o Pix como
 * pago → `sincronizarCobranca` consulta e confirma → o efeito cria contratação
 * e Atendimento, uma vez só.
 */
export async function contratarServico({
  servicoId,
  mensagem,
}: {
  servicoId: string
  mensagem?: string
}) {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const resultado = await iniciarPagamentoDoServico({ servicoId, mensagem })

    if (resultado.situacao === 'gerando') {
      // Outra chamada concorrente está emitindo: espera e tenta de novo.
      await new Promise((resolve) => setTimeout(resolve, 50))
      continue
    }

    if (resultado.situacao === 'ja_contratado') {
      const sessao = await obterSessaoServidor()
      const [existente] = await db
        .select({ id: contratacoesServico.id })
        .from(contratacoesServico)
        .where(
          and(
            eq(contratacoesServico.servicoId, servicoId),
            eq(contratacoesServico.clienteUsuarioId, sessao!.id),
          ),
        )
        .limit(1)
      return {
        sucesso: true as const,
        mensagem: resultado.mensagem,
        precisaEntrar: false,
        dados: {
          contratacaoId: existente.id,
          jaExistia: true,
          atendimentoId: resultado.atendimentoId!,
          protocolo: resultado.protocolo!,
        },
      }
    }

    if (resultado.situacao !== 'cobranca') {
      return {
        sucesso: false as const,
        mensagem: resultado.mensagem,
        precisaEntrar: resultado.situacao === 'precisa_entrar',
        dados: undefined,
      }
    }

    const [cobranca] = await db
      .select({ id: cobrancasPix.id, txid: cobrancasPix.txid })
      .from(cobrancasPix)
      .where(eq(cobrancasPix.id, resultado.cobranca.id))
    if (efiDeTeste.existe(cobranca.txid)) efiDeTeste.pagar(cobranca.txid)
    const paga = await sincronizarCobranca(cobranca.id, { forcar: true })
    if (paga?.status !== 'paga' || !paga.efeitoReferenciaId) {
      // A concorrente pode ter confirmado primeiro: a próxima volta vê `ja_contratado`.
      continue
    }
    const [atendimento] = await db
      .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.contratacaoId, paga.efeitoReferenciaId))
    return {
      sucesso: true as const,
      mensagem: 'Serviço contratado com sucesso.',
      precisaEntrar: false,
      dados: {
        contratacaoId: paga.efeitoReferenciaId,
        jaExistia: false,
        atendimentoId: atendimento.id,
        protocolo: atendimento.protocolo,
      },
    }
  }
  throw new Error('Contratação de teste não convergiu.')
}
