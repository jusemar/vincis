/**
 * A falha do motor de preço tem nome.
 *
 * Um preço não pode "dar errado em silêncio": zero, `NaN` ou um total menor
 * porque uma faixa não foi encontrada chegariam à tela como se fossem a
 * resposta certa, e o defeito só apareceria na fatura de alguém. Toda condição
 * que impede o cálculo lança daqui, com um código que diz o que faltou e onde.
 *
 * `codigo` é para quem programa (log, teste, futura tela do Gestor apontando a
 * configuração incompleta); a mensagem é para quem lê o erro.
 */
export const CODIGOS_ERRO_PRECIFICACAO = [
  'servico_desconhecido',
  'preco_base_ausente',
  'dimensao_ausente',
  'resposta_ausente',
  'opcao_desconhecida',
  'faixa_desconhecida',
  'adicional_desconhecido',
  'desconto_ausente',
  'quantidade_invalida',
] as const

export type CodigoErroPrecificacao =
  (typeof CODIGOS_ERRO_PRECIFICACAO)[number]

export class ErroPrecificacao extends Error {
  readonly codigo: CodigoErroPrecificacao

  constructor(codigo: CodigoErroPrecificacao, mensagem: string) {
    super(mensagem)
    this.name = 'ErroPrecificacao'
    this.codigo = codigo
  }
}

export function erroPrecificacao(
  codigo: CodigoErroPrecificacao,
  mensagem: string,
): never {
  throw new ErroPrecificacao(codigo, mensagem)
}
