import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { URL_BANCO_TESTES } from './tests/setup/postgres-descartavel.ts'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/global.ts'],
    setupFiles: ['./tests/setup/stubs-next.ts'],
    // `src/db/connection.ts` lê DATABASE_URL no topo do módulo. Definir aqui
    // garante que nenhum import de teste alcance o banco real do `.env`.
    env: { DATABASE_URL: URL_BANCO_TESTES, NODE_ENV: 'test' },
    // As personas são compartilhadas e o banco é um só: paralelismo entre
    // arquivos causaria interferência entre cenários.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
  },
})
