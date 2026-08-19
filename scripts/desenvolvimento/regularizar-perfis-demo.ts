/**
 * Regulariza os cadastros de demonstração (`@vincis.local`).
 *
 * As contas demo foram semeadas direto no banco, pulando o onboarding — por
 * isso ficaram aprovadas sem endereço e, no caso dos regulamentados, sem
 * registro nem comprovante. Como endereço fica bloqueado após a aprovação, o
 * titular não tinha como corrigir pela tela, e qualquer salvamento de outra aba
 * era recusado.
 *
 * Este script preenche apenas dados **de desenvolvimento**, claramente de
 * teste, e só em contas `@vincis.local`. Não toca em usuário real e não relaxa
 * nenhuma regra de produção.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/regularizar-perfis-demo.ts [--aplicar]
 */
import { eq, like } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { perfisProfissionais, usuarios } from '../../src/db/schema'

const aplicar = process.argv.includes('--aplicar')

/** Endereço fictício por estado, coerente com a cidade já gravada. */
const ENDERECO_DEMO: Record<string, { cep: string; logradouro: string }> = {
  SP: { cep: '01310100', logradouro: 'Avenida Paulista' },
  RJ: { cep: '20040020', logradouro: 'Avenida Rio Branco' },
  MG: { cep: '30130010', logradouro: 'Avenida Afonso Pena' },
  PR: { cep: '80020310', logradouro: 'Rua XV de Novembro' },
  RS: { cep: '90010150', logradouro: 'Rua dos Andradas' },
  SC: { cep: '88010400', logradouro: 'Rua Felipe Schmidt' },
  BA: { cep: '40020000', logradouro: 'Avenida Sete de Setembro' },
  PE: { cep: '50030230', logradouro: 'Avenida Rio Branco' },
  CE: { cep: '60160230', logradouro: 'Avenida Beira Mar' },
  DF: { cep: '70070600', logradouro: 'Setor Comercial Sul' },
}

const PADRAO = { cep: '01310100', logradouro: 'Avenida Paulista' }

const perfisDemo = await db
  .select({
    usuarioId: perfisProfissionais.usuarioId,
    email: usuarios.email,
    tipoPrestador: perfisProfissionais.tipoPrestador,
    tipoProfissional: perfisProfissionais.tipoProfissional,
    statusAnalise: perfisProfissionais.statusAnalise,
    cep: perfisProfissionais.cep,
    logradouro: perfisProfissionais.logradouro,
    numero: perfisProfissionais.numero,
    bairro: perfisProfissionais.bairro,
    cidade: perfisProfissionais.cidade,
    estado: perfisProfissionais.estado,
    numeroRegistro: perfisProfissionais.numeroRegistro,
    comprovante: perfisProfissionais.comprovanteRegistroChave,
  })
  .from(perfisProfissionais)
  .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
  // Trava de segurança: só contas de demonstração.
  .where(like(usuarios.email, '%@vincis.local'))

let corrigidos = 0

for (const perfil of perfisDemo) {
  if (!perfil.email.endsWith('@vincis.local')) continue

  const endereco = ENDERECO_DEMO[perfil.estado ?? ''] ?? PADRAO
  const mudancas: Record<string, unknown> = {}

  if (!perfil.cep) mudancas.cep = endereco.cep
  if (!perfil.logradouro) mudancas.logradouro = endereco.logradouro
  if (!perfil.numero) mudancas.numero = '1000'
  if (!perfil.bairro) mudancas.bairro = 'Centro'
  if (!perfil.cidade) mudancas.cidade = 'São Paulo'
  if (!perfil.estado) mudancas.estado = 'SP'

  // Registro e comprovante só valem para o Profissional regulamentado. O
  // Colaborador não tem habilitação regulamentada, e o especialista fiscal é
  // dispensado por regra do próprio cadastro.
  const exigeRegistro =
    perfil.tipoPrestador === 'profissional' &&
    perfil.tipoProfissional !== 'especialista_fiscal'

  if (exigeRegistro) {
    const sigla = perfil.tipoProfissional === 'advocacia' ? 'OAB' : 'CRC'
    if (!perfil.numeroRegistro) {
      mudancas.numeroRegistro = `${sigla}-DEMO-${perfil.usuarioId.slice(0, 6).toUpperCase()}`
    }
    if (!perfil.comprovante) {
      // Chave claramente fictícia: não existe arquivo real por trás.
      mudancas.comprovanteRegistroChave = `demo/comprovante-${perfil.usuarioId}.pdf`
      mudancas.comprovanteRegistroNomeOriginal = 'comprovante-demo.pdf'
      mudancas.comprovanteRegistroTipo = 'application/pdf'
      mudancas.comprovanteRegistroTamanho = 1024
      mudancas.comprovanteRegistroEnviadoEm = new Date()
    }
  }

  if (!Object.keys(mudancas).length) continue
  corrigidos += 1
  console.log(
    `${aplicar ? 'CORRIGINDO' : 'PENDENTE '} ${perfil.email} → ${Object.keys(mudancas).join(', ')}`,
  )

  if (aplicar) {
    await db
      .update(perfisProfissionais)
      .set({ ...mudancas, updatedAt: new Date() })
      .where(eq(perfisProfissionais.usuarioId, perfil.usuarioId))
  }
}

console.log(
  `\n${corrigidos} cadastro(s) de demonstração ${aplicar ? 'regularizado(s)' : 'a regularizar'}.`,
)
if (!aplicar) console.log('Rode novamente com --aplicar para gravar.')

await conexaoPostgres.end({ timeout: 5 })
