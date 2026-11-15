import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cadastro do webhook Pix da Efí pela Gestão.
 *
 * A Efí é trocada só no transporte (`chamarApiPixEfi`): caminho, cabeçalhos,
 * corpo, 404 de "sem webhook" e as regras de domínio rodam de verdade.
 */

type Chamada = { metodo: string; caminho: string; corpo?: unknown; cabecalhos?: Record<string, string> }
const efi = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  cadastrado: null as { webhookUrl: string; criacao: string } | null,
  falharPut: null as number | null,
  /** Como a Efí responde o GET sem webhook: 404, ou o HTTP 400 real da produção. */
  semWebhook: { status: 404, mensagem: 'Webhook não encontrado' },
}))

vi.mock('@/integracoes/efi/cliente', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/integracoes/efi/cliente')>()
  return {
    ...real,
    chamarApiPixEfi: async (metodo: string, caminho: string, corpo?: unknown, cabecalhos?: Record<string, string>) => {
      efi.chamadas.push({ metodo, caminho, corpo, cabecalhos })
      if (metodo === 'GET') {
        if (!efi.cadastrado) throw new real.ErroEfi(efi.semWebhook.mensagem, efi.semWebhook.status)
        return { ...efi.cadastrado, chave: 'chave' }
      }
      if (efi.falharPut) throw new real.ErroEfi('Recusado', efi.falharPut)
      efi.cadastrado = { webhookUrl: (corpo as { webhookUrl: string }).webhookUrl, criacao: '2026-11-15T20:00:00.000Z' }
      return efi.cadastrado
    },
  }
})

const { inArray, or } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const { eventosAuditoria } = await import('@/db/schema')
const { ErroEfi, rotuloDoCaminho } = await import('@/integracoes/efi/cliente')
const { webhookNaoEncontrado } = await import('@/integracoes/efi/webhook-cadastro')
const { cadastrarWebhookEfiAction } = await import('@/features/pagamentos/actions/webhook-efi')
const { compararWebhook, consultarSituacaoWebhookEfi, montarUrlWebhookEfi } = await import(
  '@/features/pagamentos/lib/webhook-efi-cadastro'
)
const { responderWebhookPixEfi } = await import('@/features/pagamentos/lib/responder-webhook-efi')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { comSessao } = await import('./setup/sessao')

const SUFIXO = '@webhook-efi.teste'
const TOKEN = 'token-secreto-de-teste-0123456789abcdef'
const CHAVE = '11111111-2222-4333-8444-555555555555'
const PRODUCAO = {
  VERCEL_ENV: 'production',
  EFI_SANDBOX: 'false',
  EFI_CLIENT_ID: 'id-teste',
  EFI_CLIENT_SECRET: 'segredo-teste',
  EFI_PIX_KEY: CHAVE,
  EFI_CERTIFICATE_BASE64: 'AAAA',
  EFI_WEBHOOK_TOKEN: TOKEN,
}

type Conta = { id: string; token: string }
let contas: Record<'gestor' | 'contador' | 'cliente', Conta>

function emProducao() {
  for (const [nome, valor] of Object.entries(PRODUCAO)) vi.stubEnv(nome, valor)
}

async function eventosDoGestor() {
  return db.select().from(eventosAuditoria).where(inArray(eventosAuditoria.autorId, [contas.gestor.id]))
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      gestor: { perfil: 'gestor_vincis' },
      contador: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
    },
    '119530',
  )
})

afterAll(async () => {
  const ids = Object.values(contas).map((c) => c.id)
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.usuarioId, ids), inArray(eventosAuditoria.autorId, ids)))
  await limparContas(SUFIXO)
  vi.unstubAllEnvs()
})

beforeEach(() => {
  efi.chamadas = []
  efi.cadastrado = null
  efi.falharPut = null
  efi.semWebhook = { status: 404, mensagem: 'Webhook não encontrado' }
  vi.unstubAllEnvs()
  emProducao()
})

describe('URL do webhook', () => {
  it('é a da produção, com o token e "ignorar=" por último', () => {
    const url = montarUrlWebhookEfi(TOKEN)
    expect(url).toBe(`https://vincis.com.br/api/efi/webhook?token=${TOKEN}&ignorar=`)
  })

  it('o "/pix" que a Efí acrescenta cai em "ignorar" e não estraga token nem caminho', () => {
    const recebida = new URL(`${montarUrlWebhookEfi(TOKEN)}/pix`)
    expect(recebida.pathname).toBe('/api/efi/webhook')
    expect(recebida.searchParams.get('token')).toBe(TOKEN)
    expect(recebida.searchParams.get('ignorar')).toBe('/pix')
  })

  it('compara por partes: Vincis, token diferente, formato diferente, outro endereço', () => {
    expect(compararWebhook(montarUrlWebhookEfi(TOKEN), TOKEN)).toEqual({ tipo: 'vincis' })
    expect(compararWebhook(montarUrlWebhookEfi('outro'), TOKEN)).toEqual({ tipo: 'vincis_token_diferente' })
    expect(compararWebhook(`https://vincis.com.br/api/efi/webhook?token=${TOKEN}`, TOKEN)).toEqual({
      tipo: 'vincis_formato_diferente',
    })
    expect(compararWebhook('https://nooo.exemplo/api/webhook?token=x', TOKEN)).toEqual({
      tipo: 'outro_endereco',
      dominio: 'nooo.exemplo',
    })
  })

  it('ausência de webhook: 404, ou só o 400 com a mensagem específica da Efí', () => {
    expect(webhookNaoEncontrado(new ErroEfi('qualquer', 404))).toBe(true)
    expect(webhookNaoEncontrado(new ErroEfi('Nenhum webhook encontrado para a chave informada', 400))).toBe(true)
    expect(webhookNaoEncontrado(new ErroEfi('Nenhum webhook encontrado para a chave informada.', 400))).toBe(true)
    expect(webhookNaoEncontrado(new ErroEfi('Nenhum webhook encontrado para a chave informada', 500))).toBe(false)
    expect(webhookNaoEncontrado(new ErroEfi('Requisição inválida', 400))).toBe(false)
    expect(webhookNaoEncontrado(new ErroEfi('Não foi possível comunicar com a Efí.', 400))).toBe(false)
    expect(webhookNaoEncontrado(new Error('Nenhum webhook encontrado para a chave informada'))).toBe(false)
  })

  it('o log do transporte nunca leva a chave Pix', () => {
    expect(rotuloDoCaminho(`/v2/webhook/${CHAVE}`)).toBe('/v2/webhook/…')
  })
})

describe('trava de ambiente', () => {
  it('fora da produção não consulta nem cadastra', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect((await consultarSituacaoWebhookEfi()).estado).toBe('indisponivel')
    expect(efi.chamadas).toEqual([])
  })

  it('produção sem token ou em sandbox fica indisponível', async () => {
    vi.stubEnv('EFI_WEBHOOK_TOKEN', '')
    expect(await consultarSituacaoWebhookEfi()).toMatchObject({ estado: 'indisponivel' })
    vi.stubEnv('EFI_WEBHOOK_TOKEN', TOKEN)
    vi.stubEnv('EFI_SANDBOX', 'true')
    expect(await consultarSituacaoWebhookEfi()).toMatchObject({ estado: 'indisponivel' })
    expect(efi.chamadas).toEqual([])
  })
})

describe('cadastro pela Gestão', () => {
  it('só o Gestor: Cliente, Contador e anônimo são recusados sem tocar a Efí', async () => {
    for (const token of [contas.cliente.token, contas.contador.token, null]) {
      const r = await comSessao(token, () => cadastrarWebhookEfiAction())
      expect(r).toEqual({ sucesso: false, mensagem: 'Operação não autorizada.' })
    }
    expect(efi.chamadas).toEqual([])
  })

  it('sem webhook: consulta, cadastra com skip-mTLS, confere e audita sem segredos', async () => {
    expect(await consultarSituacaoWebhookEfi()).toEqual({ estado: 'nao_cadastrado' })
    efi.chamadas = []

    const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
    expect(r).toEqual({ sucesso: true, mensagem: 'Webhook cadastrado e confirmado na Efí.' })

    expect(efi.chamadas.map((c) => c.metodo)).toEqual(['GET', 'PUT', 'GET'])
    const put = efi.chamadas[1]
    expect(put.caminho).toBe(`/v2/webhook/${CHAVE}`)
    expect(put.corpo).toEqual({ webhookUrl: montarUrlWebhookEfi(TOKEN) })
    expect(put.cabecalhos).toEqual({ 'x-skip-mtls-checking': 'true' })
    expect(await consultarSituacaoWebhookEfi()).toMatchObject({ estado: 'cadastrado' })

    const eventos = await eventosDoGestor()
    expect(eventos.map((e) => e.acao)).toEqual(['webhook_efi_cadastrado'])
    const texto = JSON.stringify(eventos[0])
    expect(texto).not.toContain(TOKEN)
    expect(texto).not.toContain(CHAVE)
    expect(JSON.stringify(r)).not.toContain(TOKEN)
  })

  it('HTTP 400 "Nenhum webhook encontrado para a chave informada" é "não cadastrado" e permite cadastrar', async () => {
    efi.semWebhook = { status: 400, mensagem: 'Nenhum webhook encontrado para a chave informada' }
    expect(await consultarSituacaoWebhookEfi()).toEqual({ estado: 'nao_cadastrado' })
    efi.chamadas = []

    const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
    expect(r).toEqual({ sucesso: true, mensagem: 'Webhook cadastrado e confirmado na Efí.' })
    expect(efi.chamadas.map((c) => c.metodo)).toEqual(['GET', 'PUT', 'GET'])
  })

  it('outro HTTP 400 não é ausência: mostra erro e não cadastra', async () => {
    efi.semWebhook = { status: 400, mensagem: 'Chave Pix inválida' }
    const situacao = await consultarSituacaoWebhookEfi()
    expect(situacao).toEqual({ estado: 'erro', mensagem: 'A Efí respondeu HTTP 400: Chave Pix inválida' })
    efi.chamadas = []

    const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
    expect(r.sucesso).toBe(false)
    expect(efi.chamadas.map((c) => c.metodo)).toEqual(['GET'])
  })

  it('já cadastrado para a Vincis: não repete o PUT', async () => {
    efi.cadastrado = { webhookUrl: montarUrlWebhookEfi(TOKEN), criacao: '2026-11-01T00:00:00.000Z' }
    const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
    expect(r.sucesso).toBe(true)
    expect(efi.chamadas.map((c) => c.metodo)).toEqual(['GET'])
  })

  it('outro webhook na chave: não sobrescreve, nem com token antigo da própria Vincis', async () => {
    for (const webhookUrl of ['https://nooo.exemplo/webhook?token=x', montarUrlWebhookEfi('token-antigo')]) {
      efi.chamadas = []
      efi.cadastrado = { webhookUrl, criacao: '2026-10-01T00:00:00.000Z' }
      const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
      expect(r).toEqual({ sucesso: false, mensagem: 'Já existe outro webhook cadastrado para esta chave Pix. Ele não foi sobrescrito.' })
      expect(efi.chamadas.map((c) => c.metodo)).toEqual(['GET'])
      expect(efi.cadastrado.webhookUrl).toBe(webhookUrl)
    }
    const situacao = await consultarSituacaoWebhookEfi()
    expect(JSON.stringify(situacao)).not.toContain('token-antigo')
  })

  it('Efí recusa o cadastro: mensagem clara, sem auditoria de cadastro', async () => {
    const antes = (await eventosDoGestor()).length
    efi.falharPut = 403
    const r = await comSessao(contas.gestor.token, () => cadastrarWebhookEfiAction())
    expect(r.sucesso).toBe(false)
    expect(r.mensagem).toContain('webhook.write')
    expect((await eventosDoGestor()).length).toBe(antes)
  })
})

describe('recebimento com a URL cadastrada', () => {
  it('a Efí chamando com "&ignorar=/pix" passa pelo token; sem token é 401', async () => {
    const corpo = JSON.stringify({ evento: 'teste_webhook' })
    const comToken = await responderWebhookPixEfi(
      new Request(`${montarUrlWebhookEfi(TOKEN)}/pix`, { method: 'POST', body: corpo }),
    )
    expect(comToken.status).toBe(200)
    const semToken = await responderWebhookPixEfi(
      new Request('https://vincis.com.br/api/efi/webhook?ignorar=/pix', { method: 'POST', body: corpo }),
    )
    expect(semToken.status).toBe(401)
  })
})
