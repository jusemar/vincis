import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const executar = promisify(execFile)

const CONTAINER = 'vincis-testes-permissoes'
const IMAGEM = 'postgres:16-alpine'
const SENHA = 'vincis'
const BANCO = 'vincis_testes'
/**
 * Porta do Postgres de teste.
 *
 * 55432 continua o padrão. A variável existe como saída para um caso real: a
 * faixa alta é também a faixa de portas efêmeras do sistema, e o `next dev`
 * rodando ao lado pode ter pegado justamente esta como porta de origem da
 * conexão dele com o banco — aí o Docker não consegue publicar e a suíte nem
 * começa. `PORTA_POSTGRES_TESTES=55433 npm test` resolve sem derrubar nada.
 */
const PORTA = Number(process.env.PORTA_POSTGRES_TESTES ?? 55432)

export const URL_BANCO_TESTES = `postgresql://postgres:${SENHA}@127.0.0.1:${PORTA}/${BANCO}`

async function docker(...args: string[]) {
  return executar('docker', args, { maxBuffer: 16 * 1024 * 1024 })
}

async function derrubarContainer() {
  await docker('rm', '-f', CONTAINER).catch(() => undefined)
}

async function esperarPronto() {
  const limite = Date.now() + 90_000
  let ultimoErro: unknown = null
  while (Date.now() < limite) {
    try {
      await docker('exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-d', BANCO)
      return
    } catch (erro) {
      ultimoErro = erro
      await new Promise((resolver) => setTimeout(resolver, 500))
    }
  }
  throw new Error(`Postgres de teste não ficou pronto: ${String(ultimoErro)}`)
}

/**
 * Sobe um Postgres descartável para a suíte.
 *
 * Um container próprio é inegociável: o `DATABASE_URL` do `.env` aponta para o
 * banco real do projeto, e uma suíte que cria e apaga usuários, escritórios e
 * clientes não pode chegar perto dele. A porta 55432 evita conflito com
 * qualquer Postgres local, e a faixa 3000-3999 continua livre conforme a
 * política de portas do projeto.
 */
export async function subirPostgres() {
  await derrubarContainer()
  await docker(
    'run',
    '--detach',
    '--name',
    CONTAINER,
    '--env',
    `POSTGRES_PASSWORD=${SENHA}`,
    '--env',
    `POSTGRES_DB=${BANCO}`,
    '--publish',
    `${PORTA}:5432`,
    // Banco em memória: a suíte é descartável e assim roda bem mais rápido.
    '--tmpfs',
    '/var/lib/postgresql/data',
    IMAGEM,
  )
  await esperarPronto()
  return URL_BANCO_TESTES
}

export async function derrubarPostgres() {
  await derrubarContainer()
}
