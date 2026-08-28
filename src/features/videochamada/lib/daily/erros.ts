/**
 * A falha da Daily, já sem nada sensível dentro.
 *
 * `codigo` é uma etiqueta curta para o log e para quem precisa decidir algo
 * diferente conforme o tipo de falha. `message` descreve o que aconteceu em
 * termos técnicos, também para o log — e **não** é o que o usuário lê: a tela
 * mostra sempre a mesma frase amigável, porque nem status HTTP nem código de
 * fornecedor dizem nada a quem só queria entrar na consulta.
 *
 * O que nunca entra aqui: a chave, o header `Authorization`, o token emitido e
 * o corpo bruto da resposta.
 */
export class ErroDaily extends Error {
  readonly codigo: string

  constructor(codigo: string, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDaily'
    this.codigo = codigo
  }
}

export function ehErroDaily(erro: unknown): erro is ErroDaily {
  return erro instanceof ErroDaily
}
