import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  empresaMembros,
  empresas,
  perfis,
  perfisProfissionais,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { resolverContextoTenant } from '@/features/empresas/lib/resolver-contexto-tenant'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'

const SUFIXO = '@contexto.teste'

type Caso =
  | 'profIndividual'
  | 'profSemModalidade'
  | 'profEscritorioSemEmpresa'
  | 'proprietario'
  | 'profDuasEquipes'
  | 'colabSozinho'
  | 'colabEmEquipe'
  | 'gestor'
  | 'cliente'

const PERFIL_DE: Record<Caso, string> = {
  profIndividual: 'profissional',
  profSemModalidade: 'profissional',
  profEscritorioSemEmpresa: 'profissional',
  proprietario: 'profissional',
  profDuasEquipes: 'profissional',
  colabSozinho: 'colaborador',
  colabEmEquipe: 'colaborador',
  gestor: 'gestor_vincis',
  cliente: 'cliente',
}

const MODALIDADE: Partial<Record<Caso, string | null>> = {
  profIndividual: 'individual',
  profSemModalidade: '',
  profEscritorioSemEmpresa: 'escritorio',
  proprietario: 'escritorio',
  profDuasEquipes: 'individual',
}

let ids: Record<Caso, string>
let empresaA = ''
let empresaB = ''

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const uids = alvos.map(({ id }) => id)
  if (uids.length) {
    await db.delete(empresaMembros).where(inArray(empresaMembros.usuarioId, uids))
    await db
      .update(usuarios)
      .set({ empresaId: null })
      .where(inArray(usuarios.id, uids))
    await db
      .delete(perfisProfissionais)
      .where(inArray(perfisProfissionais.usuarioId, uids))
    await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, uids))
    await db.delete(usuarios).where(inArray(usuarios.id, uids))
  }
  await db.delete(empresas).where(like(empresas.nome, 'Contexto Teste%'))
}

beforeEach(async () => {
  await limpar()
  const criados = {} as Record<Caso, string>
  let i = 0

  for (const caso of Object.keys(PERFIL_DE) as Caso[]) {
    const nomePerfil = PERFIL_DE[caso]
    await db.insert(perfis).values({ nome: nomePerfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, nomePerfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Contexto ${caso}`,
        email: `${caso}${SUFIXO}`,
        whatsapp: `1192000${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    const ehPrestador = nomePerfil === 'profissional' || nomePerfil === 'colaborador'
    if (ehPrestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: nomePerfil === 'colaborador' ? 'colaborador' : 'profissional',
        tipoProfissional:
          nomePerfil === 'colaborador' ? 'colaborador' : 'contabilidade',
        apresentacao: 'Conta de teste de contexto.',
        nomeAtuacao: `Contexto ${caso}`,
        modalidadeAtuacao: MODALIDADE[caso] ?? 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${caso}${SUFIXO}`,
        statusAnalise: nomePerfil === 'colaborador' ? 'ativo' : 'aprovado',
      })
    }
    criados[caso] = usuario.id
    i += 1
  }

  const [a] = await db
    .insert(empresas)
    .values({
      nome: 'Contexto Teste Alfa',
      tipo: 'prestadora',
      segmento: 'contabilidade',
      status: 'ativo',
    })
    .returning({ id: empresas.id })
  const [b] = await db
    .insert(empresas)
    .values({
      nome: 'Contexto Teste Beta',
      tipo: 'prestadora',
      segmento: 'contabilidade',
      status: 'ativo',
    })
    .returning({ id: empresas.id })
  empresaA = a.id
  empresaB = b.id

  await db.insert(empresaMembros).values([
    { empresaId: empresaA, usuarioId: criados.proprietario, funcao: 'proprietario', status: 'ativo' },
    { empresaId: empresaA, usuarioId: criados.profDuasEquipes, funcao: 'profissional', status: 'ativo' },
    { empresaId: empresaB, usuarioId: criados.profDuasEquipes, funcao: 'profissional', status: 'ativo' },
    { empresaId: empresaA, usuarioId: criados.colabEmEquipe, funcao: 'colaborador', status: 'ativo' },
  ])
  await db
    .update(usuarios)
    .set({ empresaId: empresaA })
    .where(eq(usuarios.id, criados.proprietario))

  ids = criados
})

afterAll(async () => {
  await limpar()
})

/** Estados em que o painel abre. Qualquer outro trava a tela. */
const ABRE_ADMIN = ['ativo', 'perfil_profissional', 'colaborador']

describe('contexto do painel', () => {
  it('Profissional individual abre sem empresa', async () => {
    const r = await resolverContextoTenant(ids.profIndividual)
    expect(r.estado).toBe('perfil_profissional')
    expect(ABRE_ADMIN).toContain(r.estado)
    expect(r.contexto).toBeUndefined()
  })

  it('Profissional sem modalidade declarada também abre', async () => {
    const r = await resolverContextoTenant(ids.profSemModalidade)
    expect(r.estado).toBe('perfil_profissional')
  })

  it('Colaborador sozinho abre sem empresa', async () => {
    const r = await resolverContextoTenant(ids.colabSozinho)
    expect(r.estado).toBe('colaborador')
    expect(r.contexto).toBeUndefined()
  })

  it('Proprietário abre no contexto do próprio escritório', async () => {
    const r = await resolverContextoTenant(ids.proprietario)
    expect(r.estado).toBe('ativo')
    expect(r.contexto?.empresaId).toBe(empresaA)
  })

  it('Colaborador em equipe abre no contexto daquele escritório', async () => {
    const r = await resolverContextoTenant(ids.colabEmEquipe)
    expect(r.estado).toBe('ativo')
    expect(r.contexto?.empresaId).toBe(empresaA)
  })

  it('participante de duas equipes abre — não fica preso em seleção', async () => {
    const r = await resolverContextoTenant(ids.profDuasEquipes)
    expect(r.sucesso).toBe(true)
    expect(ABRE_ADMIN).toContain(r.estado)
    expect(r.estado).not.toBe('selecao_necessaria')
  })

  it('a escolha entre duas equipes é determinística', async () => {
    const primeira = await resolverContextoTenant(ids.profDuasEquipes)
    const segunda = await resolverContextoTenant(ids.profDuasEquipes)
    expect(primeira.contexto?.empresaId).toBe(segunda.contexto?.empresaId)
  })

  it('honra o escritório solicitado quando há vínculo', async () => {
    const r = await resolverContextoTenant(ids.profDuasEquipes, empresaB)
    expect(r.estado).toBe('ativo')
    expect(r.contexto?.empresaId).toBe(empresaB)
  })

  it('ignora escritório solicitado sem vínculo', async () => {
    const r = await resolverContextoTenant(ids.profIndividual, empresaA)
    expect(r.contexto?.empresaId).not.toBe(empresaA)
  })

  it('Profissional que escolheu escritório e ainda não criou segue ao onboarding', async () => {
    const r = await resolverContextoTenant(ids.profEscritorioSemEmpresa)
    expect(r.estado).toBe('sem_tenant')
  })

  it('nenhum caso devolve selecao_necessaria', async () => {
    for (const caso of Object.keys(PERFIL_DE) as Caso[]) {
      const r = await resolverContextoTenant(ids[caso])
      expect(r.estado, `${caso}`).not.toBe('selecao_necessaria')
    }
  })
})

describe('nada fictício é criado', () => {
  it('resolver contexto não cria empresa nem membership', async () => {
    const empresasAntes = await db.select({ id: empresas.id }).from(empresas)
    const membrosAntes = await db.select({ id: empresaMembros.id }).from(empresaMembros)

    for (const caso of ['profIndividual', 'colabSozinho', 'profSemModalidade'] as const) {
      await resolverContextoTenant(ids[caso])
    }

    expect(await db.select({ id: empresas.id }).from(empresas)).toHaveLength(
      empresasAntes.length,
    )
    expect(
      await db.select({ id: empresaMembros.id }).from(empresaMembros),
    ).toHaveLength(membrosAntes.length)
  })

  it('Colaborador sozinho continua sem vínculo nenhum', async () => {
    await resolverContextoTenant(ids.colabSozinho)
    const vinculos = await db
      .select({ id: empresaMembros.id })
      .from(empresaMembros)
      .where(eq(empresaMembros.usuarioId, ids.colabSozinho))
    expect(vinculos).toEqual([])
  })
})

describe('roteamento preservado', () => {
  it('prestadores vão para /admin', async () => {
    for (const caso of [
      'profIndividual',
      'profDuasEquipes',
      'proprietario',
      'colabSozinho',
      'colabEmEquipe',
    ] as const) {
      expect((await resolverAcessoUsuario(ids[caso]))?.destino, caso).toBe('/admin')
    }
  })

  it('Gestor continua exclusivo de /gestao e Cliente de /cliente', async () => {
    expect((await resolverAcessoUsuario(ids.gestor))?.destino).toBe('/gestao')
    expect((await resolverAcessoUsuario(ids.cliente))?.destino).toBe('/cliente')
  })
})
