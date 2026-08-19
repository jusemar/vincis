import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, perfisProfissionais, sessoesUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import {
  PerfilProfissionalAprovadoSchema,
  PerfilProfissionalSchema,
} from '@/features/usuarios/schemas/perfil-profissional'
import { entrarComo, sairDaSessao } from './setup/sessao'

// O upload de comprovante toca serviço externo; nada mais é simulado.
vi.mock('@/features/usuarios/lib/comprovante-profissional', () => ({
  enviarComprovantePrivado: vi.fn(),
  removerComprovantePrivado: vi.fn(),
}))

const { salvarPerfilProfissional } = await import(
  '@/features/usuarios/actions/salvar-perfil-profissional'
)
const { pesquisarProfissionaisReais } = await import(
  '@/features/profissionais/queries/pesquisar-profissionais'
)

const SUFIXO = '@valores.teste'
type Caso = 'aprovadoCepVazio' | 'pendente'
let ids: Record<Caso, string>
let tokens: Record<Caso, string>

/** Payload equivalente ao que o formulário envia. */
function payload(extra: Record<string, unknown> = {}) {
  return {
    tipoProfissional: 'contabilidade' as const,
    numeroRegistro: 'CRC-123456',
    areasAtuacao: 'contabil',
    apresentacao: 'Atendimento contábil para pequenas empresas e autônomos.',
    nomeAtuacao: 'Perfil de Teste',
    modalidadeAtuacao: 'individual' as const,
    // Endereço legado inválido: é o que a tela bloqueia depois da aprovação.
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: 'São Paulo',
    estado: 'SP',
    tempoExperiencia: 5,
    formacao: 'Ciências Contábeis',
    instituicaoEnsino: 'USP',
    especialidades: 'IRPF',
    certificacoes: '',
    valorHora: 350,
    disponivelAtendimento: true,
    regimesAtendidos: ['simples_nacional' as const],
    telefoneContato: '11999998888',
    emailProfissional: `aprovadoCepVazio${SUFIXO}`,
    ...extra,
  }
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const uids = alvos.map(({ id }) => id)
  if (!uids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, uids))
  await db.delete(perfisProfissionais).where(inArray(perfisProfissionais.usuarioId, uids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, uids))
  await db.delete(usuarios).where(inArray(usuarios.id, uids))
}

beforeEach(async () => {
  await limpar()
  await db.insert(perfis).values({ nome: 'profissional' }).onConflictDoNothing()
  const [perfil] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'profissional'))
    .limit(1)

  const criados = {} as Record<Caso, string>
  const criadosTokens = {} as Record<Caso, string>
  let i = 0
  for (const caso of ['aprovadoCepVazio', 'pendente'] as Caso[]) {
    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Valores ${caso}`,
        email: `${caso}${SUFIXO}`,
        whatsapp: `1191000${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })
    await db.insert(usuariosPerfis).values({ usuarioId: usuario.id, perfilId: perfil.id })

    await db.insert(perfisProfissionais).values({
      usuarioId: usuario.id,
      tipoPrestador: 'profissional',
      tipoProfissional: 'contabilidade',
      numeroRegistro: 'CRC-123456',
      apresentacao: 'Atendimento contábil para pequenas empresas e autônomos.',
      nomeAtuacao: `Valores ${caso}`,
      modalidadeAtuacao: 'individual',
      // Cadastro legado: aprovado sem CEP gravado.
      cep: null,
      cidade: 'São Paulo',
      estado: 'SP',
      tempoExperiencia: 5,
      valorHoraCentavos: 35000,
      telefoneContato: '11999998888',
      emailProfissional: `${caso}${SUFIXO}`,
      // Comprovante já enviado: é pré-requisito do cadastro regulamentado.
      comprovanteRegistroChave: 'comprovantes/teste.pdf',
      comprovanteRegistroNomeOriginal: 'teste.pdf',
      comprovanteRegistroTipo: 'application/pdf',
      comprovanteRegistroTamanho: 1024,
      comprovanteRegistroEnviadoEm: new Date(),
      statusAnalise: caso === 'aprovadoCepVazio' ? 'aprovado' : 'rascunho',
    })

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'valores-teste',
    })
    criados[caso] = usuario.id
    criadosTokens[caso] = token
    i += 1
  }
  ids = criados
  tokens = criadosTokens
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('validação de endereço conforme o estágio do cadastro', () => {
  it('cadastro pendente continua exigindo CEP válido', () => {
    const resultado = PerfilProfissionalSchema.safeParse(payload())
    expect(resultado.success).toBe(false)
    expect(JSON.stringify(resultado.error?.issues)).toContain('CEP')
  })

  it('cadastro aprovado não é barrado por CEP legado inválido', () => {
    expect(PerfilProfissionalAprovadoSchema.safeParse(payload()).success).toBe(true)
  })

  it('CEP inválido continua recusado quando o endereço é editável', () => {
    const resultado = PerfilProfissionalSchema.safeParse(
      payload({ cep: '123', logradouro: 'Rua A', numero: '1', bairro: 'Centro' }),
    )
    expect(resultado.success).toBe(false)
  })

  it('as demais regras cruzadas seguem valendo no schema relaxado', () => {
    const semRegistro = PerfilProfissionalAprovadoSchema.safeParse(
      payload({ numeroRegistro: '' }),
    )
    expect(semRegistro.success).toBe(false)
  })
})

describe('salvar Valor por hora', () => {
  it('persiste sem esbarrar no CEP bloqueado', async () => {
    entrarComo(tokens.aprovadoCepVazio)
    const resultado = await salvarPerfilProfissional(payload({ valorHora: 420 }))
    expect(resultado.sucesso).toBe(true)

    const [perfil] = await db
      .select({ valor: perfisProfissionais.valorHoraCentavos })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, ids.aprovadoCepVazio))
    expect(perfil.valor).toBe(42000)
  })

  it('payload que tenta mudar campo bloqueado é recusado, sem alterar nada', async () => {
    entrarComo(tokens.aprovadoCepVazio)
    const resultado = await salvarPerfilProfissional(
      payload({ valorHora: 500, cidade: 'Outra Cidade', tempoExperiencia: 99 }),
    )
    // Recusar é melhor que ignorar em silêncio: o autor da chamada sabe o que
    // aconteceu, e nenhum campo é gravado pela metade.
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('não podem ser alteradas')

    const [perfil] = await db
      .select({
        cidade: perfisProfissionais.cidade,
        experiencia: perfisProfissionais.tempoExperiencia,
        valor: perfisProfissionais.valorHoraCentavos,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, ids.aprovadoCepVazio))

    expect(perfil.cidade).toBe('São Paulo')
    expect(perfil.experiencia).toBe(5)
    expect(perfil.valor).toBe(35000)
  })

  it('CEP legado nulo não é confundido com alteração de endereço', async () => {
    entrarComo(tokens.aprovadoCepVazio)
    // O formulário envia "" onde o banco tem NULL; isso não é uma edição.
    const resultado = await salvarPerfilProfissional(payload({ valorHora: 480 }))
    expect(resultado.sucesso).toBe(true)
  })

  it('o cadastro aprovado continua aprovado depois de salvar', async () => {
    entrarComo(tokens.aprovadoCepVazio)
    await salvarPerfilProfissional(payload({ valorHora: 400 }))
    const [perfil] = await db
      .select({ status: perfisProfissionais.statusAnalise })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, ids.aprovadoCepVazio))
    expect(perfil.status).toBe('aprovado')
  })

  it('o novo valor/hora aparece na vitrine pública', async () => {
    entrarComo(tokens.aprovadoCepVazio)
    await salvarPerfilProfissional(payload({ valorHora: 777 }))

    const vitrine = await pesquisarProfissionaisReais({
      busca: 'Valores aprovadoCepVazio',
      pagina: 1,
      porPagina: 10,
    })
    const encontrado = vitrine.profissionais.find(
      (p) => p.id === ids.aprovadoCepVazio,
    )
    expect(encontrado?.valorHoraCentavos).toBe(77700)
  })

  it('sem sessão de profissional nada é salvo', async () => {
    sairDaSessao()
    expect((await salvarPerfilProfissional(payload({ valorHora: 900 }))).sucesso).toBe(false)
  })
})
