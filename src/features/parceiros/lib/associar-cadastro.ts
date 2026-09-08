import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { parceiroEventos, parceiroIndicacoes, usuarios } from '@/db/schema'
import { hashDoVisitante, tokenDeVisitanteValido } from './visitante'

export type ResultadoDaAssociacao =
  | { associou: false; motivo: MotivoNaoAssociar }
  | { associou: true; indicacaoId: string }

export type MotivoNaoAssociar =
  /** O navegador não trazia identificador de indicação. */
  | 'sem-indicacao'
  /** Havia identificador, mas nenhum ciclo aberto para ele. */
  | 'sem-ciclo-aberto'
  /** A conta é anterior à indicação: já era da base. */
  | 'conta-anterior-a-indicacao'
  /** O ciclo já pertence a outra conta. Primeiro a chegar continua dono. */
  | 'ciclo-de-outro-usuario'
  /** Já estava associado a esta mesma conta. Nada a fazer. */
  | 'ja-associado'
  /** Falhou. Registrado no log; o cadastro segue normalmente. */
  | 'erro'

/**
 * Liga uma indicação anônima à conta que acabou de nascer dela.
 *
 * ## Quando roda
 *
 * Logo depois de o usuário ser criado, nos dois caminhos de cadastro. Não é uma
 * etapa do cadastro: é uma consequência dele. Por isso **nunca lança** — uma
 * falha aqui vira log e o cadastro termina igual. Fazer a criação de conta
 * depender do programa de indicação seria trocar um fluxo crítico por um
 * acessório.
 *
 * ## Quem já era da base não é captado
 *
 * A regra é do produto: parceiro traz gente **nova**. A conferência é por data
 * — a indicação precisa ser anterior à criação da conta —, e é por isso que ela
 * mora aqui e não na confiança de quem chama: qualquer caminho futuro que
 * invoque esta função com uma conta antiga é recusado do mesmo jeito, e o
 * motivo fica provável pelos dois `created_at`.
 *
 * Note o efeito prático: quem já tem conta e clica no link de um parceiro nunca
 * passa por aqui, porque não há cadastro acontecendo. A data é a segunda
 * barreira, não a primeira.
 *
 * ## Só o ciclo aberto
 *
 * Se o navegador passou por João e depois por Maria, quem recebe o cadastro é
 * **Maria** — o ciclo aberto. O de João continua inteiro, fechado, com os
 * eventos dele. É a regra do último parceiro válido aplicada ao único momento
 * em que ela já tem consequência real.
 *
 * ## Idempotência
 *
 * O `update` é condicionado a `usuario_id is null` e devolve a linha só quando
 * de fato a reivindicou. Repetir a chamada não grava um segundo evento, e duas
 * chamadas simultâneas não disputam: a segunda encontra a coluna preenchida e
 * sai. Um ciclo que já pertence a **outra** conta não é sobrescrito — trocar o
 * dono depois seria exatamente a fraude de atribuição que a regra proíbe.
 *
 * ## Confiança
 *
 * `usuarioId` vem de quem acabou de criar a conta, no servidor. O elo com a
 * indicação vem do cookie — que o navegador guarda mas não escolhe, porque foi
 * o servidor que o sorteou e é o hash dele que o banco compara. Nada aqui
 * aceita identificador vindo do corpo da requisição.
 */
export async function associarIndicacaoAoCadastro({
  usuarioId,
  visitanteToken,
}: {
  usuarioId: string
  /** Valor cru do cookie do visitante, ou nada quando não havia. */
  visitanteToken: string | undefined
}): Promise<ResultadoDaAssociacao> {
  if (!tokenDeVisitanteValido(visitanteToken)) {
    return { associou: false, motivo: 'sem-indicacao' }
  }

  try {
    const [conta] = await db
      .select({ criadoEm: usuarios.createdAt })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1)

    if (!conta) return { associou: false, motivo: 'sem-ciclo-aberto' }

    const [aberto] = await db
      .select({
        id: parceiroIndicacoes.id,
        criadoEm: parceiroIndicacoes.createdAt,
        usuarioId: parceiroIndicacoes.usuarioId,
      })
      .from(parceiroIndicacoes)
      .where(
        and(
          eq(parceiroIndicacoes.visitanteHash, hashDoVisitante(visitanteToken)),
          isNull(parceiroIndicacoes.substituidaEm),
        ),
      )
      .limit(1)

    if (!aberto) return { associou: false, motivo: 'sem-ciclo-aberto' }

    if (aberto.usuarioId) {
      return aberto.usuarioId === usuarioId
        ? { associou: false, motivo: 'ja-associado' }
        : { associou: false, motivo: 'ciclo-de-outro-usuario' }
    }

    // A conta precisa ter nascido depois da indicação. Igualdade conta como
    // válida: cadastro no mesmo instante do acesso é o caso do formulário
    // aberto direto pelo link.
    if (conta.criadoEm < aberto.criadoEm) {
      return { associou: false, motivo: 'conta-anterior-a-indicacao' }
    }

    const [reivindicado] = await db
      .update(parceiroIndicacoes)
      .set({ usuarioId, updatedAt: new Date() })
      .where(
        and(
          eq(parceiroIndicacoes.id, aberto.id),
          // A condição é a trava: quem chegar depois não encontra linha.
          isNull(parceiroIndicacoes.usuarioId),
        ),
      )
      .returning({ id: parceiroIndicacoes.id })

    if (!reivindicado) return { associou: false, motivo: 'ciclo-de-outro-usuario' }

    await db.insert(parceiroEventos).values({
      indicacaoId: reivindicado.id,
      tipo: 'cadastrou_conta',
    })

    return { associou: true, indicacaoId: reivindicado.id }
  } catch (erro) {
    // O cadastro não pode falhar por causa do programa de indicação.
    console.error('[PARCEIROS] falha ao associar indicação ao cadastro', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return { associou: false, motivo: 'erro' }
  }
}
