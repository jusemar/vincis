'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { parceiros } from '@/db/schema'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { gerarCodigoDoParceiro } from '../lib/codigo-do-parceiro'
import { obterParceiroDoUsuario } from '../queries/obter-parceiro'

/**
 * Quantas vezes tentar um código novo antes de desistir.
 *
 * Com 30⁸ combinações e a tabela vazia, a primeira tentativa acerta
 * praticamente sempre; as outras existem para o dia em que não acertar. Cinco
 * colisões seguidas não são azar, são sinal de que o gerador quebrou — e aí
 * falhar é melhor do que insistir para sempre.
 */
const TENTATIVAS = 5

/** Violação de unicidade do Postgres. */
function ehCodigoRepetido(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: string }).code === '23505'
  )
}

/**
 * Ativa o Programa de Parceiros para a conta da sessão.
 *
 * ## Automática, e ainda assim um ato
 *
 * Não existe análise, aprovação nem espera: quem clica sai parceiro. O clique
 * existe porque a adesão a um programa é uma decisão da pessoa, e porque abrir
 * uma página não deve escrever no banco — uma visita a `/cliente/parceiros`
 * criaria registro para quem só estava olhando.
 *
 * ## Idempotente de verdade
 *
 * Três coisas garantem que ninguém tenha dois links: a consulta antes do
 * insert, o `on conflict do nothing` em `usuario_id` e o índice único no banco.
 * Só a terceira resiste a dois cliques simultâneos — as duas primeiras evitam o
 * trabalho, a última evita o erro. Quando o conflito acontece, a resposta é a
 * mesma de quem já era parceiro: sucesso, com o link que já existia.
 *
 * ## Quem pode
 *
 * Qualquer conta autenticada e verificada — Cliente, Profissional ou Gestor.
 * Ser parceiro não substitui nem altera o papel de ninguém, então não há regra
 * de perfil a conferir aqui. A identidade vem de `obterSessaoServidor`; a ação
 * não recebe parâmetro nenhum, e por isso não há como ativar a conta alheia.
 */
export async function ativarParceiro() {
  const usuario = await obterSessaoServidor()
  if (!usuario) return SEM_AUTORIZACAO

  const jaParceiro = await obterParceiroDoUsuario(usuario.id)
  if (jaParceiro) {
    return {
      sucesso: true as const,
      mensagem: 'Seu link de indicação já estava ativo.',
      codigo: jaParceiro.codigo,
    }
  }

  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    try {
      const [criado] = await db
        .insert(parceiros)
        .values({ usuarioId: usuario.id, codigo: gerarCodigoDoParceiro() })
        // Alvo explícito: sem ele, uma colisão de `codigo` seria confundida com
        // "já é parceiro" e a pessoa ficaria sem registro e sem erro.
        .onConflictDoNothing({ target: parceiros.usuarioId })
        .returning({ codigo: parceiros.codigo })

      if (criado) {
        revalidatePath(ROTA_PARCEIROS)
        return {
          sucesso: true as const,
          mensagem: 'Programa de Parceiros ativado. Seu link já está pronto.',
          codigo: criado.codigo,
        }
      }

      // Nada inserido e nenhum erro: outra requisição da mesma pessoa chegou
      // primeiro. O parceiro existe — é dela, e é o mesmo.
      const concorrente = await obterParceiroDoUsuario(usuario.id)
      if (concorrente) {
        return {
          sucesso: true as const,
          mensagem: 'Seu link de indicação já estava ativo.',
          codigo: concorrente.codigo,
        }
      }
    } catch (erro) {
      if (!ehCodigoRepetido(erro)) throw erro
      // Código sorteado já era de outra pessoa. Sorteia outro.
    }
  }

  return {
    sucesso: false as const,
    mensagem: 'Não foi possível ativar agora. Tente novamente em instantes.',
  }
}
