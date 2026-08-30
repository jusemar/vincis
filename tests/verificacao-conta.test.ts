import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  perfis,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { PERFIL_GESTOR_VINCIS } from '@/features/usuarios/constants/perfis'
import { gerarToken } from '@/features/usuarios/lib/gerar-token'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { sessoesUsuario } from '@/db/schema'
import {
  contaVerificada,
  metodosVerificacao,
  rotuloVerificacao,
} from '@/features/usuarios/lib/verificacao-conta'
import { entrarComo, sairDaSessao } from './setup/sessao'

// Só o provedor de e-mail é simulado; toda a autorização roda de verdade.
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

const SUFIXO = '@verificacao.teste'
type Papel = 'gestor' | 'profissional' | 'colaborador' | 'intruso'

const PERFIL_DE: Record<Papel, string> = {
  gestor: 'gestor_vincis',
  profissional: 'profissional',
  colaborador: 'colaborador',
  intruso: 'profissional',
}

type Conta = { id: string; token: string; tokenEmail: string }
let contas: Record<Papel, Conta>

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(
      inArray(
        usuarios.email,
        (Object.keys(PERFIL_DE) as Papel[]).map((p) => `${p}${SUFIXO}`),
      ),
    )
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  // Zera a autoria antes de apagar, para não esbarrar na auto-referência.
  await db
    .update(usuarios)
    .set({ whatsappVerificadoPorId: null })
    .where(inArray(usuarios.whatsappVerificadoPorId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

async function montarContas() {
  await limpar()
  const criadas = {} as Record<Papel, Conta>

  for (const papel of Object.keys(PERFIL_DE) as Papel[]) {
    const nomePerfil = PERFIL_DE[papel]
    await db.insert(perfis).values({ nome: nomePerfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, nomePerfil))
      .limit(1)

    // Gestor e intruso já nascem verificados por e-mail para poderem operar;
    // profissional e colaborador nascem pendentes, que é o caso de interesse.
    const jaVerificado = papel === 'gestor' || papel === 'intruso'
    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Conta ${papel}`,
        email: `${papel}${SUFIXO}`,
        whatsapp: `1196000000${Object.keys(PERFIL_DE).indexOf(papel)}`,
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
      userAgent: 'verificacao-conta',
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

    criadas[papel] = { id: usuario.id, token, tokenEmail: tokenEmail.token }
  }
  return criadas
}

async function estadoDe(id: string) {
  const [usuario] = await db
    .select({
      status: usuarios.status,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
      whatsappVerificadoEm: usuarios.whatsappVerificadoEm,
      whatsappVerificadoPorId: usuarios.whatsappVerificadoPorId,
    })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1)
  return usuario
}

async function auditoriaDe(id: string) {
  return db
    .select({ acao: eventosAuditoria.acao, autorId: eventosAuditoria.autorId })
    .from(eventosAuditoria)
    .where(
      and(
        eq(eventosAuditoria.usuarioId, id),
        eq(eventosAuditoria.acao, 'conta_verificada_via_whatsapp_gestao'),
      ),
    )
}

beforeEach(async () => {
  enviarEmailConfirmacao.mockReset()
  enviarEmailConfirmacao.mockResolvedValue({ sucesso: true, id: 'id-teste' })
  contas = await montarContas()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('matriz de verificação (pura)', () => {
  it.each([
    [false, false, false, 'Não verificada'],
    [true, false, true, 'Verificada por e-mail'],
    [false, true, true, 'Verificada via WhatsApp'],
    [true, true, true, 'Verificada por e-mail e WhatsApp'],
  ])(
    'email=%s whatsapp=%s → verificada=%s (%s)',
    (email, whatsapp, esperado, rotulo) => {
      const estado = { emailVerificado: email, whatsappVerificado: whatsapp }
      expect(contaVerificada(estado)).toBe(esperado)
      expect(rotuloVerificacao(estado)).toBe(rotulo)
    },
  )

  it('o rótulo nunca afirma e-mail confirmado quando só houve WhatsApp', () => {
    const rotulo = rotuloVerificacao({
      emailVerificado: false,
      whatsappVerificado: true,
    })
    expect(rotulo).not.toMatch(/e-mail/i)
  })

  it('lista os métodos que de fato comprovaram a conta', () => {
    expect(
      metodosVerificacao({ emailVerificado: false, whatsappVerificado: true }),
    ).toEqual(['whatsapp_gestao'])
    expect(
      metodosVerificacao({ emailVerificado: true, whatsappVerificado: true }),
    ).toEqual(['email', 'whatsapp_gestao'])
  })
})

describe('confirmação por e-mail (fluxo preservado)', () => {
  it('marca o e-mail e libera a conta', async () => {
    const resultado = await confirmarEmail({ token: contas.colaborador.tokenEmail })
    expect(resultado.sucesso).toBe(true)

    const estado = await estadoDe(contas.colaborador.id)
    expect(estado.emailVerificado).toBe(true)
    expect(estado.whatsappVerificado).toBe(false)
    expect(estado.status).toBe('ativo')
  })
})

describe('confirmação via WhatsApp pela Gestão', () => {
  it('o Gestor confirma e a conta é liberada sem falsificar o e-mail', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await confirmarContaViaWhatsappGestao({
      usuarioId: contas.colaborador.id,
    })
    expect(resultado.sucesso).toBe(true)

    const estado = await estadoDe(contas.colaborador.id)
    expect(estado.whatsappVerificado).toBe(true)
    // A garantia central: o e-mail continua pendente.
    expect(estado.emailVerificado).toBe(false)
    expect(estado.status).toBe('ativo')
    expect(estado.whatsappVerificadoPorId).toBe(contas.gestor.id)
    expect(estado.whatsappVerificadoEm).toBeInstanceOf(Date)
  })

  it('registra a auditoria com autor, sujeito e método', async () => {
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.profissional.id })

    const eventos = await auditoriaDe(contas.profissional.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0].autorId).toBe(contas.gestor.id)
  })

  it('é idempotente: repetir não duplica auditoria nem regrava a autoria', async () => {
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.colaborador.id })
    const primeira = await estadoDe(contas.colaborador.id)

    const repetida = await confirmarContaViaWhatsappGestao({
      usuarioId: contas.colaborador.id,
    })
    expect(repetida.sucesso).toBe(true)
    expect(repetida.mensagem).toMatch(/já estava verificada/i)

    const segunda = await estadoDe(contas.colaborador.id)
    expect(segunda.whatsappVerificadoEm).toEqual(primeira.whatsappVerificadoEm)
    expect(await auditoriaDe(contas.colaborador.id)).toHaveLength(1)
  })

  it('recusa usuário inexistente', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await confirmarContaViaWhatsappGestao({
      usuarioId: '00000000-0000-0000-0000-000000000000',
    })
    expect(resultado.sucesso).toBe(false)
  })
})

describe('somente o Gestor Vincis confirma', () => {
  it.each(['profissional', 'colaborador', 'intruso'] as const)(
    '%s chamando a action diretamente é bloqueado e nada muda',
    async (papel) => {
      entrarComo(contas[papel].token)
      const resultado = await confirmarContaViaWhatsappGestao({
        usuarioId: contas.colaborador.id,
      })
      expect(resultado.sucesso).toBe(false)
      expect(resultado.mensagem).toMatch(/não autorizada/i)

      const estado = await estadoDe(contas.colaborador.id)
      expect(estado.whatsappVerificado).toBe(false)
      expect(await auditoriaDe(contas.colaborador.id)).toHaveLength(0)
    },
  )

  it('sem sessão nenhuma também é bloqueado', async () => {
    sairDaSessao()
    const resultado = await confirmarContaViaWhatsappGestao({
      usuarioId: contas.colaborador.id,
    })
    expect(resultado.sucesso).toBe(false)
    expect((await estadoDe(contas.colaborador.id)).whatsappVerificado).toBe(false)
  })
})

describe('roteamento após verificação', () => {
  it('conta sem verificação alguma não resolve destino', async () => {
    expect(await resolverAcessoUsuario(contas.colaborador.id)).toBeNull()
    expect(await resolverAcessoUsuario(contas.profissional.id)).toBeNull()
  })

  it('Colaborador confirmado via WhatsApp segue para /cadastro-colaborador', async () => {
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.colaborador.id })

    const acesso = await resolverAcessoUsuario(contas.colaborador.id)
    expect(acesso?.destino).toBe('/cadastro-colaborador')
    // Verificar identidade não cria cadastro técnico nenhum.
    expect(acesso?.habilitado).toBe(false)
    expect(acesso?.statusProfissional).toBeNull()
  })

  it('Profissional confirmado via WhatsApp segue para /cadastro-profissional', async () => {
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.profissional.id })

    const acesso = await resolverAcessoUsuario(contas.profissional.id)
    expect(acesso?.destino).toBe('/cadastro-profissional')
    // Identidade confirmada não é aprovação profissional.
    expect(acesso?.habilitado).toBe(false)
  })

  it('confirmar identidade não promove ninguém a Gestor da plataforma', async () => {
    // Antes da unificação isto se lia no destino (`/gestao`). Agora `/admin` é
    // destino comum, então o que prova a mesma coisa é o perfil resolvido: a
    // confirmação por WhatsApp continua sendo identidade, nunca promoção.
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.profissional.id })
    const acesso = await resolverAcessoUsuario(contas.profissional.id)
    expect(acesso?.perfil).not.toBe(PERFIL_GESTOR_VINCIS)
  })
})

describe('e-mail confirmado depois da liberação por WhatsApp', () => {
  it('acumula os dois métodos sem inconsistência', async () => {
    entrarComo(contas.colaborador.token)
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.colaborador.id })

    // O link continua válido e é usado depois.
    const resultado = await confirmarEmail({ token: contas.colaborador.tokenEmail })
    expect(resultado.sucesso).toBe(true)

    const estado = await estadoDe(contas.colaborador.id)
    expect(estado.emailVerificado).toBe(true)
    expect(estado.whatsappVerificado).toBe(true)
    expect(estado.whatsappVerificadoPorId).toBe(contas.gestor.id)
    expect(estado.status).toBe('ativo')

    expect(
      rotuloVerificacao(estado),
    ).toBe('Verificada por e-mail e WhatsApp')
    expect(await resolverAcessoUsuario(contas.colaborador.id)).not.toBeNull()
  })

  it('a confirmação por e-mail não apaga a autoria da Gestão', async () => {
    entrarComo(contas.gestor.token)
    await confirmarContaViaWhatsappGestao({ usuarioId: contas.profissional.id })
    const antes = await estadoDe(contas.profissional.id)

    await confirmarEmail({ token: contas.profissional.tokenEmail })
    const depois = await estadoDe(contas.profissional.id)

    expect(depois.whatsappVerificadoEm).toEqual(antes.whatsappVerificadoEm)
    expect(depois.whatsappVerificadoPorId).toBe(contas.gestor.id)
  })
})
