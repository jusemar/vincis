import { afterAll, vi } from 'vitest'
import { conexaoPostgres } from '@/db/connection'
import { COOKIE_SESSAO } from '@/features/usuarios/constants/sessao'
import { tokenDaSessao } from './sessao'

// Encerra o pool ao fim de cada arquivo: sem isto, conexões ociosas seguem
// abertas quando o container do banco é derrubado, e o encerramento da suíte
// fica poluído por ECONNRESET que nada tem a ver com os testes.
afterAll(async () => {
  await conexaoPostgres.end({ timeout: 5 })
})

/**
 * Único ponto simulado da suíte: o transporte do cookie de sessão e a
 * revalidação de cache do Next, que não existem fora de uma requisição HTTP.
 *
 * O token entregue aqui é real e está gravado em `sessoes_usuario`, de modo que
 * `obterSessaoServidor` executa a consulta verdadeira. Nenhuma regra de
 * autorização é substituída por mock.
 */
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) => {
      // `tokenDaSessao` prefere o contexto assíncrono da chamada — é o que
      // permite dois Clientes diferentes disputarem o mesmo horário ao mesmo
      // tempo sem um sobrescrever o cookie do outro.
      const token = tokenDaSessao()
      return nome === COOKIE_SESSAO && token
        ? { name: nome, value: token }
        : undefined
    },
    set: () => undefined,
    delete: () => undefined,
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}))
