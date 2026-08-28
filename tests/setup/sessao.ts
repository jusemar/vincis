import { AsyncLocalStorage } from 'node:async_hooks'

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

/**
 * Sessão por contexto assíncrono — para testar duas pessoas ao mesmo tempo.
 *
 * `entrarComo` guarda o token numa variável de módulo, o que funciona enquanto
 * os testes forem sequenciais. Não funciona para concorrência: dois
 * `Promise.all` de Clientes diferentes se sobrescrevem, e o servidor acaba
 * atendendo as duas chamadas como se fossem a mesma pessoa — que é justamente o
 * cenário que um teste de disputa não pode simular errado. Em produção cada
 * requisição carrega o próprio cookie, e é isso que o `AsyncLocalStorage`
 * reproduz aqui.
 *
 * Convive com `entrarComo`: o stub do cookie lê primeiro o contexto e cai na
 * variável de módulo quando não há nenhum.
 */
const contexto = new AsyncLocalStorage<string | null>()

export function comSessao<T>(token: string | null, acao: () => Promise<T>): Promise<T> {
  return contexto.run(token, acao)
}

/** O token que vale para quem está perguntando agora. */
export function tokenDaSessao(): string | null {
  const doContexto = contexto.getStore()
  return doContexto !== undefined ? doContexto : sessaoAtual.token
}
