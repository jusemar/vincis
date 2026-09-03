import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import type { EstadoDaConfiguracao } from '../constants/precificacao-profissional'

/**
 * Os números de um Profissional, na forma em que o cálculo os consome.
 *
 * As chaves são posições da grade da Vincis, não rótulos: `simples`,
 * `notas_fiscais/11a30`, `atividade/comercio`. É o que permite a Vincis
 * renomear uma faixa ou reordenar uma dimensão sem invalidar o preço que
 * alguém já configurou.
 *
 * Unidades, iguais às da família `precificacao_*`: centavos em `precosBase`,
 * `faixas` e `acrescimosFixos`, milésimos em `fatores` (1080 = 1,080×).
 */
export type ValoresDoProfissional = {
  /** Código do regime → centavos. */
  precosBase: Record<string, number>
  /** `tipo/codigo` da faixa → centavos. */
  faixas: Record<string, number>
  /** `dimensao/opcao` → milésimos. */
  fatores: Record<string, number>
  /**
   * `dimensao/opcao` → centavos, para quem cobra em reais em vez de %.
   *
   * **A ausência da chave é a informação**: sem ela, a opção cobra o percentual
   * de `fatores`, que é como toda configuração gravada antes desta escolha
   * existir continua sendo lida. Com ela, o percentual fica guardado e sem
   * efeito — trocar de volta para % devolve exatamente o valor de antes.
   *
   * Só as opções das dimensões em `DIMENSOES_COM_ACRESCIMO_FIXO` podem
   * aparecer aqui, e a conferência recusa qualquer outra chave.
   */
  acrescimosFixos: Record<string, number>
}

/**
 * Um conjunto de valores lido do banco, com o que faltou nele.
 *
 * `faltando` existe porque a grade da Vincis pode crescer depois de alguém
 * publicar: uma faixa nova de faturamento não estaria no conjunto gravado. O
 * painel completa esses buracos com o valor de referência para que a pessoa
 * termine e republique; a página pública, não — lá um conjunto incompleto vira
 * "sem preço publicado", nunca um preço montado pela metade.
 */
export type ConjuntoDeValores = {
  valores: ValoresDoProfissional
  faltando: string[]
}

/** O que o painel do Profissional carrega para abrir. */
export type ConfiguracaoDoProfissional = {
  profissionalId: string
  nome: string
  publicado: boolean
  publicadoEm: Date | null
  /** Já existiu alguma publicação? Distingue "nunca publicou" de "despublicou". */
  jaPublicouAlgumaVez: boolean
  /** O que está sendo editado. Nasce igual à referência quando nunca houve nada. */
  rascunho: ValoresDoProfissional
  /** O que está no ar. `null` enquanto nada foi publicado. */
  publicadoValores: ValoresDoProfissional | null
  /** A configuração ainda não tinha sido criada — o rascunho é uma sugestão. */
  novo: boolean
}

/** A tabela de preços de um Profissional, pronta para o motor. */
export type PrecificacaoPublicaDoProfissional = {
  prestadorId: string
  nome: string
  primeiroNome: string
  tabela: TabelaPrecificacao
  publicadoEm: Date | null
}

/** O que uma gravação do painel devolve para a tela. */
export type ResultadoDaGravacao = {
  sucesso: boolean
  mensagem: string
  /** Seção onde está o problema, quando dá para apontar. */
  secao?: string
  campo?: string
}

export type { EstadoDaConfiguracao }
