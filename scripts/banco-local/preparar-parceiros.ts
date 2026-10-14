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
import { lerSenhaContasLocais } from './senha-contas-locais'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:parceiros')
const senha = lerSenhaContasLocais('db:local:parceiros')
// O banco é local (conferido acima): a confirmação manual de pagamento é o
// mecanismo de teste que já existe para assinaturas.
process.env.VINCIS_AMBIENTE ??= 'homologacao'

const { conexaoPostgres, db } = await import('../../src/db/connection')
const { contarClientesRecorrentesAtivos, obterConfiguracaoVigente, obterSituacaoDeNivel } =
  await import('../../src/features/parceiros/lib/niveis')
const { clienteRecorrenteLocal, contaLocal, parceiroLocal } = await import('./fixtures')

const conta = (email: string, nome: string, perfil: string) => contaLocal(email, nome, perfil, senha)

const vigente = await obterConfiguracaoVigente()
if (!vigente.ok) {
  console.error('Configuração de níveis indisponível no banco local:', vigente.motivo)
  await conexaoPostgres.end()
  process.exit(1)
}
const configuracao = vigente.configuracao

await conta('gestor.local@vincis.local', 'Gestor Local', 'gestor_vincis')
await conta('cliente.sem-parceria@vincis.local', 'Cliente Sem Parceria', 'cliente')

const clienteRecorrente = (parceiroId: string) => clienteRecorrenteLocal(parceiroId, senha)

for (const nivel of configuracao.niveis) {
  const email = `parceiro.${nivel.codigo}@vincis.local`
  const usuarioId = await conta(email, `Parceiro ${nivel.nome}`, 'cliente')
  const parceiroId = await parceiroLocal(usuarioId)
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
