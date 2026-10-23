import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  cmsGruposNavegacao,
  cmsItensNavegacao,
  cmsPaginas,
  eventosAuditoria,
} from '@/db/schema'
import { recursoDaRota, rotaExigeGestor } from '@/features/admin/constants/recursos'
import {
  adicionarItemNavegacaoCms,
  alterarAtivacaoGrupoNavegacaoCms,
  criarGrupoNavegacaoCms,
  editarGrupoNavegacaoCms,
  editarItemNavegacaoCms,
  moverItemNavegacaoCms,
  removerItemNavegacaoCms,
  reordenarGruposNavegacaoCms,
  reordenarItensNavegacaoCms,
} from '@/features/cms/actions/navegacao'
import {
  arquivarPaginaCms,
  criarPaginaCms,
  despublicarPaginaCms,
  editarPaginaCms,
  publicarPaginaCms,
} from '@/features/cms/actions/paginas'
import { CONTEUDO_PAGINA_VAZIO } from '@/features/cms/nucleo'
import {
  buscarPaginaCmsGestao,
  listarGruposNavegacaoCmsGestao,
  listarPaginasAssociaveisCmsGestao,
  listarPaginasCmsGestao,
} from '@/features/cms/queries/gestao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Só o Gestor da Plataforma administra o CMS.
 *
 * Cada action e cada query administrativa é chamada direto — como faria quem
 * pulasse a interface — por Profissional, Colaborador, Cliente e anônimo, e
 * precisa recusar sem gravar nada. O Gestor percorre o ciclo inteiro, e cada
 * mutação dele deixa o evento de auditoria correspondente.
 */

const SUFIXO = '@cms.teste'
const PREFIXO_SLUG = 'teste-cms-'
const PREFIXO_GRUPO = 'teste-cms-'
const UUID_QUALQUER = '7f1c1d3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f'

type Chave = 'gestor' | 'profissional' | 'colaborador' | 'cliente'
let contas: Record<Chave, ContaDeTeste>

async function limparCms() {
  const grupos = await db
    .select({ id: cmsGruposNavegacao.id })
    .from(cmsGruposNavegacao)
    .where(like(cmsGruposNavegacao.identificador, `${PREFIXO_GRUPO}%`))
  // Itens saem por cascata do grupo; páginas depois, porque itens as referenciam.
  if (grupos.length)
    await db.delete(cmsGruposNavegacao).where(
      inArray(
        cmsGruposNavegacao.id,
        grupos.map(({ id }) => id),
      ),
    )
  await db.delete(cmsPaginas).where(like(cmsPaginas.slug, `${PREFIXO_SLUG}%`))
  if (contas)
    await db
      .delete(eventosAuditoria)
      .where(
        and(
          like(eventosAuditoria.acao, 'cms_%'),
          inArray(
            eventosAuditoria.autorId,
            Object.values(contas).map(({ id }) => id),
          ),
        ),
      )
}

function pagina(slug: string, extra: Record<string, unknown> = {}) {
  return {
    titulo: `Página ${slug}`,
    slug: `${PREFIXO_SLUG}${slug}`,
    conteudo: CONTEUDO_PAGINA_VAZIO,
    ...extra,
  }
}

async function eventosDo(registroAfetado: string) {
  return db
    .select({ acao: eventosAuditoria.acao, origem: eventosAuditoria.origem, metadados: eventosAuditoria.metadados })
    .from(eventosAuditoria)
    .where(eq(eventosAuditoria.registroAfetado, registroAfetado))
    .orderBy(eventosAuditoria.createdAt)
}

beforeAll(async () => {
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      gestor: { perfil: 'gestor_vincis' },
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      colaborador: { perfil: 'colaborador', prestador: 'colaborador' },
      cliente: { perfil: 'cliente' },
    },
    '119440',
  )
  await limparCms()
})

afterAll(async () => {
  sairDaSessao()
  await limparCms()
  await limparContas(SUFIXO)
})

describe('recurso cms na área administrativa', () => {
  it('é exclusivo do Gestor em /admin/cms e nas rotas filhas', () => {
    expect(recursoDaRota('/admin/cms')?.exclusivoDoGestor).toBe(true)
    expect(rotaExigeGestor('/admin/cms')).toBe(true)
    expect(rotaExigeGestor('/admin/cms/paginas/qualquer')).toBe(true)
    expect(rotaExigeGestor('/admin/cms-teste')).toBe(false)
  })

  it('o proxy libera só o Gestor (mesma regra que ele consulta)', async () => {
    expect(ehGestorPlataforma(await resolverAcessoUsuario(contas.gestor.id))).toBe(true)
    for (const chave of ['profissional', 'colaborador', 'cliente'] as const)
      expect(ehGestorPlataforma(await resolverAcessoUsuario(contas[chave].id)), chave).toBe(false)
  })
})

describe('quem não é Gestor não administra o CMS', () => {
  const NAO_GESTORES = ['profissional', 'colaborador', 'cliente', 'anonimo'] as const

  /** Todas as operações administrativas, com entradas válidas. */
  const OPERACOES: Array<[string, () => Promise<unknown>]> = [
    ['criarPaginaCms', () => criarPaginaCms(pagina('intrusa'))],
    ['editarPaginaCms', () => editarPaginaCms({ paginaId: UUID_QUALQUER, ...pagina('intrusa') })],
    ['publicarPaginaCms', () => publicarPaginaCms({ paginaId: UUID_QUALQUER })],
    ['despublicarPaginaCms', () => despublicarPaginaCms({ paginaId: UUID_QUALQUER })],
    ['arquivarPaginaCms', () => arquivarPaginaCms({ paginaId: UUID_QUALQUER })],
    [
      'criarGrupoNavegacaoCms',
      () =>
        criarGrupoNavegacaoCms({
          nome: 'Intruso',
          tituloPublico: 'Intruso',
          identificador: `${PREFIXO_GRUPO}intruso`,
        }),
    ],
    [
      'editarGrupoNavegacaoCms',
      () =>
        editarGrupoNavegacaoCms({
          grupoId: UUID_QUALQUER,
          nome: 'Intruso',
          tituloPublico: 'Intruso',
          identificador: `${PREFIXO_GRUPO}intruso`,
        }),
    ],
    [
      'alterarAtivacaoGrupoNavegacaoCms',
      () => alterarAtivacaoGrupoNavegacaoCms({ grupoId: UUID_QUALQUER, ativo: true }),
    ],
    [
      'adicionarItemNavegacaoCms',
      () => adicionarItemNavegacaoCms({ grupoId: UUID_QUALQUER, paginaId: UUID_QUALQUER }),
    ],
    [
      'editarItemNavegacaoCms',
      () => editarItemNavegacaoCms({ itemId: UUID_QUALQUER, texto: null, ativo: false }),
    ],
    [
      'criarGrupoNavegacaoCms (cabeçalho)',
      () =>
        criarGrupoNavegacaoCms({
          nome: 'Intruso',
          tituloPublico: 'Intruso',
          identificador: `${PREFIXO_GRUPO}intruso`,
          local: 'cabecalho',
        }),
    ],
    [
      'adicionarItemNavegacaoCms (agrupador)',
      () => adicionarItemNavegacaoCms({ grupoId: UUID_QUALQUER, texto: 'Serviços' }),
    ],
    [
      'moverItemNavegacaoCms',
      () => moverItemNavegacaoCms({ itemId: UUID_QUALQUER, paiId: UUID_QUALQUER }),
    ],
    ['removerItemNavegacaoCms', () => removerItemNavegacaoCms({ itemId: UUID_QUALQUER })],
    [
      'reordenarItensNavegacaoCms (submenu)',
      () =>
        reordenarItensNavegacaoCms({
          grupoId: UUID_QUALQUER,
          paiId: UUID_QUALQUER,
          idsOrdenados: [UUID_QUALQUER],
        }),
    ],
    [
      'reordenarGruposNavegacaoCms',
      () => reordenarGruposNavegacaoCms({ local: 'rodape', idsOrdenados: [UUID_QUALQUER] }),
    ],
    [
      'reordenarItensNavegacaoCms',
      () => reordenarItensNavegacaoCms({ grupoId: UUID_QUALQUER, idsOrdenados: [UUID_QUALQUER] }),
    ],
  ]

  for (const quem of NAO_GESTORES) {
    it(`${quem}: toda action recusa, toda query nega e nada é gravado`, async () => {
      entrarComo(quem === 'anonimo' ? null : contas[quem].token)

      for (const [nome, operacao] of OPERACOES)
        expect(await operacao(), `${quem} → ${nome}`).toEqual(SEM_AUTORIZACAO)

      expect(await listarPaginasCmsGestao()).toBeNull()
      expect(await listarGruposNavegacaoCmsGestao()).toBeNull()
      expect(await listarPaginasAssociaveisCmsGestao()).toBeNull()
      expect(await buscarPaginaCmsGestao(UUID_QUALQUER)).toBeNull()

      const [paginas, grupos] = await Promise.all([
        db.select().from(cmsPaginas).where(eq(cmsPaginas.slug, `${PREFIXO_SLUG}intrusa`)),
        db
          .select()
          .from(cmsGruposNavegacao)
          .where(eq(cmsGruposNavegacao.identificador, `${PREFIXO_GRUPO}intruso`)),
      ])
      expect(paginas).toEqual([])
      expect(grupos).toEqual([])
    })
  }

  it('a recusa a um não Gestor vale mesmo para página real do Gestor', async () => {
    entrarComo(contas.gestor.token)
    const criada = await criarPaginaCms(pagina('alvo'))
    if (!criada.sucesso) throw new Error(criada.mensagem)

    for (const quem of ['profissional', 'colaborador', 'cliente'] as const) {
      entrarComo(contas[quem].token)
      // Nem o conteúdo do rascunho alheio pode ser lido pela query da Gestão.
      expect(await buscarPaginaCmsGestao(criada.dados!.id), quem).toBeNull()
      expect(
        await editarPaginaCms({ paginaId: criada.dados!.id, ...pagina('alvo', { titulo: 'Invadida' }) }),
        quem,
      ).toEqual(SEM_AUTORIZACAO)
    }
    entrarComo(null)
    expect(await despublicarPaginaCms({ paginaId: criada.dados!.id })).toEqual(SEM_AUTORIZACAO)

    entrarComo(contas.profissional.token)
    expect(await publicarPaginaCms({ paginaId: criada.dados!.id })).toEqual(SEM_AUTORIZACAO)
    expect(await arquivarPaginaCms({ paginaId: criada.dados!.id })).toEqual(SEM_AUTORIZACAO)

    const [depois] = await db
      .select({ status: cmsPaginas.status, titulo: cmsPaginas.titulo })
      .from(cmsPaginas)
      .where(eq(cmsPaginas.id, criada.dados!.id))
    expect(depois.status).toBe('rascunho')
    expect(depois.titulo).toBe('Página alvo')
  })
})

describe('o Gestor administra o CMS', () => {
  it('percorre o ciclo da página, com auditoria a cada passo', async () => {
    entrarComo(contas.gestor.token)

    const criada = await criarPaginaCms(pagina('sobre', { tituloSeo: 'Sobre a plataforma' }))
    expect(criada.sucesso).toBe(true)
    const paginaId = criada.dados!.id

    const [gravada] = await db.select().from(cmsPaginas).where(eq(cmsPaginas.id, paginaId))
    expect(gravada.status).toBe('rascunho')
    expect(gravada.autorId).toBe(contas.gestor.id)
    expect(gravada.publicadaEm).toBeNull()

    expect(
      (await editarPaginaCms({ paginaId, ...pagina('sobre-nos', { titulo: 'Sobre nós' }) })).sucesso,
    ).toBe(true)
    expect((await publicarPaginaCms({ paginaId })).sucesso).toBe(true)
    const [publicada] = await db.select().from(cmsPaginas).where(eq(cmsPaginas.id, paginaId))
    expect(publicada.status).toBe('publicada')
    expect(publicada.slug).toBe(`${PREFIXO_SLUG}sobre-nos`)
    expect(publicada.publicadaEm).toBeInstanceOf(Date)

    // Movimento fora de ordem é recusado sem mudar nada.
    expect((await publicarPaginaCms({ paginaId })).sucesso).toBe(false)

    expect((await despublicarPaginaCms({ paginaId })).sucesso).toBe(true)
    expect((await arquivarPaginaCms({ paginaId })).sucesso).toBe(true)

    // Arquivada não volta a ser editada nem publicada, e o registro continua lá.
    expect((await editarPaginaCms({ paginaId, ...pagina('sobre-nos') })).sucesso).toBe(false)
    expect((await publicarPaginaCms({ paginaId })).sucesso).toBe(false)
    const [arquivada] = await db.select().from(cmsPaginas).where(eq(cmsPaginas.id, paginaId))
    expect(arquivada.status).toBe('arquivada')
    expect(arquivada.publicadaEm).toEqual(publicada.publicadaEm)

    const eventos = await eventosDo(paginaId)
    expect(eventos.map(({ acao }) => acao)).toEqual([
      'cms_pagina_criada',
      'cms_pagina_editada',
      'cms_pagina_publicada',
      'cms_pagina_despublicada',
      'cms_pagina_arquivada',
    ])
    expect(eventos.every(({ origem }) => origem === 'gestao_vincis')).toBe(true)
    // A trilha não carrega o conteúdo da página.
    expect(JSON.stringify(eventos)).not.toContain('"doc"')

    // O slug de página arquivada continua reservado.
    const reuso = await criarPaginaCms(pagina('sobre-nos'))
    expect(reuso).toMatchObject({ sucesso: false, campo: 'slug' })
  })

  it('recusa entrada inválida no servidor, mesmo vinda do Gestor', async () => {
    entrarComo(contas.gestor.token)
    expect(await criarPaginaCms(pagina('x', { slug: 'admin' }))).toMatchObject({
      sucesso: false,
      campo: 'slug',
    })
    expect(
      (await criarPaginaCms(pagina('x', { conteudo: { type: 'doc', content: [{ type: 'script' }] } })))
        .sucesso,
    ).toBe(false)
    expect((await publicarPaginaCms({ paginaId: 'nao-e-uuid' })).sucesso).toBe(false)
  })

  it('monta o rodapé: grupos, itens, ativação e ordem', async () => {
    entrarComo(contas.gestor.token)

    const institucional = await criarGrupoNavegacaoCms({
      nome: 'Institucional',
      tituloPublico: 'A Vincis',
      identificador: `${PREFIXO_GRUPO}institucional`,
    })
    const legal = await criarGrupoNavegacaoCms({
      nome: 'Legal',
      tituloPublico: 'Legal',
      identificador: `${PREFIXO_GRUPO}legal`,
      ativo: true,
    })
    expect(institucional.sucesso && legal.sucesso).toBe(true)
    const grupoId = institucional.dados!.id

    expect(
      await criarGrupoNavegacaoCms({
        nome: 'Repetido',
        tituloPublico: 'Repetido',
        identificador: `${PREFIXO_GRUPO}legal`,
      }),
    ).toMatchObject({ sucesso: false, campo: 'identificador' })

    const termos = await criarPaginaCms(pagina('termos'))
    const privacidade = await criarPaginaCms(pagina('privacidade'))
    const antiga = await criarPaginaCms(pagina('antiga'))
    await arquivarPaginaCms({ paginaId: antiga.dados!.id })

    const itemTermos = await adicionarItemNavegacaoCms({ grupoId, paginaId: termos.dados!.id })
    const itemPrivacidade = await adicionarItemNavegacaoCms({
      grupoId,
      paginaId: privacidade.dados!.id,
      texto: 'Privacidade',
    })
    expect(itemTermos.sucesso && itemPrivacidade.sucesso).toBe(true)
    expect(
      (await adicionarItemNavegacaoCms({ grupoId, paginaId: termos.dados!.id })).sucesso,
    ).toBe(false)
    expect(
      (await adicionarItemNavegacaoCms({ grupoId, paginaId: antiga.dados!.id })).sucesso,
    ).toBe(false)

    expect(
      (await editarItemNavegacaoCms({ itemId: itemTermos.dados!.id, texto: 'Termos de uso', ativo: false }))
        .sucesso,
    ).toBe(true)
    expect((await alterarAtivacaoGrupoNavegacaoCms({ grupoId, ativo: true })).sucesso).toBe(true)

    // Ordem parcial é recusada; a completa é aceita.
    expect(
      (await reordenarItensNavegacaoCms({ grupoId, idsOrdenados: [itemPrivacidade.dados!.id] }))
        .sucesso,
    ).toBe(false)
    expect(
      (
        await reordenarItensNavegacaoCms({
          grupoId,
          idsOrdenados: [itemPrivacidade.dados!.id, itemTermos.dados!.id],
        })
      ).sucesso,
    ).toBe(true)

    const grupos = await listarGruposNavegacaoCmsGestao()
    const montado = grupos?.find(({ id }) => id === grupoId)
    expect(montado?.ativo).toBe(true)
    expect(montado?.itens.map(({ texto, ativo }) => [texto, ativo])).toEqual([
      ['Privacidade', true],
      ['Termos de uso', false],
    ])

    const itens = await db
      .select({ id: cmsItensNavegacao.id })
      .from(cmsItensNavegacao)
      .where(eq(cmsItensNavegacao.grupoId, grupoId))
    expect(itens).toHaveLength(2)

    const acoes = (await eventosDo(grupoId)).map(({ metadados }) => (metadados as { operacao: string }).operacao)
    expect(acoes).toEqual(['grupo_criado', 'grupo_ativado', 'itens_reordenados'])
  })

  it('monta o cabeçalho: agrupador, submenu, mover, ordenar e remover com segurança', async () => {
    entrarComo(contas.gestor.token)
    const menu = await criarGrupoNavegacaoCms({
      nome: 'Menu principal',
      tituloPublico: 'Menu',
      identificador: `${PREFIXO_GRUPO}menu`,
      local: 'cabecalho',
      ativo: true,
    })
    expect(menu.sucesso).toBe(true)
    const grupoId = menu.dados!.id

    const advocacia = await criarPaginaCms(pagina('advocacia'))
    const contabilidade = await criarPaginaCms(pagina('contabilidade'))
    const sobre = await criarPaginaCms(pagina('sobre-menu'))

    const servicos = await adicionarItemNavegacaoCms({ grupoId, texto: 'Serviços' })
    expect(servicos.sucesso).toBe(true)
    const servicosId = servicos.dados!.id
    const itemAdv = await adicionarItemNavegacaoCms({ grupoId, paginaId: advocacia.dados!.id, paiId: servicosId })
    const itemSobre = await adicionarItemNavegacaoCms({ grupoId, paginaId: sobre.dados!.id })
    const itemContab = await adicionarItemNavegacaoCms({ grupoId, paginaId: contabilidade.dados!.id })
    expect(itemAdv.sucesso && itemSobre.sucesso && itemContab.sucesso).toBe(true)

    // Agrupador sem nome é recusado; filho de link é recusado; 3º nível é recusado.
    expect((await adicionarItemNavegacaoCms({ grupoId })).sucesso).toBe(false)
    expect(
      (await moverItemNavegacaoCms({ itemId: itemContab.dados!.id, paiId: itemSobre.dados!.id })).mensagem,
    ).toMatch(/agrupador/)
    const outro = await adicionarItemNavegacaoCms({ grupoId, texto: 'Outro' })
    expect(
      (await moverItemNavegacaoCms({ itemId: servicosId, paiId: outro.dados!.id })).mensagem,
    ).toMatch(/um nível/)
    expect((await moverItemNavegacaoCms({ itemId: servicosId, paiId: servicosId })).sucesso).toBe(false)

    // Move Contabilidade para dentro de Serviços e põe antes de Advocacia.
    expect(
      (await moverItemNavegacaoCms({ itemId: itemContab.dados!.id, paiId: servicosId })).sucesso,
    ).toBe(true)
    expect(
      (
        await reordenarItensNavegacaoCms({
          grupoId,
          paiId: servicosId,
          idsOrdenados: [itemContab.dados!.id, itemAdv.dados!.id],
        })
      ).sucesso,
    ).toBe(true)
    // A ordem dos filhos é independente da ordem das raízes.
    expect(
      (
        await reordenarItensNavegacaoCms({
          grupoId,
          idsOrdenados: [itemSobre.dados!.id, servicosId, outro.dados!.id],
        })
      ).sucesso,
    ).toBe(true)
    // Ordem parcial das raízes (falta um) é recusada.
    expect(
      (await reordenarItensNavegacaoCms({ grupoId, idsOrdenados: [itemSobre.dados!.id, servicosId] }))
        .sucesso,
    ).toBe(false)

    // Agrupador com filhos não é removido; o vazio é, e a página nunca é tocada.
    expect((await removerItemNavegacaoCms({ itemId: servicosId })).mensagem).toMatch(/submenu/)
    expect((await removerItemNavegacaoCms({ itemId: outro.dados!.id })).sucesso).toBe(true)
    expect((await removerItemNavegacaoCms({ itemId: itemSobre.dados!.id })).sucesso).toBe(true)
    const [sobreDepois] = await db.select().from(cmsPaginas).where(eq(cmsPaginas.id, sobre.dados!.id))
    expect(sobreDepois).toBeDefined()

    const grupos = await listarGruposNavegacaoCmsGestao()
    const montado = grupos!.find(({ id }) => id === grupoId)!
    expect(montado.local).toBe('cabecalho')
    expect(montado.itens.map(({ id, paiId }) => [id, paiId])).toEqual(
      expect.arrayContaining([
        [servicosId, null],
        [itemContab.dados!.id, servicosId],
        [itemAdv.dados!.id, servicosId],
      ]),
    )
    expect(montado.itens).toHaveLength(3)
    const filhos = montado.itens.filter(({ paiId }) => paiId === servicosId).map(({ id }) => id)
    expect(filhos).toEqual([itemContab.dados!.id, itemAdv.dados!.id])

    // Rodapé continua plano: agrupador recusado lá.
    const rodape = await criarGrupoNavegacaoCms({
      nome: 'Rodapé plano',
      tituloPublico: 'Rodapé plano',
      identificador: `${PREFIXO_GRUPO}rodape-plano`,
    })
    expect(
      (await adicionarItemNavegacaoCms({ grupoId: rodape.dados!.id, texto: 'Agrupador' })).mensagem,
    ).toMatch(/cabeçalho/)

    // Toda mudança da árvore ficou na trilha.
    const operacoes = (
      await db
        .select({ metadados: eventosAuditoria.metadados })
        .from(eventosAuditoria)
        .where(eq(eventosAuditoria.acao, 'cms_navegacao_alterada'))
    ).map(({ metadados }) => (metadados as { operacao: string }).operacao)
    for (const operacao of ['agrupador_adicionado', 'item_movido', 'itens_reordenados', 'item_removido'])
      expect(operacoes, operacao).toContain(operacao)
  })

  it('lista páginas com paginação e busca, sem o conteúdo', async () => {
    entrarComo(contas.gestor.token)
    const listagem = await listarPaginasCmsGestao({ busca: PREFIXO_SLUG, porPagina: 2 })
    expect(listagem).not.toBeNull()
    expect(listagem!.itens).toHaveLength(2)
    expect(listagem!.total).toBeGreaterThanOrEqual(4)
    expect(listagem!.itens[0]).not.toHaveProperty('conteudo')
    // `_` e `%` são texto: buscar "%" não devolve tudo.
    expect((await listarPaginasCmsGestao({ busca: '%' }))!.total).toBe(0)
  })
})
