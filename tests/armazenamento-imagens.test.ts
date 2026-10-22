import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// O Vercel Blob nunca é chamado de verdade: se o driver local vazar para ele,
// estes mocks acusam.
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (chave: string) => ({ url: `https://blob.teste/${chave}` })),
  del: vi.fn(async () => undefined),
}))

const { put, del } = await import('@vercel/blob')
const { driverArmazenamento } = await import('@/integracoes/armazenamento/config')
const { caminhoLocalSeguro, lerArquivoLocal } = await import('@/integracoes/armazenamento/local')
const { enviarImagemPublica, removerImagemPublica } = await import(
  '@/integracoes/armazenamento/imagens-publicas'
)

let pasta: string

function imagem(conteudo = 'webp-falso') {
  return new File([conteudo], 'imagem.webp', { type: 'image/webp' })
}

beforeAll(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), 'vincis-armazenamento-'))
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(pasta, { recursive: true, force: true })
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ARMAZENAMENTO_LOCAL_DIR', pasta)
})

describe('driverArmazenamento', () => {
  it('next dev usa o disco local por padrão', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(driverArmazenamento()).toBe('local')
  })

  it('produção usa o Vercel Blob por padrão', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(driverArmazenamento()).toBe('vercel-blob')
  })

  it('recusa o driver local em produção', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ARMAZENAMENTO_IMAGENS', 'local')
    expect(() => driverArmazenamento()).toThrow()
  })

  it('recusa valor desconhecido em vez de adivinhar', () => {
    vi.stubEnv('ARMAZENAMENTO_IMAGENS', 'outro')
    expect(() => driverArmazenamento()).toThrow()
  })
})

describe('driver local', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'development'))

  it('grava, serve depois (sobrevive ao refresh) e remove — sem tocar no Blob', async () => {
    const chave = 'perfis-profissionais/u1/destaque/a.webp'
    const { url } = await enviarImagemPublica(chave, imagem('conteudo-1'))
    expect(url).toBe(`/api/armazenamento-local/${chave}`)

    const lido = await lerArquivoLocal(chave)
    expect(lido?.tipo).toBe('image/webp')
    expect(lido?.conteudo.toString()).toBe('conteudo-1')

    await removerImagemPublica(url)
    expect(await lerArquivoLocal(chave)).toBeNull()
    expect(put).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('URL remota (ex.: copiada da homologação) não é apagada', async () => {
    await removerImagemPublica('https://exemplo.public.blob.vercel-storage.com/x.webp')
    expect(del).not.toHaveBeenCalled()
  })

  it('remover o avatar não alcança o arquivo da foto de destaque', async () => {
    const avatar = await enviarImagemPublica('perfis-profissionais/u1/avatar/a.webp', imagem())
    await enviarImagemPublica('perfis-profissionais/u1/destaque/d.webp', imagem())
    await removerImagemPublica(avatar.url)
    expect(await lerArquivoLocal('perfis-profissionais/u1/destaque/d.webp')).not.toBeNull()
  })

  it('recusa caminhos que escapam da pasta e tipos fora de imagem', async () => {
    expect(caminhoLocalSeguro('../.env')).toBeNull()
    expect(caminhoLocalSeguro('a/../../.env')).toBeNull()
    expect(caminhoLocalSeguro('a//b.webp')).toBeNull()
    expect(await lerArquivoLocal('../../.env')).toBeNull()
    expect(await lerArquivoLocal('perfis/u1/arquivo.txt')).toBeNull()
  })
})

describe('driver vercel-blob (online)', () => {
  const URL_PUBLICA = 'https://abc123.public.blob.vercel-storage.com/perfis-profissionais/u1/avatar/a.webp'

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('IMAGENS_PUBLICAS_READ_WRITE_TOKEN', 'token-imagens-publicas')
    // O token do store PRIVADO de documentos também existe online: nunca pode ser usado aqui.
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'token-documentos-privados')
  })

  it('envia ao store público com o token próprio das imagens públicas', async () => {
    vi.mocked(put).mockResolvedValueOnce({ url: URL_PUBLICA } as Awaited<ReturnType<typeof put>>)
    const { url } = await enviarImagemPublica('perfis-profissionais/u1/avatar/a.webp', imagem())
    expect(url).toBe(URL_PUBLICA)
    expect(put).toHaveBeenCalledWith('perfis-profissionais/u1/avatar/a.webp', expect.any(File), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'image/webp',
      token: 'token-imagens-publicas',
    })
  })

  it('sem o store público conectado, recusa em vez de cair no store privado', async () => {
    vi.stubEnv('IMAGENS_PUBLICAS_READ_WRITE_TOKEN', '')
    await expect(enviarImagemPublica('perfis-profissionais/u1/avatar/a.webp', imagem())).rejects.toThrow()
    expect(put).not.toHaveBeenCalled()
  })

  it('remove só URLs do store público, com o token próprio', async () => {
    await removerImagemPublica(URL_PUBLICA)
    expect(del).toHaveBeenCalledWith(URL_PUBLICA, { token: 'token-imagens-publicas' })
  })

  it('nunca remove arquivo privado, imagem externa ou URL local', async () => {
    await removerImagemPublica('https://abc123.private.blob.vercel-storage.com/documento.pdf')
    await removerImagemPublica('https://images.unsplash.com/photo-1.jpg')
    await removerImagemPublica('/api/armazenamento-local/perfis-profissionais/u1/avatar/a.webp')
    expect(del).not.toHaveBeenCalled()
  })
})
