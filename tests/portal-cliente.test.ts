import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  perfis,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
  eventosAuditoria,
} from '@/db/schema'
import { gerarToken } from '@/features/usuarios/lib/gerar-token'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { entrarComo, sairDaSessao } from './setup/sessao'

// Único ponto simulado: o provedor de e-mail. Toda a cadeia de autorização,
// sessão e roteamento roda de verdade contra o banco.
const enviarEmailConfirmacao = vi.hoisted(() => vi.fn())
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { confirmarEmail } = await import('@/features/usuarios/actions/confirmar-email')
const { confirmarContaViaWhatsappGestao } = await import(
  '@/features/usuarios/actions/confirmar-conta-whatsapp-gestao'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { obterSessaoServidor } = await import(
  '@/features/usuarios/lib/sessao-servidor'
)
const { obterDadosCliente } = await import(
  '@/features/portal-cliente/queries/obter-dados-cliente'
)
const { atualizarDadosConta } = await import(
  '@/features/usuarios/actions/atualizar-dados-conta'
)
const { listarUsuariosGestao } = await import(
  '@/features/usuarios/actions/listar-usuarios-gestao'
)
const { carregarEquipe } = await import('@/features/empresas/actions/equipe')
const { listarMeusClientes, criarCliente } = await import(
  '@/features/clientes/actions/clientes'
)
const { salvarPerfilProfissional } = await import(
  '@/features/usuarios/actions/salvar-perfil-profissional'
)

const SUFIXO = '@portal.cliente.teste'
type Chave = 'clienteA' | 'clienteB' | 'clientePendente' | 'gestor'

const PERFIL_DE: Record<Chave, string> = {
  clienteA: 'cliente',
  clienteB: 'cliente',
  clientePendente: 'cliente',
  gestor: 'gestor_vincis',
}

type Conta = { id: string; token: string; tokenEmail: string }
let contas: Record<Chave, Conta>

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db
    .update(usuarios)
    .set({ whatsappVerificadoPorId: null })
    .where(inArray(usuarios.whatsappVerificadoPorId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

async function montar() {
  await limpar()
  const criadas = {} as Record<Chave, Conta>
  let indice = 0

  for (const chave of Object.keys(PERFIL_DE) as Chave[]) {
    const nomePerfil = PERFIL_DE[chave]
    await db.insert(perfis).values({ nome: nomePerfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, nomePerfil))
      .limit(1)

    // O gestor já nasce verificado para poder operar; os clientes nascem
    // pendentes, que é o estado real logo após o cadastro pelo site.
    const jaVerificado = chave === 'gestor'
    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Portal ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1194000${String(indice).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: jaVerificado ? 'ativo' : 'pendente_email',
        emailVerificado: jaVerificado,
        emailVerificadoEm: jaVerificado ? new Date() : null,
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'portal-cliente',
    })

    const tokenEmail = gerarToken()
    const expiraEm = new Date()
    expiraEm.setHours(expiraEm.getHours() + 24)
    await db.insert(tokensUsuario).values({
      usuarioId: usuario.id,
      tipo: 'confirmacao_email',
      tokenHash: tokenEmail.hash,
      expiraEm,
    })

    criadas[chave] = { id: usuario.id, token, tokenEmail: tokenEmail.token }
    indice += 1
  }
  return criadas
}

async function liberarPorEmail(chave: Chave) {
  await confirmarEmail({ token: contas[chave].tokenEmail })
}

async function liberarPorWhatsapp(chave: Chave) {
  entrarComo(contas.gestor.token)
  await confirmarContaViaWhatsappGestao({ usuarioId: contas[chave].id })
  sairDaSessao()
}

beforeEach(async () => {
  enviarEmailConfirmacao.mockReset()
  enviarEmailConfirmacao.mockResolvedValue({ sucesso: true, id: 'id-teste' })
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('cadastro do Cliente pelo site', () => {
  it('nasce com perfil Cliente e sem verificação alguma', async () => {
    const [usuario] = await db
      .select({
        status: usuarios.status,
        emailVerificado: usuarios.emailVerificado,
        whatsappVerificado: usuarios.whatsappVerificado,
      })
      .from(usuarios)
      .where(eq(usuarios.id, contas.clienteA.id))
    expect(usuario.status).toBe('pendente_email')
    expect(usuario.emailVerificado).toBe(false)
    expect(usuario.whatsappVerificado).toBe(false)
  })

  it('conta pendente não resolve destino algum', async () => {
    expect(await resolverAcessoUsuario(contas.clienteA.id)).toBeNull()
  })

  it('sessão de conta pendente não é aceita pelo servidor', async () => {
    entrarComo(contas.clienteA.token)
    expect(await obterSessaoServidor()).toBeNull()
  })
})

describe('confirmação e destino', () => {
  it('confirmado por e-mail vai para /cliente', async () => {
    await liberarPorEmail('clienteA')
    const acesso = await resolverAcessoUsuario(contas.clienteA.id)
    expect(acesso?.destino).toBe('/cliente')
    expect(acesso?.perfil).toBe('cliente')
    expect(acesso?.tipoPrestador).toBeNull()
  })

  it('confirmado via WhatsApp pela Gestão vai para /cliente sem falsear o e-mail', async () => {
    await liberarPorWhatsapp('clienteB')

    const [usuario] = await db
      .select({
        emailVerificado: usuarios.emailVerificado,
        whatsappVerificado: usuarios.whatsappVerificado,
      })
      .from(usuarios)
      .where(eq(usuarios.id, contas.clienteB.id))
    expect(usuario.emailVerificado).toBe(false)
    expect(usuario.whatsappVerificado).toBe(true)

    const acesso = await resolverAcessoUsuario(contas.clienteB.id)
    expect(acesso?.destino).toBe('/cliente')
  })

  it('Cliente nunca cai no painel do prestador', async () => {
    await liberarPorEmail('clienteA')
    const acesso = await resolverAcessoUsuario(contas.clienteA.id)
    expect(acesso?.destino).not.toBe('/admin')
    expect(acesso?.destino).not.toBe('/gestao')
    expect(acesso?.destino).not.toBe('/cadastro-profissional')
    expect(acesso?.destino).not.toBe('/cadastro-colaborador')
  })
})

describe('sessão do Cliente', () => {
  it('sessão passa a valer depois da confirmação (e sobrevive a nova leitura)', async () => {
    await liberarPorEmail('clienteA')
    entrarComo(contas.clienteA.token)

    const primeira = await obterSessaoServidor()
    expect(primeira?.id).toBe(contas.clienteA.id)
    expect(primeira?.perfilTipo).toBe('cliente')

    // Releitura equivale a refresh da página: mesma sessão, mesmo resultado.
    const segunda = await obterSessaoServidor()
    expect(segunda?.id).toBe(contas.clienteA.id)
  })

  it('uma segunda sessão do mesmo Cliente também é válida', async () => {
    await liberarPorEmail('clienteA')
    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: contas.clienteA.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'portal-cliente',
    })

    entrarComo(token)
    expect((await obterSessaoServidor())?.id).toBe(contas.clienteA.id)
  })

  it('logout encerra a sessão e o acesso cai na hora', async () => {
    await liberarPorEmail('clienteA')
    entrarComo(contas.clienteA.token)
    expect(await obterSessaoServidor()).not.toBeNull()

    await db
      .update(sessoesUsuario)
      .set({ encerradaEm: new Date() })
      .where(eq(sessoesUsuario.usuarioId, contas.clienteA.id))

    expect(await obterSessaoServidor()).toBeNull()
  })
})

describe('área do Cliente', () => {
  it('carrega os próprios dados', async () => {
    await liberarPorEmail('clienteA')
    const dados = await obterDadosCliente(contas.clienteA.id)
    expect(dados?.email).toBe(`clienteA${SUFIXO}`)
    expect(dados?.emailVerificado).toBe(true)
  })

  it('edita os próprios dados sem tocar em e-mail', async () => {
    await liberarPorEmail('clienteA')
    entrarComo(contas.clienteA.token)

    const resultado = await atualizarDadosConta({
      nome: 'Cliente A Renomeado',
      whatsapp: '11940009999',
    })
    expect(resultado.sucesso).toBe(true)

    const dados = await obterDadosCliente(contas.clienteA.id)
    expect(dados?.nome).toBe('Cliente A Renomeado')
    expect(dados?.whatsapp).toBe('11940009999')
    expect(dados?.email).toBe(`clienteA${SUFIXO}`)
  })

  it('sem sessão não edita dado nenhum', async () => {
    await liberarPorEmail('clienteA')
    sairDaSessao()
    const resultado = await atualizarDadosConta({
      nome: 'Invasor',
      whatsapp: '11911112222',
    })
    expect(resultado.sucesso).toBe(false)
    expect((await obterDadosCliente(contas.clienteA.id))?.nome).not.toBe('Invasor')
  })

  it('recusa trocar o WhatsApp quando ele é a única verificação', async () => {
    await liberarPorWhatsapp('clienteB')
    entrarComo(contas.clienteB.token)

    const resultado = await atualizarDadosConta({
      nome: 'Cliente B',
      whatsapp: '11933334444',
    })
    expect(resultado.sucesso).toBe(false)
    // A conta continua verificada — o usuário não se trancou para fora.
    expect(await resolverAcessoUsuario(contas.clienteB.id)).not.toBeNull()
  })
})

describe('isolamento entre Clientes', () => {
  it('Cliente A não alcança os dados de Cliente B pela própria sessão', async () => {
    await liberarPorEmail('clienteA')
    await liberarPorEmail('clienteB')
    entrarComo(contas.clienteA.token)

    // A área do Cliente resolve o alvo pela sessão, nunca por id recebido.
    const sessao = await obterSessaoServidor()
    expect(sessao?.id).toBe(contas.clienteA.id)
    expect(sessao?.id).not.toBe(contas.clienteB.id)
  })

  it('editar pela sessão de A jamais altera a conta de B', async () => {
    await liberarPorEmail('clienteA')
    await liberarPorEmail('clienteB')
    entrarComo(contas.clienteA.token)

    await atualizarDadosConta({ nome: 'Somente A', whatsapp: '11940008888' })

    const b = await obterDadosCliente(contas.clienteB.id)
    expect(b?.nome).toBe('Portal clienteB')
  })
})

describe('Cliente bloqueado nas áreas de prestador e da Gestão', () => {
  beforeEach(async () => {
    await liberarPorEmail('clienteA')
    entrarComo(contas.clienteA.token)
  })

  it('não abre a listagem da Gestão', async () => {
    const resultado = await listarUsuariosGestao({
      busca: '',
      perfil: 'todos',
      profissao: 'todos',
      modalidade: 'todos',
      status: 'todos',
      statusProfissional: 'todos',
      emailVerificado: 'todos',
      verificacao: 'todos',
      empresa: '',
      pagina: 1,
      porPagina: 10,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('não confirma conta de ninguém via WhatsApp', async () => {
    const resultado = await confirmarContaViaWhatsappGestao({
      usuarioId: contas.clienteB.id,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('não abre a área de Equipe', async () => {
    expect((await carregarEquipe()).sucesso).toBe(false)
  })

  it('não lista nem cria clientes da carteira de prestador', async () => {
    expect((await listarMeusClientes({})).sucesso).toBe(false)

    const criacao = await criarCliente({
      nome: 'Cliente indevido',
      email: 'indevido@teste.com',
      telefone: '11988887777',
      empresaNome: '',
      area: 'contabil',
      status: 'ativo',
      tipoAtendimento: 'mensal',
      valorReferencia: '100,00',
      observacoes: '',
      cep: '01310000',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      complemento: '',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
    })
    expect(criacao.sucesso).toBe(false)
  })

  it('não salva cadastro profissional', async () => {
    const resultado = await salvarPerfilProfissional({
      tipoProfissional: 'contabilidade',
      numeroRegistro: 'CRC-999999',
      estadoRegistro: 'SP',
      areasAtuacao: ['contabil'],
      apresentacao: 'Tentativa indevida de virar profissional.',
      nomeAtuacao: 'Cliente A',
      modalidadeAtuacao: 'individual',
      cidade: 'São Paulo',
      estado: 'SP',
      telefoneContato: '11940000000',
      emailProfissional: `clienteA${SUFIXO}`,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('continua sendo Cliente depois das tentativas', async () => {
    const acesso = await resolverAcessoUsuario(contas.clienteA.id)
    expect(acesso?.perfil).toBe('cliente')
    expect(acesso?.destino).toBe('/cliente')
    expect(acesso?.tipoPrestador).toBeNull()
  })
})

describe('Gestão enxerga o Cliente', () => {
  const BASE = {
    busca: '',
    perfil: 'todos',
    profissao: 'todos',
    modalidade: 'todos',
    status: 'todos',
    statusProfissional: 'todos',
    emailVerificado: 'todos',
    verificacao: 'todos',
    empresa: '',
    pagina: 1,
    porPagina: 50,
  }

  it('localiza o Cliente pendente com os dados reais', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await listarUsuariosGestao({ ...BASE, busca: 'Portal cliente' })
    expect(resultado.sucesso).toBe(true)

    const cliente = resultado.usuarios.find(
      (u) => u.email === `clientePendente${SUFIXO}`,
    )!
    expect(cliente.perfil).toBe('cliente')
    expect(cliente.whatsapp).toMatch(/^1194000/)
    expect(cliente.emailVerificado).toBe(false)
    expect(cliente.whatsappVerificado).toBe(false)
    expect(cliente.status).toBe('pendente_email')
    expect(cliente.criadoEm).toBeTruthy()
  })

  it('filtra por perfil Cliente', async () => {
    entrarComo(contas.gestor.token)
    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      busca: 'Portal',
      perfil: 'cliente',
    })
    expect(lista.length).toBe(3)
    for (const usuario of lista) expect(usuario.perfil).toBe('cliente')
  })

  it('localiza o Cliente pelo WhatsApp', async () => {
    entrarComo(contas.gestor.token)
    const alvo = await obterDadosCliente(contas.clienteA.id)
    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      busca: alvo!.whatsapp!,
    })
    expect(lista.map((u) => u.id)).toContain(contas.clienteA.id)
  })

  it('confirma o Cliente pendente via WhatsApp e ele passa a entrar', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await confirmarContaViaWhatsappGestao({
      usuarioId: contas.clientePendente.id,
    })
    expect(resultado.sucesso).toBe(true)

    const acesso = await resolverAcessoUsuario(contas.clientePendente.id)
    expect(acesso?.destino).toBe('/cliente')

    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      busca: 'Portal',
      verificacao: 'whatsapp',
    })
    expect(lista.map((u) => u.id)).toContain(contas.clientePendente.id)
  })
})

describe('o Cliente do site não vira cliente da carteira de ninguém', () => {
  it('confirmar a conta não cria registro em clientes', async () => {
    const { clientes } = await import('@/db/schema')
    await liberarPorEmail('clienteA')

    const carteira = await db
      .select({ id: clientes.id })
      .from(clientes)
      .where(eq(clientes.email, `clientea${SUFIXO}`))
    expect(carteira).toEqual([])
  })
})
