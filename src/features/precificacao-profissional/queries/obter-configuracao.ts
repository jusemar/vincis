import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  precificacaoProfissional,
  precificacaoProfissionalValores,
  usuarios,
} from '@/db/schema'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import { conjuntoDeValores, valoresDeReferencia } from '../lib/grade'
import type { ConfiguracaoDoProfissional } from '../types/precificacao-profissional'

/**
 * A configuração de preços de um Profissional, como o painel dele a abre.
 *
 * ## Duas leituras, e uma delas é emprestada
 *
 * A **estrutura** vem de `obterTabelaPrecificacao` — a mesma leitura que
 * `/precos` e a Precificação do Gestor fazem, sem nenhuma variação. É dela que
 * saem os regimes, as faixas, os limites e as perguntas. Os **valores** vêm das
 * tabelas do Profissional. Nenhum preço da Vincis atravessa para cá: a
 * derivação substitui todos.
 *
 * ## Quem nunca configurou não abre a tela vazia
 *
 * O rascunho de estreia é uma cópia dos valores da Vincis, gravada em lugar
 * nenhum até a pessoa salvar. É sugestão, e a tela diz isso. A alternativa —
 * 23 campos em branco e uma prévia de R$ 0 — daria uma primeira tela que a
 * própria conferência comercial recusaria publicar.
 *
 * ## Recorte
 *
 * `profissionalId` vem sempre da sessão de quem chama, nunca da URL ou do
 * corpo. Esta função não tem como ler a configuração de outra pessoa porque
 * quem a chama não tem como pedir outra.
 */
export async function obterConfiguracaoDoProfissional(
  profissionalId: string,
): Promise<ConfiguracaoDoProfissional | null> {
  const [estrutura, [dono], [cabecalho], linhas] = await Promise.all([
    obterTabelaPrecificacao(),
    db
      .select({ nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.id, profissionalId))
      .limit(1),
    db
      .select({
        publicado: precificacaoProfissional.publicado,
        publicadoEm: precificacaoProfissional.publicadoEm,
      })
      .from(precificacaoProfissional)
      .where(eq(precificacaoProfissional.profissionalId, profissionalId))
      .limit(1),
    db
      .select({
        estado: precificacaoProfissionalValores.estado,
        tipo: precificacaoProfissionalValores.tipo,
        chave: precificacaoProfissionalValores.chave,
        valor: precificacaoProfissionalValores.valor,
      })
      .from(precificacaoProfissionalValores)
      .where(eq(precificacaoProfissionalValores.profissionalId, profissionalId)),
  ])

  if (!dono) return null

  const doEstado = (estado: string) => linhas.filter((l) => l.estado === estado)
  const linhasRascunho = doEstado('rascunho')
  const linhasPublicadas = doEstado('publicado')

  // Buracos no rascunho são preenchidos com a referência: a grade da Vincis
  // pode ter ganhado uma faixa depois da última gravação, e a pessoa precisa
  // conseguir ver o campo novo para respondê-lo.
  const rascunho =
    linhasRascunho.length > 0
      ? conjuntoDeValores(estrutura, linhasRascunho).valores
      : valoresDeReferencia(estrutura)

  const publicadoValores =
    linhasPublicadas.length > 0
      ? conjuntoDeValores(estrutura, linhasPublicadas).valores
      : null

  return {
    profissionalId,
    nome: dono.nome,
    publicado: cabecalho?.publicado ?? false,
    publicadoEm: cabecalho?.publicadoEm ?? null,
    jaPublicouAlgumaVez: publicadoValores !== null,
    rascunho,
    publicadoValores,
    novo: linhasRascunho.length === 0,
  }
}

/** A estrutura da Vincis, sozinha — para quem já tem os valores em mãos. */
export async function obterEstruturaDaGrade(): Promise<TabelaPrecificacao> {
  return obterTabelaPrecificacao()
}

/**
 * O perfil público deste prestador oferece "Ver planos e preços"?
 *
 * Uma consulta de uma linha, sem carregar valor nenhum: é o que o cartão do
 * perfil precisa saber, e ele é renderizado em toda visita.
 */
export async function temPrecosPublicados(
  prestadorId: string,
): Promise<boolean> {
  const [linha] = await db
    .select({ publicado: precificacaoProfissional.publicado })
    .from(precificacaoProfissional)
    .where(
      and(
        eq(precificacaoProfissional.profissionalId, prestadorId),
        eq(precificacaoProfissional.publicado, true),
      ),
    )
    .limit(1)
  return Boolean(linha)
}
