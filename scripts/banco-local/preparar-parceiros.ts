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
const { assinaturas, parceiroIndicacoes, parceiros, perfis, usuarios, usuariosPerfis } =
  await import('../../src/db/schema')
const { gerarHash } = await import('../../src/features/usuarios/lib/hash-senha')
const { gerarCodigoDoParceiro } = await import('../../src/features/parceiros/lib/codigo-do-parceiro')
const { gerarCompetenciasPrevistas } = await import('../../src/features/assinaturas/lib/competencias')
const { confirmarPagamentoDeAssinatura } = await import('../../src/features/assinaturas/lib/pagamentos')
const { PROVEDOR_HOMOLOGACAO } = await import('../../src/features/assinaturas/constants/pagamento')
const { contarClientesRecorrentesAtivos, obterConfiguracaoVigente, obterSituacaoDeNivel } =
  await import('../../src/features/parceiros/lib/niveis')
const { calcularPreco } = await import('../../src/features/precificacao/lib/motor')
const { respostasIniciais } = await import('../../src/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import(
  '../../src/features/precificacao/queries/obter-tabela-precificacao'
)

const senhaHash = await gerarHash(senha)
let sequenciaTelefone = 0

async function conta(email: string, nome: string, perfilNome: string) {
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email))
  if (existente) return existente.id

  await db.insert(perfis).values({ nome: perfilNome }).onConflictDoNothing()
  const [perfil] = await db.select({ id: perfis.id }).from(perfis).where(eq(perfis.nome, perfilNome))
  for (;;) {
    const whatsapp = `11977${String(++sequenciaTelefone).padStart(6, '0')}`
    const [ocupado] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.whatsapp, whatsapp))
    if (ocupado) continue
    const [criado] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        whatsapp,
        senhaHash,
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })
    await db.insert(usuariosPerfis).values({ usuarioId: criado.id, perfilId: perfil.id })
    return criado.id
  }
}

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

// O preço vem do motor e da tabela publicada, como numa contratação real.
const tabela = await obterTabelaDaVitrine()
const semestral = calcularPreco(tabela, 'padrao', respostasIniciais(tabela)).periodos.find(
  (p) => p.meses === 6,
)!

await conta('gestor.local@vincis.local', 'Gestor Local', 'gestor_vincis')
await conta('cliente.sem-parceria@vincis.local', 'Cliente Sem Parceria', 'cliente')

let proximoCliente = 0
async function clienteRecorrente(parceiroId: string) {
  for (;;) {
    const email = `cliente.recorrente.${String(++proximoCliente).padStart(3, '0')}@vincis.local`
    const [ja] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
    if (ja) continue
    const clienteId = await conta(email, `Cliente Recorrente ${proximoCliente}`, 'cliente')
    await db.insert(parceiroIndicacoes).values({
      parceiroId,
      visitanteHash: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0'),
      usuarioId: clienteId,
    })
    const [contrato] = await db
      .insert(assinaturas)
      .values({
        clienteUsuarioId: clienteId,
        planoCodigo: 'padrao',
        planoNome: tabela.servicos.find((s) => s.codigo === 'padrao')?.nome ?? 'Plano padrão',
        periodoCodigo: semestral.periodo,
        periodicidade: 'semestral',
        meses: semestral.meses,
        valorMensalCheioCentavos: semestral.mensalCentavos,
        descontoMilesimos: semestral.descontoMilesimos,
        valorMensalCentavos: semestral.mensalCentavos,
        valorTotalCentavos: semestral.totalPeriodoCentavos,
        oferta: { origem: 'dados-de-desenvolvimento-local' },
        chaveIntencao: `dev-local-${crypto.randomUUID()}`,
      })
      .returning({ id: assinaturas.id })
    await gerarCompetenciasPrevistas(db, contrato.id)
    const pago = await confirmarPagamentoDeAssinatura({
      assinaturaId: contrato.id,
      provedor: PROVEDOR_HOMOLOGACAO,
      chaveIdempotencia: `dev-local-${contrato.id}`,
      valorCentavos: semestral.totalPeriodoCentavos,
    })
    if (!pago.ok) throw new Error(`pagamento de desenvolvimento recusado: ${pago.motivo}`)
    return
  }
}

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
