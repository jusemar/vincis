import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  perfisProfissionais,
  precificacaoProfissional,
  precificacaoProfissionalValores,
  usuarios,
} from '@/db/schema'
import {
  EVENTOS_PRECIFICACAO,
  registrarAviso,
} from '@/features/precificacao/lib/registro'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { conjuntoDeValores } from '../lib/grade'
import {
  primeiroNomeDe,
  tabelaDoProfissional,
} from '../lib/tabela-do-profissional'
import type { PrecificacaoPublicaDoProfissional } from '../types/precificacao-profissional'

/**
 * A tabela de preços que o cliente vê na página de um Profissional.
 *
 * ## Três portas, e todas antes do primeiro número
 *
 * 1. **A pessoa aparece publicamente**: conta ativa, verificada e cadastro de
 *    prestador habilitado — os mesmos critérios de `obterIdentidadePublica` e
 *    da vitrine de `/profissionais`. Ninguém entra na plataforma por esta porta
 *    se a listagem já não o mostraria.
 * 2. **Ele publicou**: `publicado = true`. Rascunho não vaza, por definição —
 *    a leitura nem olha para o estado `rascunho`.
 * 3. **O conjunto está completo**: se a grade da Vincis ganhou uma posição
 *    depois da última publicação, falta um número. Aqui isso vira "sem preço
 *    publicado", e nunca um preço montado com o valor da Vincis no buraco —
 *    seria cobrar em nome de outra pessoa.
 *
 * ## O motor é o mesmo, a tabela é outra
 *
 * O que sai daqui é uma `TabelaPrecificacao` comum, pronta para
 * `calcularPreco`. A página pública não conhece nenhuma regra de preço: ela
 * chama o motor da Vincis sobre esta tabela, exatamente como `/precos` chama
 * sobre a da casa.
 */
export async function obterPrecificacaoPublicaDoProfissional(
  prestadorId: string,
): Promise<PrecificacaoPublicaDoProfissional | null> {
  const [prestador] = await db
    .select({
      nome: usuarios.nome,
      publicado: precificacaoProfissional.publicado,
      publicadoEm: precificacaoProfissional.publicadoEm,
    })
    .from(usuarios)
    .innerJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .innerJoin(
      precificacaoProfissional,
      eq(precificacaoProfissional.profissionalId, usuarios.id),
    )
    .where(
      and(
        eq(usuarios.id, prestadorId),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorHabilitado(),
        eq(precificacaoProfissional.publicado, true),
      ),
    )
    .limit(1)

  if (!prestador) return null

  const [estrutura, linhas] = await Promise.all([
    obterTabelaPrecificacao(),
    db
      .select({
        tipo: precificacaoProfissionalValores.tipo,
        chave: precificacaoProfissionalValores.chave,
        valor: precificacaoProfissionalValores.valor,
      })
      .from(precificacaoProfissionalValores)
      .where(
        and(
          eq(precificacaoProfissionalValores.profissionalId, prestadorId),
          eq(precificacaoProfissionalValores.estado, 'publicado'),
        ),
      ),
  ])

  const { valores, faltando } = conjuntoDeValores(estrutura, linhas)
  if (faltando.length > 0) {
    // Falha alto no log e silêncio na tela: entre exibir um preço em que
    // ninguém pode confiar e não exibir preço, a escolha é a mesma de
    // `/precos`. O Profissional vê o campo pendente no painel dele.
    registrarAviso(EVENTOS_PRECIFICACAO.carregar, {
      escopo: 'precificacao_profissional',
      prestador: prestadorId,
      faltando: faltando.slice(0, 5),
    })
    return null
  }

  const primeiroNome = primeiroNomeDe(prestador.nome)

  return {
    prestadorId,
    nome: prestador.nome,
    primeiroNome,
    tabela: tabelaDoProfissional(estrutura, valores, { primeiroNome }),
    publicadoEm: prestador.publicadoEm,
  }
}
