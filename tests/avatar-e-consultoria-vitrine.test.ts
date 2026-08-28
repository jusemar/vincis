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
  enviarAvatarPublico: vi.fn(async () => ({ url: 'https://blob.teste/avatar-novo.jpg' })),
  removerAvatarPublico: vi.fn(async () => undefined),
}))

const { salvarAvatarProfissional } = await import(
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
    expect(enviarAvatarPublico).toHaveBeenCalledWith(contas.dono.id, expect.any(File))
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
