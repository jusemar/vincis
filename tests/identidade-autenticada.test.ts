import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, sessoesUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { gerarHash } from '@/features/usuarios/lib/hash-senha'
import { tipoPrestadorDoPerfil } from '@/features/usuarios/lib/tipos-pessoa'

const { POST: login } = await import('@/app/api/auth/login/route')
const { GET: sessao } = await import('@/app/api/auth/sessao/route')

/**
 * A identidade que chega ao navegador é a mesma nas duas portas.
 *
 * Este arquivo nasceu de um defeito real em homologação: o Gestor entrava, via
 * o painel profissional completo e **não** via o grupo "Gestão da Plataforma".
 * O servidor sabia que ele era Gestor o tempo todo; quem não contava era a
 * resposta do login, que montava o objeto do usuário à mão e tinha ficado sem
 * o campo `ehGestor` quando a capacidade foi separada do perfil. Recarregar a
 * página inteira consertava — porque aí quem respondia era `/api/auth/sessao`,
 * que tinha o campo. Um defeito que só aparece no primeiro acesso e some no
 * F5 é exatamente o tipo que passa despercebido.
 *
 * O que se cobra aqui é a igualdade das duas respostas, e não a presença de um
 * campo específico: é ela que impede a próxima capacidade de se perder no
 * mesmo lugar.
 */

const SUFIXO = '@identidade.teste'
const SENHA = 'Senha-De-Teste-123'

type Caso = 'gestorProfissional' | 'gestorPuro' | 'profissional' | 'cliente'

const PERFIS_DE: Record<Caso, string[]> = {
  // A conta real do Gestor: administra a plataforma e presta serviço.
  gestorProfissional: ['profissional', 'gestor_vincis'],
  gestorPuro: ['gestor_vincis'],
  profissional: ['profissional'],
  cliente: ['cliente'],
}

const ids = {} as Record<Caso, string>

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const uids = alvos.map(({ id }) => id)
  if (!uids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, uids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, uids))
  await db.delete(usuarios).where(inArray(usuarios.id, uids))
}

beforeAll(async () => {
  await limpar()
  const senhaHash = await gerarHash(SENHA)
  let indice = 0

  for (const caso of Object.keys(PERFIS_DE) as Caso[]) {
    const nomes = PERFIS_DE[caso]
    for (const nome of nomes) {
      await db.insert(perfis).values({ nome }).onConflictDoNothing()
    }
    const registros = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(inArray(perfis.nome, nomes))

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Identidade ${caso}`,
        email: `${caso}${SUFIXO}`,
        whatsapp: `1197700${String(indice).padStart(4, '0')}`,
        senhaHash,
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    for (const { id: perfilId } of registros) {
      await db.insert(usuariosPerfis).values({ usuarioId: usuario.id, perfilId })
    }
    ids[caso] = usuario.id
    indice += 1
  }
})

afterAll(limpar)

async function entrar(caso: Caso) {
  const resposta = await login(
    new Request('http://local/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOuWhatsapp: `${caso}${SUFIXO}`, senha: SENHA }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  )
  return (await resposta.json()) as {
    sucesso: boolean
    dados: { tokenSessao: string; usuario: Record<string, unknown> }
  }
}

async function restaurar(token: string) {
  const resposta = await sessao(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Request(`http://local/api/auth/sessao?token=${token}`) as any,
  )
  return (await resposta.json()) as {
    sucesso: boolean
    dados: { usuario: Record<string, unknown> }
  }
}

describe('a conta do Gestor que também é Profissional', () => {
  it('entra com as duas capacidades no mesmo objeto', async () => {
    const { sucesso, dados } = await entrar('gestorProfissional')
    expect(sucesso).toBe(true)

    // O que a barra lateral lê para desenhar os dois grupos de uma vez.
    expect(dados.usuario.perfilTipo).toBe('profissional')
    expect(dados.usuario.ehGestor).toBe(true)
    expect(tipoPrestadorDoPerfil(dados.usuario.perfilTipo as never)).toBe(
      'profissional',
    )
    expect(ehGestorPlataforma(dados.usuario as never)).toBe(true)
  })

  it('restaurar a sessão devolve exatamente a mesma identidade do login', async () => {
    const { dados } = await entrar('gestorProfissional')
    const restaurada = await restaurar(dados.tokenSessao)

    const { destino: _destino, ...doSessao } = restaurada.dados.usuario
    expect(doSessao).toEqual(dados.usuario)
  })
})

describe('as duas portas descrevem toda conta do mesmo jeito', () => {
  it.each(['gestorProfissional', 'gestorPuro', 'profissional', 'cliente'] as const)(
    '%s',
    async (caso) => {
      const { dados } = await entrar(caso)
      const restaurada = await restaurar(dados.tokenSessao)
      const { destino: _destino, ...doSessao } = restaurada.dados.usuario

      // Sem esta igualdade, uma capacidade nova volta a aparecer só depois do
      // primeiro F5 — que foi como o defeito original se escondeu.
      expect(doSessao).toEqual(dados.usuario)
      expect(Object.keys(dados.usuario).sort()).toEqual([
        'ehGestor',
        'email',
        'id',
        'nome',
        'perfilTipo',
        'status',
        'whatsapp',
      ])
    },
  )

  it('só quem administra a plataforma recebe a marca', async () => {
    for (const caso of ['gestorProfissional', 'gestorPuro'] as const) {
      expect((await entrar(caso)).dados.usuario.ehGestor, caso).toBe(true)
    }
    for (const caso of ['profissional', 'cliente'] as const) {
      expect((await entrar(caso)).dados.usuario.ehGestor, caso).toBe(false)
    }
  })

  it('nenhuma das respostas carrega segredo da conta', async () => {
    const { dados } = await entrar('gestorProfissional')
    for (const proibido of ['senha', 'senhaHash', 'tokenHash']) {
      expect(dados.usuario).not.toHaveProperty(proibido)
    }
  })
})
