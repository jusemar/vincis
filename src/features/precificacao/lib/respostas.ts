import { erroPrecificacao } from './erros'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../types/precificacao'

/**
 * As respostas com que o configurador abre.
 *
 * Saem da própria configuração: a opção marcada como `padrao` em cada dimensão,
 * a faixa `padrao` de cada família e a quantidade de funcionários guardada nos
 * parâmetros. Antes eram um objeto escrito à mão ao lado da fórmula; agora
 * mudar o padrão da vitrine é mudar uma linha no banco, não um deploy.
 */
export function respostasIniciais(
  tabela: TabelaPrecificacao,
): RespostasPrecificacao {
  const padraoDaDimensao = (codigo: string) => {
    const dimensao = tabela.dimensoes.find((d) => d.codigo === codigo)
    const opcao = dimensao?.opcoes.find((o) => o.padrao && o.ativo)
    if (!opcao) {
      erroPrecificacao(
        'dimensao_ausente',
        `Dimensão ${codigo} sem opção padrão.`,
      )
    }
    return opcao.codigo
  }

  const padraoDaFaixa = (tipo: string) => {
    const faixa = tabela.faixas.find((f) => f.tipo === tipo && f.padrao)
    if (!faixa) {
      erroPrecificacao('faixa_desconhecida', `Faixa de ${tipo} sem padrão.`)
    }
    return faixa.codigo
  }

  return {
    regime: padraoDaDimensao('regime'),
    atividades: [padraoDaDimensao('atividade')],
    funcionarios: tabela.parametros.funcionariosPadrao,
    notasFiscais: padraoDaFaixa('notas_fiscais'),
    emissor: padraoDaDimensao('emissor'),
    faturamento: padraoDaFaixa('faturamento'),
    atendimento: padraoDaDimensao('atendimento'),
    rotina: padraoDaDimensao('rotina'),
    adicionais: [],
  }
}
