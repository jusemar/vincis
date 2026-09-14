import { and, eq } from 'drizzle-orm'
import type { db as Banco } from '@/db/connection'
import { contratacoesServico, parceiroComissoes } from '@/db/schema'
import { PERCENTUAL_AVULSO } from '../constants/programa'
import { sincronizarCampanhasSemDerrubar } from './campanhas'

type Transacao = Parameters<Parameters<typeof Banco.transaction>[0]>[0]

/**
 * O valor da comissão, em centavos.
 *
 * Arredondamento no servidor e uma vez só: o resultado é copiado para a linha e
 * nunca recalculado na leitura. Duas telas que multiplicassem por conta própria
 * acabariam divergindo em um centavo, e um centavo de diferença num número
 * financeiro é um chamado de suporte.
 */
export function calcularComissaoCentavos(
  valorBaseCentavos: number,
  percentual: number,
): number {
  return Math.round((valorBaseCentavos * percentual) / 100)
}

/**
 * O valor da comissão a partir de um percentual em centésimos (500 = 5%).
 *
 * Só inteiros: `base × centésimos` cabe folgado num inteiro seguro, e o
 * arredondamento é meio-para-cima, feito uma vez. É o cálculo da recorrente,
 * cujo percentual vem da configuração da Gestão e pode ter duas casas.
 */
export function calcularComissaoPorCentesimos(
  valorBaseCentavos: number,
  percentualCentesimos: number,
): number {
  if (!Number.isInteger(valorBaseCentavos) || valorBaseCentavos < 0) {
    throw new Error('A base precisa ser um inteiro não negativo de centavos.')
  }
  if (!Number.isInteger(percentualCentesimos) || percentualCentesimos < 0) {
    throw new Error('O percentual precisa ser um inteiro não negativo de centésimos.')
  }
  return Math.floor((valorBaseCentavos * percentualCentesimos + 5_000) / 10_000)
}

/**
 * Registra a comissão que uma contratação efetiva gerou.
 *
 * ## Congelado, porque é direito adquirido
 *
 * Valor-base, percentual e resultado são copiados para a linha no instante em
 * que o direito nasce. Se a Vincis mudar o percentual amanhã, ou o prestador
 * mudar o preço do serviço, o que o parceiro já gerou continua valendo o que
 * valia — mesmo princípio de `parceiro_atribuicoes.prazo_dias`.
 *
 * ## Uma por negócio
 *
 * `on conflict do nothing` sobre o índice único de `contratacao_id`. Retry,
 * reload ou repetição da action não criam a segunda comissão: quem impede é o
 * banco. A função devolve `null` quando nada nasceu, e o chamador não precisa
 * saber a diferença.
 *
 * ## Só sobre valor real
 *
 * Contratação sem valor congelado — o caso do `sob_orcamento`, que ainda espera
 * proposta — não gera comissão. Calcular percentual sobre um preço que não
 * existe seria inventar dinheiro.
 *
 * ## O que ela não faz
 *
 * Não paga, não libera saque, não credita saldo e não toca no valor do
 * profissional: a comissão sai da parte da Vincis. Nascer `gerada` é dizer que
 * o direito existe e que o serviço ainda não terminou.
 */
export async function gerarComissaoDaContratacao(
  tx: Transacao,
  {
    parceiroId,
    atribuicaoId,
    contratacaoId,
    servico,
  }: {
    parceiroId: string
    atribuicaoId: string
    contratacaoId: string
    servico: string | null
  },
): Promise<{ id: string; valorCentavos: number } | null> {
  const [negocio] = await tx
    .select({
      clienteUsuarioId: contratacoesServico.clienteUsuarioId,
      profissionalId: contratacoesServico.prestadorId,
      valorCentavos: contratacoesServico.valorSnapshotCentavos,
    })
    .from(contratacoesServico)
    .where(eq(contratacoesServico.id, contratacaoId))
    .limit(1)

  if (!negocio || negocio.valorCentavos === null || negocio.valorCentavos <= 0) {
    return null
  }

  const percentual = PERCENTUAL_AVULSO
  const [criada] = await tx
    .insert(parceiroComissoes)
    .values({
      parceiroId,
      atribuicaoId,
      contratacaoId,
      clienteUsuarioId: negocio.clienteUsuarioId,
      profissionalId: negocio.profissionalId,
      servicoReferencia: servico,
      valorBaseCentavos: negocio.valorCentavos,
      percentual: percentual.toFixed(2),
      valorCentavos: calcularComissaoCentavos(negocio.valorCentavos, percentual),
    })
    .onConflictDoNothing({ target: parceiroComissoes.contratacaoId })
    .returning({
      id: parceiroComissoes.id,
      valorCentavos: parceiroComissoes.valorCentavos,
    })

  return criada ?? null
}

/**
 * Move a comissão de um negócio quando o negócio muda de estado.
 *
 * Só sai de `gerada`: comissão já paga não volta atrás, e cancelada não
 * ressuscita. O `where` carrega essa regra em vez de um `if` antes do update,
 * para que duas transições simultâneas não escrevam uma por cima da outra.
 *
 * Não lança e não devolve erro. Concluir ou cancelar uma contratação é ato do
 * prestador, e não pode falhar porque o programa de parceiros tropeçou.
 */
export async function moverComissaoDaContratacao(
  executor: Pick<typeof Banco, 'update'> & {
    transaction: <T>(fn: (tx: Transacao) => Promise<T>) => Promise<T>
  },
  contratacaoId: string,
  destino: 'disponivel' | 'cancelada',
): Promise<void> {
  const agora = new Date()
  try {
    const movidas = await executor
      .update(parceiroComissoes)
      .set({
        status: destino,
        updatedAt: agora,
        ...(destino === 'disponivel'
          ? { disponivelEm: agora }
          : { canceladaEm: agora }),
      })
      .where(
        and(
          eq(parceiroComissoes.contratacaoId, contratacaoId),
          eq(parceiroComissoes.status, 'gerada'),
        ),
      )
      .returning({ parceiroId: parceiroComissoes.parceiroId })

    // Serviço concluído é fato de campanha (serviços avulsos, valor gerado).
    // Num ponto de salvamento próprio: a conclusão nunca falha por causa dela.
    if (destino === 'disponivel') {
      for (const { parceiroId } of movidas) {
        await sincronizarCampanhasSemDerrubar(executor, parceiroId)
      }
    }
  } catch (erro) {
    console.error('[PARCEIROS] falha ao mover comissão', {
      contratacaoId,
      destino,
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
  }
}
