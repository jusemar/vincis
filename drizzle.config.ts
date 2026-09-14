import { defineConfig } from 'drizzle-kit'

/*
  Para onde o drizzle-kit aponta.

  O drizzle-kit carrega `.env` sozinho — e o `.env` aponta para o banco online
  (Neon). Por isso a regra mora aqui, e não só nos scripts: sem
  `VINCIS_BANCO_ONLINE=1`, somente PostgreSQL local (loopback) é aceito.

  - Desenvolvimento: `npm run db:local:migrar` e `npm run db:local:drizzle -- …`,
    que passam a URL de `.env.local`.
  - Migration online aprovada: `npm run db:online:migrar`.
*/
const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/vincis'
const host = (() => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
})()
const local = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)

if (!local && process.env.VINCIS_BANCO_ONLINE !== '1') {
  throw new Error(
    `drizzle-kit recusado: DATABASE_URL aponta para "${host}", não para o PostgreSQL local. ` +
      'Em desenvolvimento use npm run db:local:migrar (ou db:local:drizzle). ' +
      'Migration online aprovada: npm run db:online:migrar.',
  )
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
})
