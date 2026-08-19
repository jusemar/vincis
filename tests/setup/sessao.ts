/**
 * Cookie da sessão em uso pelo teste corrente.
 *
 * É o único ponto simulado da suíte: `next/headers` não existe fora de uma
 * requisição HTTP. O valor guardado aqui é um token de sessão REAL, gravado em
 * `sessoes_usuario`; a partir dele `obterSessaoServidor` faz exatamente a mesma
 * consulta que faria em produção, e toda a cadeia de autorização roda de
 * verdade. Nenhuma regra é substituída — só o transporte do cookie.
 */
export const sessaoAtual: { token: string | null } = { token: null }

export function entrarComo(token: string | null) {
  sessaoAtual.token = token
}

export function sairDaSessao() {
  sessaoAtual.token = null
}
