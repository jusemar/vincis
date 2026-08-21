import { and, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidades } from '@/db/schema'

/**
 * A parte da vigência que fala com o banco.
 *
 * Separado de `vigencia.ts` (puro) pelo mesmo motivo que `prestador.ts` é
 * separado de `tipos-pessoa.ts`: componentes de cliente precisam das regras sem
 * carregar o Drizzle. Os predicados puros são reexportados aqui para que o
 * código de servidor tenha um ponto único de importação.
 */

export {
  VALIDADES_PROPOSTA,
  VALIDADE_PADRAO_HORAS,
  limitarValidade,
  oportunidadeExpirada,
  propostaVigente,
  statusVisivel,
  type HorasValidade,
} from './vigencia'

/** Uma oportunidade viva: aberta **e** dentro do prazo global. */
export function condicaoOportunidadeAtiva(): SQL {
  return and(
    eq(oportunidades.status, 'aberta'),
    // Solicitações anteriores ao prazo global não têm `expira_em` e seguem
    // ativas: elas nasceram sob a regra antiga e não podem expirar
    // retroativamente.
    or(isNull(oportunidades.expiraEm), gt(oportunidades.expiraEm, sql`now()`)),
  ) as SQL
}

/**
 * Materializa o vencimento das solicitações cujo prazo passou.
 *
 * Idempotente e sem efeitos colaterais: um `UPDATE` que só alcança linhas já
 * vencidas, sem notificar ninguém e sem apagar nada. Existe porque o projeto
 * **não tem agendador** — nenhum cron, job ou fila. Enquanto não tiver, quem
 * chama isto são as próprias leituras do domínio, e a corretude não depende
 * disso: `condicaoOportunidadeAtiva` já trata a vencida como fora do ar mesmo
 * que a coluna ainda diga `aberta`.
 *
 * Com um agendador disponível, esta é a função a chamar periodicamente — e as
 * chamadas nas leituras podem sair sem nenhuma outra mudança.
 */
export async function expirarOportunidadesVencidas() {
  const expiradas = await db
    .update(oportunidades)
    .set({ status: 'expirada', updatedAt: new Date() })
    .where(
      and(
        eq(oportunidades.status, 'aberta'),
        sql`${oportunidades.expiraEm} is not null and ${oportunidades.expiraEm} <= now()`,
      ),
    )
    .returning({ id: oportunidades.id })

  return expiradas.length
}
