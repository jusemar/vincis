import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, isNull, like } from 'drizzle-orm'
import { updateTag } from 'next/cache'
import { db } from '@/db/connection'
import { cmsCardsHome, cmsPaginas, eventosAuditoria } from '@/db/schema'
import {
  alterarAtivacaoCardHomeCms,
  criarCardHomeCms,
  editarCardHomeCms,
  excluirCardHomeCms,
  reordenarCardsHomeCms,
} from '@/features/cms/actions/cards-home'
import { arquivarPaginaCms, criarPaginaCms, publicarPaginaCms } from '@/features/cms/actions/paginas'
import { CONTEUDO_PAGINA_VAZIO, TAG_CMS_CARDS_HOME } from '@/features/cms/nucleo'
import { listarCardsHomeGestao, listarCardsHomePublicos } from '@/features/cms/queries/cards-home'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Cards da Home administrados pelo CMS.
 *
 * - só o Gestor cria, edita, ativa, reordena e exclui (cada action chamada
 *   direto, como faria quem pulasse a interface);
 * - destino fechado: página publicada do CMS ou rota do catálogo;
 * - estilo fechado: nada de classe CSS livre;
 * - a Home vê só os ativos, com destino no ar, em ordem determinística;
 * - exclusão lógica, com confirmação, só de card desativado;
 * - toda mutação deixa trilha de auditoria.
 *
 * Os três cards iniciais (migration 0083) existem no banco de teste; o teste
 * trabalha em volta deles e devolve a ordem original no fim.
 */

const SUFIXO = '@cards-home.teste'
const PREFIXO_SLUG = 'teste-cards-home-'
const PREFIXO_TITULO = 'Teste cards home'
const UUID_QUALQUER = '7f1c1d3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f'
const IDS_INICIAIS = [
  '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a01',
  '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a02',
  '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a03',
]

type Chave = 'gestor' | 'profissional' | 'colaborador' | 'cliente'
let contas: Record<Chave, ContaDeTeste>

function card(extra: Record<string, unknown> = {}) {
  return {
    selo: 'Novo',
    titulo: `${PREFIXO_TITULO}\nsegunda linha`,
    descricao: 'Descrição de teste.',
    textoBotao: 'Ver mais',
    estilo: 'esmeralda',
    destinoTipo: 'rota',
    rota: '/precos',
    ativo: true,
    ...extra,
  }
}

async function limpar() {
  const meus = await db
    .select({ id: cmsCardsHome.id })
    .from(cmsCardsHome)
    .where(like(cmsCardsHome.titulo, `${PREFIXO_TITULO}%`))
  if (meus.length) {
    await db.delete(eventosAuditoria).where(
      inArray(
        eventosAuditoria.registroAfetado,
        meus.map(({ id }) => id),
      ),
    )
    await db.delete(cmsCardsHome).where(
      inArray(
        cmsCardsHome.id,
        meus.map(({ id }) => id),
      ),
    )
  }
  await db.delete(cmsPaginas).where(like(cmsPaginas.slug, `${PREFIXO_SLUG}%`))
  if (contas)
    await db.delete(eventosAuditoria).where(
      and(
        like(eventosAuditoria.acao, 'cms_%'),
        inArray(
          eventosAuditoria.autorId,
          Object.values(contas).map(({ id }) => id),
        ),
      ),
    )
}

async function ordemAtual() {
  const linhas = await db
    .select({ id: cmsCardsHome.id })
    .from(cmsCardsHome)
    .where(isNull(cmsCardsHome.excluidoEm))
    .orderBy(cmsCardsHome.ordem, cmsCardsHome.createdAt, cmsCardsHome.id)
  return linhas.map(({ id }) => id)
}

async function comoVisitante<T>(leitura: () => Promise<T>) {
  entrarComo(null)
  return leitura()
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
    '119460',
  )
  await limpar()
})

afterAll(async () => {
  // Devolve os cards iniciais à ordem original, caso um teste tenha falhado no meio.
  const restantes = (await ordemAtual()).filter((id) => !IDS_INICIAIS.includes(id))
  entrarComo(contas.gestor.token)
  await reordenarCardsHomeCms({ idsOrdenados: [...IDS_INICIAIS, ...restantes] })
  sairDaSessao()
  await limpar()
  await limparContas(SUFIXO)
})

describe('cards iniciais (migration)', () => {
  it('os três cards atuais estão no banco, ativos, na ordem original e sem indicadores', async () => {
    const iniciais = await db
      .select()
      .from(cmsCardsHome)
      .where(inArray(cmsCardsHome.id, IDS_INICIAIS))
      .orderBy(cmsCardsHome.ordem)
    expect(iniciais.map(({ titulo, estilo, selo, textoBotao, rota, ativo }) => ({ titulo, estilo, selo, textoBotao, rota, ativo }))).toEqual([
      { titulo: 'Contabilidade\n100% digital', estilo: 'destaque', selo: 'Mais popular', textoBotao: 'Conhecer planos', rota: '/precos', ativo: true },
      { titulo: 'Assessoria legal\npara o seu negócio', estilo: 'esmeralda', selo: 'Consultoria jurídica', textoBotao: 'Ver serviços', rota: '/profissionais?area=advocacia', ativo: true },
      { titulo: 'Abra sua empresa\nem dias', estilo: 'ambar', selo: 'Abertura de empresa', textoBotao: 'Começar agora', rota: '/profissionais?orcamento=1', ativo: true },
    ])
    for (const linha of iniciais) expect(JSON.stringify(linha)).not.toMatch(/2\.4k|98%|24h/)
  })

  it('a Home recebe os três, com o destino de cada um', async () => {
    const publicos = await comoVisitante(() => listarCardsHomePublicos())
    const iniciais = publicos.filter(({ id }) => IDS_INICIAIS.includes(id))
    expect(iniciais.map(({ href }) => href)).toEqual([
      '/precos',
      '/profissionais?area=advocacia',
      '/profissionais?orcamento=1',
    ])
  })
})

describe('só o Gestor administra os cards', () => {
  const OPERACOES: Array<[string, () => Promise<unknown>]> = [
    ['criarCardHomeCms', () => criarCardHomeCms(card())],
    ['editarCardHomeCms', () => editarCardHomeCms({ cardId: UUID_QUALQUER, ...card() })],
    ['alterarAtivacaoCardHomeCms', () => alterarAtivacaoCardHomeCms({ cardId: IDS_INICIAIS[0], ativo: false })],
    ['excluirCardHomeCms', () => excluirCardHomeCms({ cardId: IDS_INICIAIS[0], confirmacao: true })],
    ['reordenarCardsHomeCms', () => reordenarCardsHomeCms({ idsOrdenados: [...IDS_INICIAIS].reverse() })],
  ]

  for (const quem of ['profissional', 'colaborador', 'cliente', 'anonimo'] as const) {
    it(`${quem} é recusado em todas as operações, sem gravar nada`, async () => {
      const antes = await ordemAtual()
      entrarComo(quem === 'anonimo' ? null : contas[quem].token)
      for (const [nome, operacao] of OPERACOES) expect(await operacao(), nome).toEqual(SEM_AUTORIZACAO)
      expect(await listarCardsHomeGestao()).toBeNull()
      expect(await ordemAtual()).toEqual(antes)
      const [iniciais] = await db.select({ ativo: cmsCardsHome.ativo }).from(cmsCardsHome).where(eq(cmsCardsHome.id, IDS_INICIAIS[0]))
      expect(iniciais.ativo).toBe(true)
    })
  }
})

describe('validação no servidor', () => {
  it('recusa estilo fora da lista (nada de classe CSS livre)', async () => {
    entrarComo(contas.gestor.token)
    const resultado = await criarCardHomeCms(card({ estilo: 'bg-red-500 text-white' }))
    expect(resultado).toMatchObject({ sucesso: false, campo: 'estilo' })
  })

  it('recusa rota fora do catálogo: externa, javascript: ou inventada', async () => {
    entrarComo(contas.gestor.token)
    for (const rota of ['https://exemplo.com', 'javascript:alert(1)', '/rota-que-nao-existe', '//evil.com'])
      expect(await criarCardHomeCms(card({ rota })), rota).toMatchObject({ sucesso: false, campo: 'rota' })
  })

  it('recusa título vazio, longo demais ou com linhas demais', async () => {
    entrarComo(contas.gestor.token)
    expect(await criarCardHomeCms(card({ titulo: '   ' }))).toMatchObject({ sucesso: false, campo: 'titulo' })
    expect(await criarCardHomeCms(card({ titulo: 'x'.repeat(81) }))).toMatchObject({ sucesso: false, campo: 'titulo' })
    expect(await criarCardHomeCms(card({ titulo: 'a\nb\nc\nd' }))).toMatchObject({ sucesso: false, campo: 'titulo' })
  })

  it('tira caracteres de controle e guarda o selo vazio como nulo', async () => {
    entrarComo(contas.gestor.token)
    const criado = await criarCardHomeCms(
      card({ selo: '  ', titulo: `${PREFIXO_TITULO}\u0007 limpo\r\nok`, ativo: false }),
    )
    expect(criado.sucesso).toBe(true)
    const [linha] = await db.select().from(cmsCardsHome).where(eq(cmsCardsHome.id, criado.dados!.id))
    expect(linha.selo).toBeNull()
    expect(linha.titulo).toBe(`${PREFIXO_TITULO} limpo\nok`)
  })

  it('página de destino precisa estar publicada', async () => {
    entrarComo(contas.gestor.token)
    const pagina = await criarPaginaCms({
      titulo: 'Rascunho de teste',
      slug: `${PREFIXO_SLUG}rascunho`,
      conteudo: CONTEUDO_PAGINA_VAZIO,
    })
    expect(pagina.sucesso).toBe(true)
    const resultado = await criarCardHomeCms(
      card({ destinoTipo: 'pagina', paginaId: pagina.dados!.id, rota: null }),
    )
    expect(resultado).toMatchObject({ sucesso: false, campo: 'paginaId' })
  })
})

describe('ciclo completo do Gestor', () => {
  it('cria, edita, troca destino, reordena, desativa, reativa e exclui — e a Home acompanha', async () => {
    entrarComo(contas.gestor.token)
    ;(updateTag as unknown as { mockClear: () => void }).mockClear()

    // 1. Criar → aparece na Home, no fim da fila.
    const criado = await criarCardHomeCms(card())
    expect(criado.sucesso).toBe(true)
    const id = criado.dados!.id
    expect(updateTag).toHaveBeenCalledWith(TAG_CMS_CARDS_HOME)
    let publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos.at(-1)).toMatchObject({ id, href: '/precos', estilo: 'esmeralda', selo: 'Novo' })

    // 2. Editar título, descrição e selo.
    entrarComo(contas.gestor.token)
    const editado = await editarCardHomeCms({
      cardId: id,
      ...card({ titulo: `${PREFIXO_TITULO} editado`, descricao: 'Nova descrição.', selo: 'Selo novo' }),
    })
    expect(editado.sucesso).toBe(true)
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos.find((item) => item.id === id)).toMatchObject({
      titulo: `${PREFIXO_TITULO} editado`,
      descricao: 'Nova descrição.',
      selo: 'Selo novo',
    })

    // 3. Trocar o destino para uma página publicada do CMS.
    entrarComo(contas.gestor.token)
    const pagina = await criarPaginaCms({
      titulo: 'Destino de teste',
      slug: `${PREFIXO_SLUG}destino`,
      conteudo: CONTEUDO_PAGINA_VAZIO,
    })
    await publicarPaginaCms({ paginaId: pagina.dados!.id })
    expect(
      (await editarCardHomeCms({
        cardId: id,
        ...card({ titulo: `${PREFIXO_TITULO} editado`, destinoTipo: 'pagina', paginaId: pagina.dados!.id, rota: '/precos' }),
      })).sucesso,
    ).toBe(true)
    const [gravado] = await db.select().from(cmsCardsHome).where(eq(cmsCardsHome.id, id))
    // O campo do outro tipo é descartado — o banco exige um destino só.
    expect(gravado).toMatchObject({ destinoTipo: 'pagina', paginaId: pagina.dados!.id, rota: null })
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos.find((item) => item.id === id)?.href).toBe(`/${PREFIXO_SLUG}destino`)

    // 4. Reordenar: o novo card vira o primeiro (destaque).
    entrarComo(contas.gestor.token)
    const atual = await ordemAtual()
    const novaOrdem = [id, ...atual.filter((outro) => outro !== id)]
    expect((await reordenarCardsHomeCms({ idsOrdenados: novaOrdem })).sucesso).toBe(true)
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos[0].id).toBe(id)
    // Lista parcial é recusada.
    entrarComo(contas.gestor.token)
    expect((await reordenarCardsHomeCms({ idsOrdenados: [id] })).sucesso).toBe(false)

    // 5. Desativar → some. 6. Reativar → volta.
    expect((await alterarAtivacaoCardHomeCms({ cardId: id, ativo: false })).sucesso).toBe(true)
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos.some((item) => item.id === id)).toBe(false)
    entrarComo(contas.gestor.token)
    expect((await alterarAtivacaoCardHomeCms({ cardId: id, ativo: true })).sucesso).toBe(true)
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos[0].id).toBe(id)

    // Página de destino arquivada → o card sai do site e não pode ser reativado.
    entrarComo(contas.gestor.token)
    await arquivarPaginaCms({ paginaId: pagina.dados!.id })
    publicos = await comoVisitante(() => listarCardsHomePublicos())
    expect(publicos.some((item) => item.id === id)).toBe(false)
    entrarComo(contas.gestor.token)
    const naGestao = (await listarCardsHomeGestao())!.find((item) => item.id === id)
    expect(naGestao).toMatchObject({ ativo: true, href: null, paginaStatus: 'arquivada' })
    await alterarAtivacaoCardHomeCms({ cardId: id, ativo: false })
    expect((await alterarAtivacaoCardHomeCms({ cardId: id, ativo: true })).sucesso).toBe(false)

    // 7. Excluir: exige confirmação e card desativado; é lógico.
    expect((await excluirCardHomeCms({ cardId: id })).sucesso).toBe(false)
    expect((await excluirCardHomeCms({ cardId: id, confirmacao: true })).sucesso).toBe(true)
    const [excluido] = await db.select().from(cmsCardsHome).where(eq(cmsCardsHome.id, id))
    expect(excluido.excluidoEm).not.toBeNull()
    expect((await listarCardsHomeGestao())!.some((item) => item.id === id)).toBe(false)
    expect((await comoVisitante(() => listarCardsHomePublicos())).some((item) => item.id === id)).toBe(false)

    // Trilha de auditoria de cada passo.
    const eventos = await db
      .select({ acao: eventosAuditoria.acao, metadados: eventosAuditoria.metadados, origem: eventosAuditoria.origem })
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.registroAfetado, id), eq(eventosAuditoria.acao, 'cms_card_home_alterado')))
      .orderBy(eventosAuditoria.createdAt)
    const operacoes = eventos.map(({ metadados }) => (metadados as { operacao: string }).operacao)
    expect(operacoes).toEqual([
      'card_criado',
      'card_editado',
      'card_editado',
      'cards_reordenados',
      'card_desativado',
      'card_ativado',
      'card_desativado',
      'card_excluido',
    ])
    expect(eventos.every(({ origem }) => origem === 'gestao_vincis')).toBe(true)
  })

  it('card ativo não pode ser excluído', async () => {
    entrarComo(contas.gestor.token)
    expect(await excluirCardHomeCms({ cardId: IDS_INICIAIS[1], confirmacao: true })).toMatchObject({
      sucesso: false,
      mensagem: 'Desative o card antes de excluir.',
    })
  })

  it('card novo nasce no fim e inativo quando não pedido', async () => {
    entrarComo(contas.gestor.token)
    const { ativo: _ignorado, ...semAtivo } = card()
    const criado = await criarCardHomeCms(semAtivo)
    const lista = (await listarCardsHomeGestao())!
    expect(lista.at(-1)).toMatchObject({ id: criado.dados!.id, ativo: false })
    expect((await comoVisitante(() => listarCardsHomePublicos())).some((item) => item.id === criado.dados!.id)).toBe(false)
  })
})
