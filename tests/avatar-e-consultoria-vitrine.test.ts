import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaConfiguracoes, perfisProfissionais } from '@/db/schema'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@avatar-consultoria.teste'

// Mesmo padrão de `perfil-valores.test.ts`: o storage é simulado, nada sobe
// para o Vercel Blob de verdade durante os testes.
vi.mock('@/features/usuarios/lib/avatar-profissional', () => ({
  // A URL devolvida carrega a finalidade, para os testes provarem que cada
  // imagem caiu na própria coluna.
  enviarAvatarPublico: vi.fn(async (_usuarioId: string, _arquivo: File, finalidade = 'avatar') => ({
    url: `https://blob.teste/${finalidade}-novo.jpg`,
  })),
  removerAvatarPublico: vi.fn(async () => undefined),
}))

const {
  salvarAvatarProfissional,
  removerAvatarProfissional,
  salvarFotoDestaqueProfissional,
  removerFotoDestaqueProfissional,
} = await import(
  '@/features/perfis/actions/salvar-avatar-profissional'
)
const { enviarAvatarPublico, removerAvatarPublico } = await import(
  '@/features/usuarios/lib/avatar-profissional'
)
const { salvarConsultoria } = await import('@/features/consultorias/actions/consultoria')

let contas: Record<'dono' | 'outro', ContaDeTeste>

function arquivoFalso() {
  return new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' })
}

beforeEach(async () => {
  vi.clearAllMocks()
  contas = await criarContas(SUFIXO, {
    dono: { perfil: 'profissional', prestador: 'profissional' },
    outro: { perfil: 'profissional', prestador: 'profissional' },
  })
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('salvarAvatarProfissional', () => {
  it('dono troca a própria foto e o avatar antigo é removido', async () => {
    entrarComo(contas.dono.token)
    await db
      .update(perfisProfissionais)
      .set({ avatarUrl: 'https://blob.teste/avatar-antigo.jpg' })
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))

    const dados = new FormData()
    dados.set('avatar', arquivoFalso())
    const resultado = await salvarAvatarProfissional(dados)
    expect(resultado.sucesso).toBe(true)

    const [perfil] = await db
      .select({ avatarUrl: perfisProfissionais.avatarUrl })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    expect(perfil.avatarUrl).toBe('https://blob.teste/avatar-novo.jpg')
    expect(enviarAvatarPublico).toHaveBeenCalledWith(contas.dono.id, expect.any(File), 'avatar')
    expect(removerAvatarPublico).toHaveBeenCalledWith('https://blob.teste/avatar-antigo.jpg')
  })

  it('sem sessão, nada é salvo e nada é enviado ao storage', async () => {
    sairDaSessao()
    const dados = new FormData()
    dados.set('avatar', arquivoFalso())
    const resultado = await salvarAvatarProfissional(dados)
    expect(resultado.sucesso).toBe(false)
    expect(enviarAvatarPublico).not.toHaveBeenCalled()
  })

  it('editar logado como "outro" não altera o avatar do dono', async () => {
    entrarComo(contas.outro.token)
    const dados = new FormData()
    dados.set('avatar', arquivoFalso())
    await salvarAvatarProfissional(dados)

    const [perfilDono] = await db
      .select({ avatarUrl: perfisProfissionais.avatarUrl })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.dono.id))
    expect(perfilDono.avatarUrl).toBeNull()
  })
})

describe('removerAvatarProfissional', () => {
  async function definirAvatar(usuarioId: string, url: string | null) {
    await db
      .update(perfisProfissionais)
      .set({ avatarUrl: url })
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
  }

  async function avatarDe(usuarioId: string) {
    const [perfil] = await db
      .select({ avatarUrl: perfisProfissionais.avatarUrl })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
    return perfil.avatarUrl
  }

  it('dono remove a própria foto: coluna volta a null e o arquivo sai do storage', async () => {
    entrarComo(contas.dono.token)
    await definirAvatar(contas.dono.id, 'https://blob.teste/avatar-dono.jpg')

    const resultado = await removerAvatarProfissional()
    expect(resultado.sucesso).toBe(true)
    expect(await avatarDe(contas.dono.id)).toBeNull()
    expect(removerAvatarPublico).toHaveBeenCalledWith('https://blob.teste/avatar-dono.jpg')
  })

  it('sem foto, responde sucesso sem chamar o storage', async () => {
    entrarComo(contas.dono.token)
    const resultado = await removerAvatarProfissional()
    expect(resultado.sucesso).toBe(true)
    expect(removerAvatarPublico).not.toHaveBeenCalled()
  })

  it('sem sessão, nada é removido', async () => {
    await definirAvatar(contas.dono.id, 'https://blob.teste/avatar-dono.jpg')
    sairDaSessao()
    const resultado = await removerAvatarProfissional()
    expect(resultado.sucesso).toBe(false)
    expect(await avatarDe(contas.dono.id)).toBe('https://blob.teste/avatar-dono.jpg')
    expect(removerAvatarPublico).not.toHaveBeenCalled()
  })

  it('remover logado como "outro" não toca na foto do dono', async () => {
    await definirAvatar(contas.dono.id, 'https://blob.teste/avatar-dono.jpg')
    entrarComo(contas.outro.token)
    await removerAvatarProfissional()
    expect(await avatarDe(contas.dono.id)).toBe('https://blob.teste/avatar-dono.jpg')
    expect(removerAvatarPublico).not.toHaveBeenCalledWith('https://blob.teste/avatar-dono.jpg')
  })
})

describe('foto de destaque do perfil (independente do avatar)', () => {
  async function definirImagens(
    usuarioId: string,
    imagens: { avatarUrl?: string | null; fotoDestaqueUrl?: string | null },
  ) {
    await db.update(perfisProfissionais).set(imagens).where(eq(perfisProfissionais.usuarioId, usuarioId))
  }

  async function imagensDe(usuarioId: string) {
    const [perfil] = await db
      .select({
        avatarUrl: perfisProfissionais.avatarUrl,
        fotoDestaqueUrl: perfisProfissionais.fotoDestaqueUrl,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
    return perfil
  }

  function formularioFoto() {
    const dados = new FormData()
    dados.set('foto', arquivoFalso())
    return dados
  }

  it('perfil novo começa sem foto de destaque', async () => {
    expect((await imagensDe(contas.dono.id)).fotoDestaqueUrl).toBeNull()
  })

  it('dono adiciona a foto de destaque sem tocar no avatar', async () => {
    entrarComo(contas.dono.token)
    await definirImagens(contas.dono.id, { avatarUrl: 'https://blob.teste/avatar-dono.jpg' })

    const resultado = await salvarFotoDestaqueProfissional(formularioFoto())
    expect(resultado.sucesso).toBe(true)
    expect(enviarAvatarPublico).toHaveBeenCalledWith(contas.dono.id, expect.any(File), 'destaque')
    expect(await imagensDe(contas.dono.id)).toEqual({
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: 'https://blob.teste/destaque-novo.jpg',
    })
    expect(removerAvatarPublico).not.toHaveBeenCalled()
  })

  it('trocar a foto de destaque remove só o arquivo antigo do destaque', async () => {
    entrarComo(contas.dono.token)
    await definirImagens(contas.dono.id, {
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: 'https://blob.teste/destaque-antigo.jpg',
    })

    await salvarFotoDestaqueProfissional(formularioFoto())
    expect(await imagensDe(contas.dono.id)).toEqual({
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: 'https://blob.teste/destaque-novo.jpg',
    })
    expect(removerAvatarPublico).toHaveBeenCalledTimes(1)
    expect(removerAvatarPublico).toHaveBeenCalledWith('https://blob.teste/destaque-antigo.jpg')
  })

  it('remover a foto de destaque mantém o avatar do card', async () => {
    entrarComo(contas.dono.token)
    await definirImagens(contas.dono.id, {
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg',
    })

    const resultado = await removerFotoDestaqueProfissional()
    expect(resultado.sucesso).toBe(true)
    expect(await imagensDe(contas.dono.id)).toEqual({
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: null,
    })
    expect(removerAvatarPublico).toHaveBeenCalledTimes(1)
    expect(removerAvatarPublico).toHaveBeenCalledWith('https://blob.teste/destaque-dono.jpg')
  })

  it('remover o avatar mantém a foto de destaque', async () => {
    entrarComo(contas.dono.token)
    await definirImagens(contas.dono.id, {
      avatarUrl: 'https://blob.teste/avatar-dono.jpg',
      fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg',
    })

    await removerAvatarProfissional()
    expect(await imagensDe(contas.dono.id)).toEqual({
      avatarUrl: null,
      fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg',
    })
    expect(removerAvatarPublico).not.toHaveBeenCalledWith('https://blob.teste/destaque-dono.jpg')
  })

  it('depois de removida, a foto de destaque pode ser adicionada de novo', async () => {
    entrarComo(contas.dono.token)
    await definirImagens(contas.dono.id, { fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg' })

    await removerFotoDestaqueProfissional()
    expect((await imagensDe(contas.dono.id)).fotoDestaqueUrl).toBeNull()
    await salvarFotoDestaqueProfissional(formularioFoto())
    expect((await imagensDe(contas.dono.id)).fotoDestaqueUrl).toBe('https://blob.teste/destaque-novo.jpg')
  })

  it('sem sessão, nada é salvo nem removido', async () => {
    await definirImagens(contas.dono.id, { fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg' })
    sairDaSessao()

    expect((await salvarFotoDestaqueProfissional(formularioFoto())).sucesso).toBe(false)
    expect((await removerFotoDestaqueProfissional()).sucesso).toBe(false)
    expect((await imagensDe(contas.dono.id)).fotoDestaqueUrl).toBe('https://blob.teste/destaque-dono.jpg')
    expect(enviarAvatarPublico).not.toHaveBeenCalled()
    expect(removerAvatarPublico).not.toHaveBeenCalled()
  })

  it('logado como "outro", não altera nem remove a foto de destaque do dono', async () => {
    await definirImagens(contas.dono.id, { fotoDestaqueUrl: 'https://blob.teste/destaque-dono.jpg' })
    entrarComo(contas.outro.token)

    await salvarFotoDestaqueProfissional(formularioFoto())
    await removerFotoDestaqueProfissional()
    expect((await imagensDe(contas.dono.id)).fotoDestaqueUrl).toBe('https://blob.teste/destaque-dono.jpg')
    expect(removerAvatarPublico).not.toHaveBeenCalledWith('https://blob.teste/destaque-dono.jpg')
  })
})

describe('edição inline da consultoria (reaproveitando salvarConsultoria)', () => {
  async function criarConsultoria(prestadorId: string) {
    await db.insert(consultoriaConfiguracoes).values({
      prestadorId,
      titulo: 'Consultoria original',
      descricaoCurta: 'Descrição original da consultoria.',
      modalidade: 'online',
      valorCentavos: 15000,
      duracaoMinutos: 30,
      intervaloMinutos: 15,
      antecedenciaMinimaMinutos: 120,
      horizonteDias: 45,
      timezone: 'America/Sao_Paulo',
      ativa: true,
    })
  }

  it('altera título/descrição/valor/duração sem tocar nos demais campos', async () => {
    entrarComo(contas.dono.token)
    await criarConsultoria(contas.dono.id)

    const resultado = await salvarConsultoria({
      titulo: 'Consultoria atualizada',
      descricaoCurta: 'Nova descrição curta da consultoria.',
      modalidade: 'online',
      valorCentavos: 20000,
      duracaoMinutos: 45,
      // Campos que a edição de vitrine nunca deveria mudar — reenviados
      // exatamente como estavam, simulando o merge feito no componente.
      intervaloMinutos: 15,
      antecedenciaMinimaMinutos: 120,
      horizonteDias: 45,
      timezone: 'America/Sao_Paulo',
      ativa: true,
    })
    expect(resultado.sucesso).toBe(true)

    const [config] = await db
      .select()
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.dono.id))
    expect(config.titulo).toBe('Consultoria atualizada')
    expect(config.valorCentavos).toBe(20000)
    expect(config.duracaoMinutos).toBe(45)
    // Intocados: agenda, disponibilidade, status.
    expect(config.intervaloMinutos).toBe(15)
    expect(config.antecedenciaMinimaMinutos).toBe(120)
    expect(config.horizonteDias).toBe(45)
    expect(config.timezone).toBe('America/Sao_Paulo')
    expect(config.ativa).toBe(true)
  })

  it('editar logado como "outro" não altera a consultoria do dono', async () => {
    entrarComo(contas.dono.token)
    await criarConsultoria(contas.dono.id)

    entrarComo(contas.outro.token)
    await salvarConsultoria({
      titulo: 'Consultoria de outro',
      descricaoCurta: 'Descrição de outro profissional.',
      modalidade: 'online',
      valorCentavos: 5000,
      duracaoMinutos: 20,
      intervaloMinutos: 0,
      antecedenciaMinimaMinutos: 60,
      horizonteDias: 30,
      timezone: 'America/Sao_Paulo',
      ativa: true,
    })

    const [configDono] = await db
      .select({ titulo: consultoriaConfiguracoes.titulo })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.dono.id))
    expect(configDono.titulo).toBe('Consultoria original')
  })
})
