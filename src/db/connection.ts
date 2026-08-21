import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

/*
  Opções pensadas para o destino de execução: funções serverless na Vercel
  contra o endpoint *pooler* do Neon.

  - `idle_timeout`: sem isto (padrão 0) cada instância guarda conexões ociosas
    até morrer. Em serverless nascem muitas instâncias curtas, e o conjunto de
    conexões ociosas consome a cota do Neon sem estar servindo ninguém.
  - `connect_timeout`: o padrão de 30s deixa uma requisição pendurada até o
    limite da função. 15s falha mais cedo e de forma legível.
  - `max`: explícito, e acima do maior `Promise.all` de consultas paralelas da
    aplicação (7, em `listarAtendimentosDoCliente`), para que a página do
    Cliente não fique esperando conexão dela mesma.

  Nenhum valor aqui corrige defeito de aplicação: são limites de convivência
  com o ambiente de execução. Falhas de conexão vistas em auditoria local vêm
  do WSL2 (o host do Neon resolve em 3 endereços IPv4 e 3 IPv6, e o IPv6 não
  tem rota de saída), e não se reproduzem contra o mesmo banco fora dele.
*/
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 15,
})

export const db = drizzle(client, { schema })

/**
 * Conexão subjacente. Exposta para que processos de vida curta (scripts de
 * desenvolvimento e a suíte de testes) possam encerrá-la explicitamente — sem
 * isso, conexões ociosas ficam abertas até o processo morrer e o banco
 * descartável dos testes é removido debaixo delas, gerando ECONNRESET no fim
 * da execução. A aplicação em si nunca precisa chamar isto.
 */
export const conexaoPostgres = client
