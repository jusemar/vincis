import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { parceiroEventos, parceiroIndicacoes, parceiros } from '@/db/schema'
import { codigoBemFormado, normalizarCodigo } from './codigo-do-parceiro'
import { hashDoVisitante } from './visitante'

export type ResultadoDoAcesso =
  /** O código não existe (ou nem tem forma de código). Nada foi gravado. */
  | { registrado: false }
  /** Acesso gravado. `indicacaoId` é o ciclo atual deste navegador. */
  | { registrado: true; indicacaoId: string; cicloNovo: boolean }

/**
 * Registra a chegada de um navegador pelo link de um parceiro.
 *
 * ## Ciclo novo ou evento no ciclo aberto
 *
 * Se o ciclo aberto deste navegador já é do mesmo parceiro, o acesso vira só
 * mais um evento nele. Abrir um ciclo por clique faria o parceiro que manda o
 * próprio link no grupo da família aparecer com vinte indicações da mesma
 * pessoa — e, pior, obrigaria alguém a decidir depois qual dos vinte é "a"
 * indicação que vale.
 *
 * Se o ciclo aberto é de **outro** parceiro, ele é fechado (`substituida_em` e
 * `substituida_por_id`) e um novo é aberto. Nada é apagado: o histórico do
 * primeiro parceiro continua inteiro, com os eventos dele, e a substituição
 * fica registrada dos dois lados. É a preparação técnica da regra do último
 * parceiro válido — não é a regra comercial, que ainda não existe.
 *
 * ## Tudo ou nada
 *
 * Fechar o ciclo antigo, abrir o novo e gravar o evento acontecem na mesma
 * transação. Sem isso, uma falha no meio deixaria o navegador sem nenhum ciclo
 * aberto — ou com dois, o que o índice parcial recusa.
 *
 * ## Corrida entre duas abas
 *
 * Dois acessos simultâneos do mesmo navegador passariam os dois pela consulta
 * antes de qualquer um gravar. Quem decide é o índice
 * `parceiro_indicacoes_ciclo_aberto_unico`: o segundo insert falha, e a
 * chamada é refeita uma vez — aí ela já enxerga o ciclo que o primeiro abriu.
 */
export async function registrarAcessoPeloLink({
  codigo,
  visitanteToken,
  userAgent,
  referenciaHost,
}: {
  codigo: string
  /** Token cru do cookie. Só o hash dele chega ao banco. */
  visitanteToken: string
  userAgent: string | null
  referenciaHost: string | null
}): Promise<ResultadoDoAcesso> {
  // Forma errada nem chega ao banco: `/p/../../algo` não é consulta, é ruído.
  if (!codigoBemFormado(codigo)) return { registrado: false }

  const [parceiro] = await db
    .select({ id: parceiros.id })
    .from(parceiros)
    .where(eq(parceiros.codigo, normalizarCodigo(codigo)))
    .limit(1)

  // Código inexistente não grava nada e não se distingue, para quem acessa, de
  // um código válido: os dois terminam na mesma home.
  if (!parceiro) return { registrado: false }

  const visitanteHash = hashDoVisitante(visitanteToken)

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      return await db.transaction(async (tx) => {
        const [aberto] = await tx
          .select({ id: parceiroIndicacoes.id, parceiroId: parceiroIndicacoes.parceiroId })
          .from(parceiroIndicacoes)
          .where(
            and(
              eq(parceiroIndicacoes.visitanteHash, visitanteHash),
              isNull(parceiroIndicacoes.substituidaEm),
            ),
          )
          .limit(1)

        if (aberto?.parceiroId === parceiro.id) {
          await tx.insert(parceiroEventos).values({
            indicacaoId: aberto.id,
            tipo: 'acessou_link',
          })
          return { registrado: true as const, indicacaoId: aberto.id, cicloNovo: false }
        }

        // Fecha antes de abrir: é o índice parcial que exige um só ciclo aberto.
        if (aberto) {
          await tx
            .update(parceiroIndicacoes)
            .set({ substituidaEm: new Date(), updatedAt: new Date() })
            .where(eq(parceiroIndicacoes.id, aberto.id))
        }

        const [novo] = await tx
          .insert(parceiroIndicacoes)
          .values({
            parceiroId: parceiro.id,
            visitanteHash,
            origem: 'link_indicacao',
            userAgent,
            referenciaHost,
          })
          .returning({ id: parceiroIndicacoes.id })

        if (aberto) {
          await tx
            .update(parceiroIndicacoes)
            .set({ substituidaPorId: novo.id })
            .where(eq(parceiroIndicacoes.id, aberto.id))
        }

        await tx.insert(parceiroEventos).values({
          indicacaoId: novo.id,
          tipo: 'acessou_link',
        })

        return { registrado: true as const, indicacaoId: novo.id, cicloNovo: true }
      })
    } catch (erro) {
      const codigoErro =
        typeof erro === 'object' && erro !== null && 'code' in erro
          ? (erro as { code?: string }).code
          : undefined
      // 23505: outra aba abriu o ciclo primeiro. Refaz a leitura uma vez.
      if (codigoErro !== '23505' || tentativa === 1) throw erro
    }
  }

  return { registrado: false }
}
