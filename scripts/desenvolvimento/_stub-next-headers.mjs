/**
 * Stub de `next/headers` usado apenas pelos testes de desenvolvimento.
 * Permite executar as server actions reais fora de uma requisição HTTP,
 * trocando a sessão ativa entre os cenários.
 */
export const sessaoAtual = { token: null }

export async function cookies() {
  return {
    get(nome) {
      if (!sessaoAtual.token) return undefined
      return { name: nome, value: sessaoAtual.token }
    },
    set() {},
    delete() {},
  }
}

export async function headers() {
  return new Map()
}
