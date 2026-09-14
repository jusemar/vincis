/**
 * Peças de dados de DESENVOLVIMENTO local, compartilhadas pelos scripts de
 * `scripts/banco-local`. Importar só depois de `exigirBancoLocal`.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import { assinaturas, parceiroIndicacoes, perfis, usuarios, usuariosPerfis } from '../../src/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '../../src/features/assinaturas/constants/pagamento'
import { gerarCompetenciasPrevistas } from '../../src/features/assinaturas/lib/competencias'
import { confirmarPagamentoDeAssinatura } from '../../src/features/assinaturas/lib/pagamentos'
import { calcularPreco } from '../../src/features/precificacao/lib/motor'
import { respostasIniciais } from '../../src/features/precificacao/lib/respostas'
import { obterTabelaDaVitrine } from '../../src/features/precificacao/queries/obter-tabela-precificacao'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'

let sequenciaTelefone = 0
let senhaHash: string | null = null

/** Conta local com o perfil dado, reaproveitada se o e-mail já existir. */
export async function contaLocal(email: string, nome: string, perfilNome: string, senha: string) {
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
  if (existente) return existente.id
  senhaHash ??= await gerarHash(senha)
  await db.insert(perfis).values({ nome: perfilNome }).onConflictDoNothing()
  const [perfil] = await db.select({ id: perfis.id }).from(perfis).where(eq(perfis.nome, perfilNome))
  for (;;) {
    const whatsapp = `11977${String(++sequenciaTelefone).padStart(6, '0')}`
    const [ocupado] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.whatsapp, whatsapp))
    if (ocupado) continue
    const [criado] = await db
      .insert(usuarios)
      .values({ nome, email, whatsapp, senhaHash, status: 'ativo', emailVerificado: true, emailVerificadoEm: new Date() })
      .returning({ id: usuarios.id })
    await db.insert(usuariosPerfis).values({ usuarioId: criado.id, perfilId: perfil.id })
    return criado.id
  }
}

/**
 * Um cliente novo, nascido pela indicação do parceiro, com assinatura semestral
 * paga pelo caminho real (motor de preço, competências, pagamento confirmado
 * pelo mecanismo de teste) — o que dispara atribuição, nível e campanhas.
 */
export async function clienteRecorrenteLocal(parceiroId: string, senha: string) {
  process.env.VINCIS_AMBIENTE ??= 'homologacao'
  const tabela = await obterTabelaDaVitrine()
  const semestral = calcularPreco(tabela, 'padrao', respostasIniciais(tabela)).periodos.find((p) => p.meses === 6)!
  for (let n = 1; ; n++) {
    const email = `cliente.recorrente.${String(n).padStart(3, '0')}@vincis.local`
    const [ja] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
    if (ja) continue
    const clienteId = await contaLocal(email, `Cliente Recorrente ${n}`, 'cliente', senha)
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
    return { clienteId, assinaturaId: contrato.id }
  }
}
