import { asc, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  precificacaoAdicionais,
  precificacaoDescontos,
  precificacaoDimensoes,
  precificacaoFaixas,
  precificacaoOpcoes,
  precificacaoPrecosBase,
  precificacaoServicos,
  configuracoesPlataforma,
} from '@/db/schema'
import {
  CHAVE_PRECIFICACAO_ARREDONDAMENTO,
  CHAVE_PRECIFICACAO_FUNCIONARIOS_PADRAO,
  lerNumero,
} from '@/features/configuracoes/lib/configuracoes'
import { problemasDaTabela } from '../lib/coerencia'
import { TabelaPrecificacaoSchema } from '../schemas/precificacao'
import type { TabelaPrecificacao } from '../types/precificacao'

/**
 * A configuração comercial inteira, lida de uma vez.
 *
 * ## Uma leitura, não sete
 *
 * O preço de um plano depende de todas as grades ao mesmo tempo — base, faixas,
 * fatores, adicionais, descontos. Devolver pedaços faria cada chamador montar o
 * conjunto por conta própria, e duas telas montariam versões diferentes do
 * mesmo preço. O motor da próxima etapa recebe **esta** estrutura e não fala com
 * o banco: é o que permite calcular preço fora de uma requisição — num teste,
 * numa proposta, numa contratação — sem `/precos` ser a fonte da regra.
 *
 * ## Falha alto
 *
 * O Zod e `problemasDaTabela` conferem, respectivamente, cada linha e o
 * conjunto. Uma grade incoerente lança aqui em vez de virar um preço menor que
 * ninguém consegue explicar. É o oposto do fallback silencioso: não existe
 * tabela de emergência em código para cair, porque uma tabela de emergência
 * seria exatamente o mock que esta etapa veio remover.
 */
export async function obterTabelaPrecificacao(
  executor: ExecutorPrecificacao = db,
): Promise<TabelaPrecificacao> {
  const [
    servicos,
    precosBase,
    dimensoes,
    opcoes,
    faixas,
    adicionais,
    descontos,
    arredondamento,
    funcionariosPadrao,
  ] = await Promise.all([
    executor.select().from(precificacaoServicos).orderBy(asc(precificacaoServicos.ordem)),
    executor.select().from(precificacaoPrecosBase),
    executor.select().from(precificacaoDimensoes).orderBy(asc(precificacaoDimensoes.ordem)),
    executor.select().from(precificacaoOpcoes).orderBy(asc(precificacaoOpcoes.ordem)),
    executor.select().from(precificacaoFaixas).orderBy(asc(precificacaoFaixas.ordem)),
    executor.select().from(precificacaoAdicionais).orderBy(asc(precificacaoAdicionais.ordem)),
    executor.select().from(precificacaoDescontos).orderBy(asc(precificacaoDescontos.ordem)),
    lerParametro(executor, CHAVE_PRECIFICACAO_ARREDONDAMENTO),
    lerParametro(executor, CHAVE_PRECIFICACAO_FUNCIONARIOS_PADRAO),
  ])

  const tabela = TabelaPrecificacaoSchema.parse({
    servicos,
    precosBase,
    dimensoes: dimensoes.map((dimensao) => ({
      ...dimensao,
      opcoes: opcoes.filter((o) => o.dimensaoCodigo === dimensao.codigo),
    })),
    faixas,
    adicionais,
    descontos,
    parametros: {
      arredondamentoCentavos: lerNumero(
        CHAVE_PRECIFICACAO_ARREDONDAMENTO,
        arredondamento,
      ),
      funcionariosPadrao: lerNumero(
        CHAVE_PRECIFICACAO_FUNCIONARIOS_PADRAO,
        funcionariosPadrao,
      ),
    },
  })

  const problemas = problemasDaTabela(tabela)
  if (problemas.length > 0) {
    throw new Error(
      `Configuração de precificação incoerente: ${problemas.join(' ')}`,
    )
  }

  return tabela
}

/**
 * Quem executa as consultas.
 *
 * A leitura precisa acontecer **dentro** da transação que acabou de escrever,
 * para que a conferência de coerência veja o estado que está prestes a ser
 * confirmado e não o anterior. Por isso a função aceita o `tx` no lugar da
 * conexão — é a mesma leitura, e não uma segunda versão dela feita à mão
 * dentro da action.
 */
export type ExecutorPrecificacao = Pick<typeof db, 'select'>

async function lerParametro(executor: ExecutorPrecificacao, chave: string) {
  const [linha] = await executor
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, chave))
    .limit(1)
  return linha?.valor ?? null
}
