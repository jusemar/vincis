import type {
  DimensaoPrecificacao,
  FaixaPrecificacao,
  OpcaoPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import {
  DIMENSOES_COM_ACRESCIMO_FIXO,
  DIMENSOES_COM_FATOR,
  GRUPO_DO_PROFISSIONAL,
  TIPOS_DE_FAIXA_DO_PROFISSIONAL,
} from '../constants/precificacao-profissional'
import type {
  ConjuntoDeValores,
  ValoresDoProfissional,
} from '../types/precificacao-profissional'

/**
 * Quais números um Profissional precifica — perguntado à grade da Vincis.
 *
 * ## A lista não está escrita aqui
 *
 * Não existe neste arquivo um array com "quatro regimes, cinco faixas de nota,
 * três ramos". As posições são **lidas** da `TabelaPrecificacao` da Vincis, que
 * já foi validada por `obterTabelaPrecificacao`. Escrevê-las à mão criaria uma
 * segunda declaração da mesma grade, e no dia em que a Vincis acrescentasse uma
 * faixa de faturamento o painel do Profissional continuaria mostrando cinco
 * campos sem ninguém perceber.
 *
 * ## O que fica de fora, e por quê
 *
 * - O grupo `juridico`: a tabela individual é só de contabilidade mensal.
 * - `regime` e `emissor`: são dimensões sem multiplicador. A primeira escolhe
 *   qual preço-base vale; a segunda liga ou desliga a cobrança das notas.
 *   Nenhuma das duas é um número a configurar.
 * - Adicionais e descontos de prazo: não existem na versão do Profissional.
 */

export const chaveDaFaixa = (tipo: string, codigo: string) => `${tipo}/${codigo}`
export const chaveDoFator = (dimensao: string, opcao: string) =>
  `${dimensao}/${opcao}`

/** As faixas contábeis, na ordem em que o cliente as lê. */
export function faixasDaGrade(
  estrutura: TabelaPrecificacao,
  tipo: string,
): FaixaPrecificacao[] {
  return estrutura.faixas
    .filter((f) => f.grupo === GRUPO_DO_PROFISSIONAL && f.tipo === tipo)
    .sort((a, b) => a.limiteMin - b.limiteMin)
}

/** Todas as faixas que o Profissional precifica, em ordem de família. */
export function todasAsFaixasDaGrade(
  estrutura: TabelaPrecificacao,
): FaixaPrecificacao[] {
  return TIPOS_DE_FAIXA_DO_PROFISSIONAL.flatMap((tipo) =>
    faixasDaGrade(estrutura, tipo),
  )
}

/** Os regimes oferecidos ao cliente — um preço-base para cada. */
export function regimesDaGrade(
  estrutura: TabelaPrecificacao,
): OpcaoPrecificacao[] {
  return (
    estrutura.dimensoes
      .find((d) => d.codigo === 'regime')
      ?.opcoes.filter((o) => o.ativo) ?? []
  )
}

/** As dimensões cujo multiplicador o Profissional define, com suas opções. */
export function dimensoesComFator(
  estrutura: TabelaPrecificacao,
): DimensaoPrecificacao[] {
  return DIMENSOES_COM_FATOR.map((codigo) =>
    estrutura.dimensoes.find((d) => d.codigo === codigo),
  ).filter((d): d is DimensaoPrecificacao => Boolean(d))
}

/** As opções de uma dimensão que de fato multiplicam o preço. */
export function opcoesComFator(dimensao: DimensaoPrecificacao) {
  return dimensao.opcoes.filter(
    (o) => o.ativo && o.multiplicadorMilesimos !== null,
  )
}

/**
 * As dimensões cujas opções podem cobrar um valor fixo em reais.
 *
 * Subconjunto de `dimensoesComFator`, e não uma segunda lista: quem não define
 * acréscimo nenhum também não escolhe a forma de cobrá-lo.
 */
export function dimensoesComAcrescimoFixo(
  estrutura: TabelaPrecificacao,
): DimensaoPrecificacao[] {
  return dimensoesComFator(estrutura).filter((d) =>
    DIMENSOES_COM_ACRESCIMO_FIXO.includes(
      d.codigo as (typeof DIMENSOES_COM_ACRESCIMO_FIXO)[number],
    ),
  )
}

/** Toda posição da grade, na forma de chave. É o contrato de completude. */
export function chavesDaGrade(estrutura: TabelaPrecificacao) {
  return {
    precosBase: regimesDaGrade(estrutura).map((r) => r.codigo),
    faixas: todasAsFaixasDaGrade(estrutura).map((f) =>
      chaveDaFaixa(f.tipo, f.codigo),
    ),
    fatores: dimensoesComFator(estrutura).flatMap((d) =>
      opcoesComFator(d).map((o) => chaveDoFator(d.codigo, o.codigo)),
    ),
    // Estas o Profissional **pode** preencher, não **precisa**: a chave ausente
    // quer dizer "cobra em porcentagem", que é o padrão e o passado inteiro.
    acrescimosFixos: dimensoesComAcrescimoFixo(estrutura).flatMap((d) =>
      opcoesComFator(d).map((o) => chaveDoFator(d.codigo, o.codigo)),
    ),
  }
}

/**
 * Os valores da Vincis, como ponto de partida de quem nunca configurou.
 *
 * Não é a tabela da Vincis "emprestada": é uma **sugestão inicial** copiada uma
 * única vez para o rascunho de quem abre o painel pela primeira vez. A partir
 * do primeiro salvamento os dois conjuntos seguem vidas separadas, e um
 * reajuste da Vincis não move o preço de ninguém.
 *
 * A alternativa — abrir o painel com tudo zerado — daria uma tela de 23 campos
 * em branco e uma prévia de R$ 0 que a conferência comercial recusaria.
 */
export function valoresDeReferencia(
  estrutura: TabelaPrecificacao,
): ValoresDoProfissional {
  return {
    precosBase: Object.fromEntries(
      regimesDaGrade(estrutura).map((regime) => [
        regime.codigo,
        estrutura.precosBase.find(
          (p) => p.grupo === GRUPO_DO_PROFISSIONAL && p.regime === regime.codigo,
        )?.valorCentavos ?? 0,
      ]),
    ),
    faixas: Object.fromEntries(
      todasAsFaixasDaGrade(estrutura).map((faixa) => [
        chaveDaFaixa(faixa.tipo, faixa.codigo),
        faixa.valorCentavos,
      ]),
    ),
    fatores: Object.fromEntries(
      dimensoesComFator(estrutura).flatMap((dimensao) =>
        opcoesComFator(dimensao).map((opcao) => [
          chaveDoFator(dimensao.codigo, opcao.codigo),
          opcao.multiplicadorMilesimos ?? 1000,
        ]),
      ),
    ),
    // A Vincis cobra tudo em porcentagem. Quem começa a configurar começa daí,
    // e escolhe reais onde quiser.
    acrescimosFixos: {},
  }
}

/**
 * As linhas do banco viram um conjunto de valores — e dizem o que faltou.
 *
 * A grade manda: o conjunto tem exatamente as chaves que a estrutura da Vincis
 * define hoje. Linha gravada para uma chave que não existe mais é ignorada (uma
 * faixa aposentada não pode ressuscitar no preço de ninguém); chave da grade
 * sem linha gravada entra em `faltando` e recebe o valor de referência, para
 * quem chama decidir o que fazer com o buraco.
 *
 * `acrescimo_fixo` é a exceção, e é ela que dá compatibilidade a quem já tinha
 * publicado: a linha é **opcional** por definição, então não existir não é
 * buraco nenhum — é a opção cobrando em porcentagem, como sempre cobrou. Um
 * conjunto gravado antes desta escolha existir continua completo.
 */
export function conjuntoDeValores(
  estrutura: TabelaPrecificacao,
  linhas: { tipo: string; chave: string; valor: number }[],
): ConjuntoDeValores {
  const referencia = valoresDeReferencia(estrutura)
  const gravado = new Map(
    linhas.map((linha) => [`${linha.tipo}:${linha.chave}`, linha.valor]),
  )
  const faltando: string[] = []

  const preencher = (
    tipo: string,
    padroes: Record<string, number>,
  ): Record<string, number> =>
    Object.fromEntries(
      Object.entries(padroes).map(([chave, referencia]) => {
        const valor = gravado.get(`${tipo}:${chave}`)
        if (valor === undefined) faltando.push(`${tipo}:${chave}`)
        return [chave, valor ?? referencia]
      }),
    )

  // Só as posições que a grade admite cobrar em reais, e só as que foram
  // gravadas. O resto do conjunto responde em porcentagem.
  const permitidas = new Set(chavesDaGrade(estrutura).acrescimosFixos)
  const acrescimosFixos = Object.fromEntries(
    linhas
      .filter((l) => l.tipo === 'acrescimo_fixo' && permitidas.has(l.chave))
      .map((l) => [l.chave, l.valor]),
  )

  return {
    valores: {
      precosBase: preencher('preco_base', referencia.precosBase),
      faixas: preencher('faixa', referencia.faixas),
      fatores: preencher('fator', referencia.fatores),
      acrescimosFixos,
    },
    faltando,
  }
}

/** O conjunto na forma de linhas, para gravar. */
export function linhasDosValores(valores: ValoresDoProfissional) {
  return [
    ...Object.entries(valores.precosBase).map(([chave, valor]) => ({
      tipo: 'preco_base' as const,
      chave,
      valor,
    })),
    ...Object.entries(valores.faixas).map(([chave, valor]) => ({
      tipo: 'faixa' as const,
      chave,
      valor,
    })),
    ...Object.entries(valores.fatores).map(([chave, valor]) => ({
      tipo: 'fator' as const,
      chave,
      valor,
    })),
    // Quem cobra em porcentagem não gera linha aqui — e é por isso que o
    // percentual continua gravado ao lado: voltar para % é apagar esta linha,
    // não redigitar o número.
    ...Object.entries(valores.acrescimosFixos).map(([chave, valor]) => ({
      tipo: 'acrescimo_fixo' as const,
      chave,
      valor,
    })),
  ]
}

/** Dois conjuntos de valores dizem a mesma coisa? Base de "há algo a publicar?". */
export function valoresIguais(
  a: ValoresDoProfissional,
  b: ValoresDoProfissional | null,
): boolean {
  if (!b) return false
  return impressaoDosValores(a) === impressaoDosValores(b)
}

/** Retrato ordenado de um conjunto — não depende da ordem de leitura do banco. */
export function impressaoDosValores(valores: ValoresDoProfissional): string {
  return linhasDosValores(valores)
    .map((l) => `${l.tipo}:${l.chave}=${l.valor}`)
    .sort()
    .join('|')
}
