/**
 * Peças de dados de DESENVOLVIMENTO local, compartilhadas pelos scripts de
 * `scripts/banco-local`. Importar só depois de `exigirBancoLocal`.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import {
  assinaturas,
  parceiroIndicacoes,
  parceiros,
  perfis,
  perfisProfissionais,
  usuarios,
  usuariosPerfis,
} from '../../src/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '../../src/features/assinaturas/constants/pagamento'
import { gerarCompetenciasPrevistas } from '../../src/features/assinaturas/lib/competencias'
import { confirmarPagamentoDeAssinatura } from '../../src/features/assinaturas/lib/pagamentos'
import { calcularPreco } from '../../src/features/precificacao/lib/motor'
import { respostasIniciais } from '../../src/features/precificacao/lib/respostas'
import { obterTabelaDaVitrine } from '../../src/features/precificacao/queries/obter-tabela-precificacao'
import { criarEmpresaComMembro } from '../../src/features/empresas/lib/criar-empresa-com-membro'
import { buscarEmpresasAtivasUsuario } from '../../src/features/empresas/queries/buscar-empresas-usuario'
import { gerarCodigoDoParceiro } from '../../src/features/parceiros/lib/codigo-do-parceiro'
import { gerarCodigoPublicoProfissional } from '../../src/features/usuarios/lib/codigo-publico-profissional'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'

let sequenciaTelefone = 0
let senhaHash: string | null = null

async function idDoPerfil(perfilNome: string) {
  await db.insert(perfis).values({ nome: perfilNome }).onConflictDoNothing()
  const [perfil] = await db.select({ id: perfis.id }).from(perfis).where(eq(perfis.nome, perfilNome))
  return perfil.id
}

/**
 * Conta local com o perfil dado, reaproveitada se o e-mail já existir.
 *
 * Quando a conta já existe ela é devolvida intacta — nome, senha e perfis não
 * são tocados. Capacidades a mais entram pelos `garantir*`/`*Local` abaixo, que
 * só acrescentam o que falta.
 */
export async function contaLocal(email: string, nome: string, perfilNome: string, senha: string) {
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email))
  if (existente) return existente.id
  senhaHash ??= await gerarHash(senha)
  const perfil = { id: await idDoPerfil(perfilNome) }
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
 * Soma um perfil à conta, se ainda não estiver vinculado. É assim que a mesma
 * conta acumula `profissional` e `gestor_vincis`: `usuarios_perfis` é N:N e a
 * chave primária (usuario, perfil) torna a operação idempotente.
 */
export async function garantirPerfilDaConta(usuarioId: string, perfilNome: string) {
  const perfilId = await idDoPerfil(perfilNome)
  await db.insert(usuariosPerfis).values({ usuarioId, perfilId }).onConflictDoNothing()
}

export type CadastroProfissionalLocal = {
  tipoProfissional: 'contabilidade' | 'especialista_fiscal' | 'advocacia'
  nomeAtuacao: string
  emailProfissional: string
  numeroRegistro: string
  areasAtuacao: string[]
}

/**
 * Cadastro de Profissional já aprovado, como fica depois da análise da Vincis.
 *
 * Só cria: um cadastro existente nunca é reescrito. Se ele existir com outro
 * tipo, outra profissão ou fora de `aprovado`, o script para — corrigir isso em
 * silêncio seria promover alguém por um caminho lateral, exatamente o que o
 * fluxo real (`salvarPerfilProfissional`) proíbe.
 *
 * O comprovante do registro fica vazio: em desenvolvimento não há arquivo real
 * no storage privado, e o número de registro é marcado como local.
 */
export async function cadastroProfissionalAprovadoLocal(usuarioId: string, dados: CadastroProfissionalLocal) {
  const [existente] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
  if (existente) {
    const coerente =
      existente.tipoPrestador === 'profissional' &&
      existente.tipoProfissional === dados.tipoProfissional &&
      existente.statusAnalise === 'aprovado'
    if (!coerente) {
      throw new Error(
        `${dados.emailProfissional}: cadastro de prestador existente (${existente.tipoPrestador}/` +
          `${existente.tipoProfissional}/${existente.statusAnalise}) diverge do esperado; não foi alterado.`,
      )
    }
    return
  }
  const agora = new Date()
  const [{ whatsapp }] = await db.select({ whatsapp: usuarios.whatsapp }).from(usuarios).where(eq(usuarios.id, usuarioId))
  await db.insert(perfisProfissionais).values({
    usuarioId,
    codigoPublico: gerarCodigoPublicoProfissional(),
    tipoPrestador: 'profissional',
    tipoProfissional: dados.tipoProfissional,
    numeroRegistro: dados.numeroRegistro,
    areasAtuacao: dados.areasAtuacao,
    apresentacao: 'Cadastro de desenvolvimento local, usado para testar o painel profissional da Vincis.',
    nomeAtuacao: dados.nomeAtuacao,
    // Escritório: o vínculo de proprietário é o que dá tenant ao painel.
    modalidadeAtuacao: 'escritorio',
    cep: '30140071',
    logradouro: 'Avenida Afonso Pena',
    numero: '1000',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    tempoExperiencia: 5,
    regimesAtendidos: dados.tipoProfissional === 'advocacia' ? [] : ['simples_nacional', 'lucro_presumido'],
    telefoneContato: whatsapp ?? '11977000000',
    emailProfissional: dados.emailProfissional,
    statusAnalise: 'aprovado',
    enviadoEm: agora,
    analisadoEm: agora,
  })
}

/**
 * Escritório ativo do qual a conta é proprietária.
 *
 * Reaproveita o vínculo ativo se já houver; senão cria pelo caminho real
 * (`criarEmpresaComMembro`), que exige Profissional aprovado e recusa uma
 * segunda empresa — as mesmas travas do onboarding.
 */
export async function escritorioLocal(
  usuarioId: string,
  nome: string,
  segmento: 'contabilidade' | 'advocacia',
) {
  const [ativo] = await buscarEmpresasAtivasUsuario(usuarioId)
  if (ativo) {
    if (ativo.segmento !== segmento) {
      throw new Error(`${nome}: a conta já pertence ao escritório "${ativo.nome}" (${ativo.segmento}); não foi alterado.`)
    }
    return ativo.empresaId
  }
  const criado = await criarEmpresaComMembro(usuarioId, { nome, segmento })
  return criado.empresaId
}

/** Ativa o Programa de Parceiros para a conta, se ainda não estiver ativo. */
export async function parceiroLocal(usuarioId: string) {
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
