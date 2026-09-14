/**
 * Dados de DESENVOLVIMENTO do Programa de Parceiros, no PostgreSQL LOCAL.
 *
 * Cria (ou reaproveita) contas claramente locais para validar a Fatia 5 na tela:
 *
 * - `gestor.local@vincis.local` — Gestor da plataforma;
 * - `cliente.sem-parceria@vincis.local` — cliente que não ativou o programa;
 * - `parceiro.<nivel>@vincis.local` — um parceiro ativado por nível configurado,
 *   com exatamente o mínimo de clientes recorrentes ativos que a configuração
 *   VIGENTE exige para aquele nível (a base, zero).
 *
 * Nenhum número de nível está aqui: os mínimos são lidos da configuração
 * publicada. Os clientes recorrentes são criados pelo caminho real — indicação
 * da conta, assinatura, competências e pagamento confirmado pelo mecanismo de
 * teste —, o que dispara a atribuição e o recálculo do nível.
 *
 * Só roda contra banco local (guarda) e só com `SENHA_CONTAS_LOCAIS` definida em
 * `.env.local`. Idempotente: rodar de novo completa o que faltar.
 *
 * Uso: npm run db:local:parceiros
 */
import { exigirBancoLocal } from './guarda'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:parceiros')
const senha = process.env.SENHA_CONTAS_LOCAIS
if (!senha || senha.length < 10) {
  console.error('Defina SENHA_CONTAS_LOCAIS (10+ caracteres) em .env.local.')
  process.exit(1)
}
// O banco é local (conferido acima): a confirmação manual de pagamento é o
// mecanismo de teste que já existe para assinaturas.
process.env.VINCIS_AMBIENTE ??= 'homologacao'

const { eq } = await import('drizzle-orm')
const { conexaoPostgres, db } = await import('../../src/db/connection')
const { parceiros } = await import('../../src/db/schema')
const { gerarCodigoDoParceiro } = await import('../../src/features/parceiros/lib/codigo-do-parceiro')
const { contarClientesRecorrentesAtivos, obterConfiguracaoVigente, obterSituacaoDeNivel } =
  await import('../../src/features/parceiros/lib/niveis')
const { clienteRecorrenteLocal, contaLocal } = await import('./fixtures')

const conta = (email: string, nome: string, perfil: string) => contaLocal(email, nome, perfil, senha!)

async function ativarParceiro(usuarioId: string) {
  const [existente] = await db
    .select({ id: parceiros.id })
    .from(parceiros)
    .where(eq(parceiros.usuarioId, usuarioId))
  if (existente) return existente.id
  const [criado] = await db
    .insert(parceiros)
    .values({ usuarioId, codigo: gerarCodigoDoParceiro() })
    .returning({ id: parceiros.id })
  return criado.id
}

const vigente = await obterConfiguracaoVigente()
if (!vigente.ok) {
  console.error('Configuração de níveis indisponível no banco local:', vigente.motivo)
  await conexaoPostgres.end()
  process.exit(1)
}
const configuracao = vigente.configuracao

await conta('gestor.local@vincis.local', 'Gestor Local', 'gestor_vincis')
await conta('cliente.sem-parceria@vincis.local', 'Cliente Sem Parceria', 'cliente')

const clienteRecorrente = (parceiroId: string) => clienteRecorrenteLocal(parceiroId, senha!)

for (const nivel of configuracao.niveis) {
  const email = `parceiro.${nivel.codigo}@vincis.local`
  const usuarioId = await conta(email, `Parceiro ${nivel.nome}`, 'cliente')
  const parceiroId = await ativarParceiro(usuarioId)
  const atuais = await contarClientesRecorrentesAtivos(db, parceiroId)
  for (let i = atuais; i < nivel.minimoClientes; i++) await clienteRecorrente(parceiroId)
  const situacao = await obterSituacaoDeNivel(parceiroId)
  console.log(
    `${email}: nível ${situacao?.nivel.nome ?? 'indisponível'} · ${situacao?.clientesAtivos ?? 0} cliente(s) ativo(s)`,
  )
}

console.log('\nContas locais: gestor.local@vincis.local, cliente.sem-parceria@vincis.local e parceiro.<nível>@vincis.local')
console.log('Senha: a de SENHA_CONTAS_LOCAIS em .env.local.')
await conexaoPostgres.end({ timeout: 5 })
