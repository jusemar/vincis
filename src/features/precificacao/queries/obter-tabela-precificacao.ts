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
import { violacoesComerciais } from '../lib/invariantes'
import {
  EVENTOS_PRECIFICACAO,
  registrarFalha,
} from '../lib/registro'
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
    // A ordenação de cada leitura termina numa chave única.
    //
    // `ordem` se repete entre famílias — a primeira faixa de notas e a primeira
    // de faturamento são as duas "1", e a primeira opção de regime e a de
    // atividade também. Com empate, o Postgres devolve a ordem que o plano
    // quiser, e ela muda entre execuções. Nada no produto depende disso hoje
    // (todo consumidor reordena), mas uma leitura que responde diferente para
    // a mesma pergunta é uma armadilha esperando o primeiro consumidor que
    // confie na ordem — e já tinha feito um teste piscar.
    executor.select().from(precificacaoPrecosBase).orderBy(
      asc(precificacaoPrecosBase.grupo),
      asc(precificacaoPrecosBase.regime),
    ),
    executor.select().from(precificacaoDimensoes).orderBy(asc(precificacaoDimensoes.ordem)),
    executor
      .select()
      .from(precificacaoOpcoes)
      .orderBy(
        asc(precificacaoOpcoes.dimensaoCodigo),
        asc(precificacaoOpcoes.ordem),
        asc(precificacaoOpcoes.codigo),
      ),
    executor
      .select()
      .from(precificacaoFaixas)
      .orderBy(
        asc(precificacaoFaixas.grupo),
        asc(precificacaoFaixas.tipo),
        asc(precificacaoFaixas.limiteMin),
      ),
    executor
      .select()
      .from(precificacaoAdicionais)
      .orderBy(asc(precificacaoAdicionais.ordem), asc(precificacaoAdicionais.codigo)),
    executor
      .select()
      .from(precificacaoDescontos)
      .orderBy(asc(precificacaoDescontos.ordem), asc(precificacaoDescontos.codigo)),
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
    registrarFalha(EVENTOS_PRECIFICACAO.carregar, {
      etapa: 'coerencia',
      problemas: problemas.slice(0, 5),
    })
    throw new Error(
      `Configuração de precificação incoerente: ${problemas.join(' ')}`,
    )
  }

  return tabela
}

/**
 * A tabela como a vitrine pública exige que ela esteja.
 *
 * Além da estrutura, confere as garantias comerciais: preço maior que zero em
 * qualquer perfil, desconto que não zera mensalidade, prazo maior nunca mais
 * caro, pacote abaixo da soma e economia que corresponde à diferença real.
 *
 * Lança quando alguma delas cai. É a decisão que dá nome a esta etapa: entre
 * exibir um preço possivelmente errado e não exibir preço nenhum, `/precos`
 * escolhe não exibir — e mostra um caminho comercial para a pessoa, em vez de
 * um número em que ninguém pode confiar.
 */
export async function obterTabelaDaVitrine(): Promise<TabelaPrecificacao> {
  const tabela = await obterTabelaPrecificacao()

  const violacoes = violacoesComerciais(tabela)
  if (violacoes.length > 0) {
    registrarFalha(EVENTOS_PRECIFICACAO.carregar, {
      etapa: 'invariantes',
      violacoes: violacoes.slice(0, 5).map((v) => `${v.secao}: ${v.mensagem}`),
    })
    throw new Error(
      `Configuração de precificação inválida para exibição: ${violacoes[0].mensagem}`,
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
