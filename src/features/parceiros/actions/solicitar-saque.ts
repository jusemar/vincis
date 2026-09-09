'use server'

import { and, asc, eq, isNull, notInArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  parceiroComissoes,
  parceiroRecebimentos,
  parceiroSaqueItens,
  parceiroSaques,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { obterParceiroDaSessao } from '../queries/obter-parceiro'

/** Violação de unicidade do Postgres. */
function ehReservaRepetida(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: string }).code === '23505'
  )
}

/**
 * Solicita o saque do saldo disponível do parceiro.
 *
 * ## O que ela faz, e o que não faz
 *
 * Reserva comissões e abre um pedido. Não paga, não movimenta conta, não marca
 * comissão como `paga` e não decide nada pelo Gestor — o pagamento é etapa
 * própria, e antecipá-lo aqui seria anunciar dinheiro que não saiu.
 *
 * ## O saldo é o que sobrou, não o que foi gerado
 *
 * Entram só comissões `disponivel` que **ainda não estão em saque nenhum**. É a
 * diferença entre "comissão liberada" e "saldo livre": pedir duas vezes o mesmo
 * dinheiro é exatamente o erro que esta consulta e o índice único impedem.
 *
 * ## A corrida
 *
 * Três camadas, em ordem de teimosia: a leitura filtra o que já está reservado;
 * o `for update` segura as linhas escolhidas até o commit; e o índice único de
 * `parceiro_saque_itens.comissao_id` recusa a segunda reserva mesmo que as duas
 * transações tenham lido o mesmo saldo. Duas abas clicando junto produzem um
 * saque e um "sem saldo" — nunca dois saques do mesmo dinheiro, nunca saldo
 * negativo. Se o índice falar por último, a transação inteira é desfeita e não
 * sobra pedido pela metade.
 *
 * ## Valor
 *
 * O saque leva **todo** o saldo livre, em comissões inteiras. A tela aprovada
 * não tem campo de valor, e fatiar uma comissão criaria "meia comissão", que
 * não existe no domínio. Assim a soma dos itens é sempre exatamente o valor do
 * pedido, sem nenhum centavo a explicar e sem aritmética de ponto flutuante:
 * tudo é inteiro, em centavos.
 */
export async function solicitarSaque() {
  const usuario = await obterSessaoServidor()
  const parceiro = await obterParceiroDaSessao()
  if (!usuario || !parceiro) return SEM_AUTORIZACAO

  /*
    Sem destino não há pedido.

    Reservar comissões para um saque que ninguém consegue pagar prenderia o
    saldo do parceiro à espera de um dado que só ele pode informar. Barrar aqui
    é mais honesto do que criar o pedido e descobrir na hora de transferir.
  */
  const [destino] = await db
    .select({
      metodo: parceiroRecebimentos.metodo,
      tipoChave: parceiroRecebimentos.tipoChave,
      chave: parceiroRecebimentos.chave,
      titular: parceiroRecebimentos.titular,
    })
    .from(parceiroRecebimentos)
    .where(eq(parceiroRecebimentos.parceiroId, parceiro.id))
    .limit(1)

  if (!destino) {
    return {
      sucesso: false as const,
      mensagem:
        'Cadastre seus dados para recebimento antes de solicitar o saque.',
      // A tela usa isto para levar o parceiro ao lugar certo em vez de só avisar.
      dados: { faltaRecebimento: true as const },
    }
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      /*
        As comissões livres deste parceiro, travadas até o commit.

        O `parceiro_id` vem do parceiro da sessão — a ação não aceita parâmetro
        nenhum, então não há como sacar o saldo alheio nem conhecendo o id.
      */
      /*
        Reservado é o item que ainda não foi liberado — exatamente o conjunto
        que o índice único cobre. Perguntar pelo status do saque daria o mesmo
        resultado, mas por outro caminho: duas noções de "reservado" acabariam
        divergindo no dia em que uma mudasse sem a outra.
      */
      const reservadas = tx
        .select({ id: parceiroSaqueItens.comissaoId })
        .from(parceiroSaqueItens)
        .where(isNull(parceiroSaqueItens.liberadoEm))

      const livres = await tx
        .select({
          id: parceiroComissoes.id,
          valorCentavos: parceiroComissoes.valorCentavos,
        })
        .from(parceiroComissoes)
        .where(
          and(
            eq(parceiroComissoes.parceiroId, parceiro.id),
            eq(parceiroComissoes.status, 'disponivel'),
            notInArray(parceiroComissoes.id, reservadas),
          ),
        )
        .orderBy(asc(parceiroComissoes.disponivelEm))
        .for('update')

      if (!livres.length) {
        return { sucesso: false as const, mensagem: 'Nenhum saldo disponível para saque.' }
      }

      const total = livres.reduce((soma, linha) => soma + linha.valorCentavos, 0)

      /*
        O destino entra copiado no pedido, não por referência.

        A partir daqui este saque paga para estes dados, aconteça o que
        acontecer com a configuração do parceiro. Editar a chave depois vale
        para os próximos — um pedido pendente não muda de destino em silêncio.
      */
      const [saque] = await tx
        .insert(parceiroSaques)
        .values({
          parceiroId: parceiro.id,
          valorCentavos: total,
          recebimentoMetodo: destino.metodo,
          recebimentoTipoChave: destino.tipoChave,
          recebimentoChave: destino.chave,
          recebimentoTitular: destino.titular,
        })
        .returning({ id: parceiroSaques.id })

      // Se qualquer uma destas linhas colidir, a transação inteira cai: não
      // existe saque com metade das comissões reservadas.
      await tx.insert(parceiroSaqueItens).values(
        livres.map((comissao) => ({
          saqueId: saque.id,
          comissaoId: comissao.id,
          valorCentavos: comissao.valorCentavos,
        })),
      )

      /*
        A comissão **não** muda de status aqui.

        Ela continua `disponivel`: o dinheiro foi reservado, não pago. Marcá-la
        agora faria a tela dizer que o parceiro recebeu algo que ainda está com
        a Vincis. Quem sabe que ela está comprometida é o item do saque.
      */
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.saqueParceiroSolicitado,
          entidade: 'parceiro_saques',
          registroAfetado: saque.id,
          autorId: usuario.id,
          // Mesma origem que a área do Cliente já usa para os atos dela.
          origem: 'admin',
          metadados: {
            parceiroId: parceiro.id,
            valorCentavos: total,
            comissoes: livres.map((comissao) => comissao.id),
            // O destino fica identificável sem a chave inteira entrar na trilha.
            recebimentoTipoChave: destino.tipoChave,
            recebimentoFinalDaChave: destino.chave.slice(-4),
          },
        },
        tx,
      )

      return {
        sucesso: true as const,
        mensagem: 'Saque solicitado. O pagamento será processado pela Vincis.',
        dados: { saqueId: saque.id, valorCentavos: total },
      }
    })

    if (resultado.sucesso) revalidatePath(ROTA_PARCEIROS)
    return resultado
  } catch (erro) {
    // A corrida perdida não é defeito: é o banco fazendo o trabalho dele.
    if (ehReservaRepetida(erro)) {
      return {
        sucesso: false as const,
        mensagem: 'Este saldo acabou de ser usado em outra solicitação.',
      }
    }
    console.error('[PARCEIROS] falha ao solicitar saque', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível solicitar o saque. Tente novamente.',
    }
  }
}
