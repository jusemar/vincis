/**
 * `drizzle-kit` contra o PostgreSQL LOCAL.
 *
 * O `drizzle-kit` carrega `.env` sozinho, e o `.env` aponta para o Neon. Este
 * invólucro recebe a URL de `.env.local` (via `node --env-file=.env.local`),
 * confere que é local e só então chama o `drizzle-kit` com ela no ambiente —
 * variável já definida não é sobrescrita pelo `.env`.
 *
 * Uso: npm run db:local:drizzle -- generate --name minha_migration
 *      npm run db:local:migrar
 */
import { spawn } from 'node:child_process'
import { exigirBancoLocal } from './guarda'

export function rodarDrizzleKit(argumentos: string[], url: string): Promise<void> {
  exigirBancoLocal(url, 'drizzle-kit')
  return new Promise((resolver, rejeitar) => {
    const processo = spawn('npx', ['--no-install', 'drizzle-kit', ...argumentos], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: url },
    })
    processo.on('exit', (codigo) =>
      codigo === 0 ? resolver() : rejeitar(new Error(`drizzle-kit saiu com código ${codigo}`)),
    )
    processo.on('error', rejeitar)
  })
}

const chamadoDireto = process.argv[1]?.endsWith('drizzle.ts')
if (chamadoDireto) {
  const argumentos = process.argv.slice(2)
  if (!argumentos.length) {
    console.error('Uso: npm run db:local:drizzle -- <comando do drizzle-kit>')
    process.exit(1)
  }
  rodarDrizzleKit(argumentos, exigirBancoLocal(process.env.DATABASE_URL, 'db:local').toString())
    .catch((erro) => {
      console.error(erro instanceof Error ? erro.message : erro)
      process.exit(1)
    })
}
