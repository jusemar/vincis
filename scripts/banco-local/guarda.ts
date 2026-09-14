/**
 * Guarda do banco LOCAL da Vincis.
 *
 * Desenvolvimento, testes, fixtures e validação de migrations rodam contra o
 * PostgreSQL local (loopback). O Neon é o banco online: só recebe migration
 * aprovada e deploy, nunca uso cotidiano. Todo comando de `scripts/banco-local`
 * passa por aqui antes de abrir conexão — uma `DATABASE_URL` que aponte para
 * qualquer outro host é recusada, e nada é executado.
 */
const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function ehHostLocal(host: string): boolean {
  return HOSTS_LOCAIS.has(host) && !/neon\.tech$/i.test(host)
}

export function exigirBancoLocal(url: string | undefined, contexto: string): URL {
  if (!url) {
    throw new Error(
      `${contexto}: DATABASE_URL ausente. Configure o PostgreSQL local em .env.local (veja AGENTS.md, "Ambientes de banco").`,
    )
  }
  let destino: URL
  try {
    destino = new URL(url)
  } catch {
    throw new Error(`${contexto}: DATABASE_URL inválida.`)
  }
  if (!ehHostLocal(destino.hostname)) {
    throw new Error(
      `${contexto}: recusado. DATABASE_URL aponta para "${destino.hostname}", não para o PostgreSQL local. ` +
        'Este comando é só de desenvolvimento e nunca roda contra o Neon.',
    )
  }
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === 'production') {
    throw new Error(`${contexto}: recusado em ambiente de produção.`)
  }
  return destino
}
