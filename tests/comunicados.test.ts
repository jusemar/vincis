import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import { comunicados } from '@/db/schema'
import {
  arquivarComunicado,
  atualizarComunicado,
  criarComunicado,
  despublicarComunicado,
  publicarComunicado,
} from '@/features/comunicados/actions/comunicados'
import { audienciasVisiveis } from '@/features/comunicados/lib/audiencia'
import {
  listarComunicadosDaGestao,
  listarComunicadosDoMural,
} from '@/features/comunicados/queries/listar-comunicados'
import {
  criarContas,
  limparContas,
  type ContaDeTeste,
} from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@comunicados.teste'
const MARCA = '[DEV]'

type Chave = 'gestor' | 'profissional' | 'colaborador' | 'cliente'
let contas: Record<Chave, ContaDeTeste>

async function limparComunicados() {
  await db.delete(comunicados).where(like(comunicados.titulo, `${MARCA}%`))
}

beforeEach(async () => {
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      gestor: { perfil: 'gestor_vincis' },
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      colaborador: { perfil: 'colaborador', prestador: 'colaborador' },
      cliente: { perfil: 'cliente' },
    },
    '119480',
  )
  await limparComunicados()
})

afterAll(async () => {
  sairDaSessao()
  await limparComunicados()
  await limparContas(SUFIXO)
})

/** Os três comunicados de desenvolvimento pedidos para a validação manual. */
const DE_DESENVOLVIMENTO = [
  {
    tipo: 'novidade' as const,
    titulo: `${MARCA} Novo recurso disponível: gestão de protocolos`,
    resumo:
      'Comunicado de teste criado durante o desenvolvimento para validar o mural.',
    audiencia: 'todos' as const,
    publicadoEm: '',
  },
  {
    tipo: 'manutencao' as const,
    titulo: `${MARCA} Manutenção programada de homologação`,
    resumo: 'Texto de teste — nenhuma manutenção real está agendada.',
    audiencia: 'prestadores' as const,
    publicadoEm: '',
  },
  {
    tipo: 'sistema' as const,
    titulo: `${MARCA} Ambiente de desenvolvimento normalizado`,
    resumo: 'Registro de teste do tipo Sistema, usado para comparação visual.',
    audiencia: 'clientes' as const,
    publicadoEm: '',
  },
]

describe('só o Gestor da Vincis administra o mural', () => {
  it('Profissional, Colaborador e Cliente são recusados', async () => {
    for (const chave of ['profissional', 'colaborador', 'cliente'] as const) {
      entrarComo(contas[chave].token)
      const resultado = await criarComunicado(DE_DESENVOLVIMENTO[0], true)
      expect(resultado.sucesso).toBe(false)
    }
    // E nada foi gravado por nenhum deles.
    expect(await listarComunicadosDaGestao()).toEqual([])
  })

  it('sem sessão também é recusado', async () => {
    sairDaSessao()
    expect((await criarComunicado(DE_DESENVOLVIMENTO[0], true)).sucesso).toBe(
      false,
    )
  })

  it('publicar, despublicar e arquivar exigem gestor', async () => {
    entrarComo(contas.gestor.token)
    const criado = await criarComunicado(DE_DESENVOLVIMENTO[0], false)
    if (!criado.sucesso || !criado.dados) throw new Error(criado.mensagem)

    entrarComo(contas.profissional.token)
    const alvo = { comunicadoId: criado.dados.id }
    expect((await publicarComunicado(alvo)).sucesso).toBe(false)
    expect((await despublicarComunicado(alvo)).sucesso).toBe(false)
    expect((await arquivarComunicado(alvo)).sucesso).toBe(false)
    expect(
      (await atualizarComunicado({ ...alvo, ...DE_DESENVOLVIMENTO[1] })).sucesso,
    ).toBe(false)
  })
})

describe('ciclo de vida do comunicado', () => {
  it('rascunho não aparece no mural; publicado aparece', async () => {
    entrarComo(contas.gestor.token)
    const criado = await criarComunicado(DE_DESENVOLVIMENTO[0], false)
    if (!criado.sucesso || !criado.dados) throw new Error(criado.mensagem)

    expect(await listarComunicadosDoMural('profissional')).toEqual([])

    const publicado = await publicarComunicado({ comunicadoId: criado.dados.id })
    expect(publicado.sucesso).toBe(true)

    const mural = await listarComunicadosDoMural('profissional')
    expect(mural.map((c) => c.titulo)).toContain(DE_DESENVOLVIMENTO[0].titulo)
    // Publicar sem data carimba o instante do clique — sem isso o comunicado
    // ficaria publicado e invisível para sempre.
    expect(mural[0].publicadoEm).not.toBeNull()
  })

  it('despublicar tira do mural e arquivar também', async () => {
    entrarComo(contas.gestor.token)
    const criado = await criarComunicado(DE_DESENVOLVIMENTO[0], true)
    if (!criado.sucesso || !criado.dados) throw new Error(criado.mensagem)
    const alvo = { comunicadoId: criado.dados.id }

    expect(await listarComunicadosDoMural('profissional')).toHaveLength(1)

    await despublicarComunicado(alvo)
    expect(await listarComunicadosDoMural('profissional')).toEqual([])

    await publicarComunicado(alvo)
    await arquivarComunicado(alvo)
    expect(await listarComunicadosDoMural('profissional')).toEqual([])
    // Arquivado continua existindo para a gestão: o mural é uma vitrine, não
    // o arquivo morto.
    expect((await listarComunicadosDaGestao())[0].status).toBe('arquivado')
  })

  it('editar altera o que o mural mostra', async () => {
    entrarComo(contas.gestor.token)
    const criado = await criarComunicado(DE_DESENVOLVIMENTO[0], true)
    if (!criado.sucesso || !criado.dados) throw new Error(criado.mensagem)

    const alterado = await atualizarComunicado({
      comunicadoId: criado.dados.id,
      ...DE_DESENVOLVIMENTO[0],
      titulo: `${MARCA} Título corrigido`,
      publicadoEm: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(alterado.sucesso).toBe(true)

    const mural = await listarComunicadosDoMural('profissional')
    expect(mural[0].titulo).toBe(`${MARCA} Título corrigido`)
  })

  it('data futura só aparece quando a hora chega', async () => {
    entrarComo(contas.gestor.token)
    const daquiUmaHora = new Date(Date.now() + 3600_000)
    const criado = await criarComunicado(
      { ...DE_DESENVOLVIMENTO[1], publicadoEm: daquiUmaHora.toISOString() },
      true,
    )
    expect(criado.sucesso).toBe(true)

    expect(await listarComunicadosDoMural('profissional')).toEqual([])
    expect(
      await listarComunicadosDoMural(
        'profissional',
        new Date(Date.now() + 2 * 3600_000),
      ),
    ).toHaveLength(1)
  })

  it('texto vazio é recusado com mensagem', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await criarComunicado(
      { ...DE_DESENVOLVIMENTO[0], titulo: '' },
      true,
    )
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toBe('Escreva um título.')
  })
})

describe('audiência', () => {
  it('cada perfil recebe "todos" mais a audiência do próprio lado', () => {
    expect(audienciasVisiveis('profissional')).toEqual(['todos', 'prestadores'])
    expect(audienciasVisiveis('colaborador')).toEqual(['todos', 'prestadores'])
    expect(audienciasVisiveis('cliente')).toEqual(['todos', 'clientes'])
  })

  it('comunicado de Clientes não aparece para Prestador, e vice-versa', async () => {
    entrarComo(contas.gestor.token)
    for (const comunicado of DE_DESENVOLVIMENTO) {
      const criado = await criarComunicado(comunicado, true)
      if (!criado.sucesso) throw new Error(criado.mensagem)
    }

    const doPrestador = await listarComunicadosDoMural('profissional')
    const doCliente = await listarComunicadosDoMural('cliente')

    expect(doPrestador.map((c) => c.audiencia).sort()).toEqual([
      'prestadores',
      'todos',
    ])
    expect(doCliente.map((c) => c.audiencia).sort()).toEqual([
      'clientes',
      'todos',
    ])
    expect(doPrestador.map((c) => c.titulo)).not.toContain(
      DE_DESENVOLVIMENTO[2].titulo,
    )
  })

  it('os três comunicados de desenvolvimento persistem com tipo e autor', async () => {
    entrarComo(contas.gestor.token)
    for (const comunicado of DE_DESENVOLVIMENTO) {
      await criarComunicado(comunicado, true)
    }

    const gravados = await db
      .select()
      .from(comunicados)
      .where(like(comunicados.titulo, `${MARCA}%`))

    expect(gravados).toHaveLength(3)
    expect(gravados.map((c) => c.tipo).sort()).toEqual([
      'manutencao',
      'novidade',
      'sistema',
    ])
    for (const gravado of gravados) {
      expect(gravado.autorId).toBe(contas.gestor.id)
      expect(gravado.status).toBe('publicado')
      expect(gravado.publicadoEm).not.toBeNull()
    }
  })
})

describe('o mural é institucional', () => {
  it('nenhum comunicado carrega vínculo com Atendimento ou Cliente', async () => {
    entrarComo(contas.gestor.token)
    await criarComunicado(DE_DESENVOLVIMENTO[0], true)

    const [gravado] = await db
      .select()
      .from(comunicados)
      .where(eq(comunicados.status, 'publicado'))

    // A tabela não tem — e não deve ganhar — coluna de protocolo, cliente ou
    // atendimento: mural é a Vincis falando, não resumo de operação.
    expect(Object.keys(gravado)).toEqual([
      'id',
      'tipo',
      'titulo',
      'resumo',
      'audiencia',
      'status',
      'publicadoEm',
      'autorId',
      'createdAt',
      'updatedAt',
    ])
  })
})
