import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { updateTag } from 'next/cache'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cmsGruposNavegacao, cmsPaginas, eventosAuditoria } from '@/db/schema'
import PaginaCmsRoute, { generateMetadata } from '@/app/[slug]/page'
import {
  adicionarItemNavegacaoCms,
  alterarAtivacaoGrupoNavegacaoCms,
  criarGrupoNavegacaoCms,
  editarItemNavegacaoCms,
  reordenarItensNavegacaoCms,
} from '@/features/cms/actions/navegacao'
import {
  MenuCmsDesktop,
  MenuCmsMobile,
} from '@/features/cms/components/publico/MenuCabecalhoCms'
import {
  arquivarPaginaCms,
  criarPaginaCms,
  despublicarPaginaCms,
  editarPaginaCms,
  publicarPaginaCms,
} from '@/features/cms/actions/paginas'
import {
  buscarPaginaPublicada,
  listarMenuCabecalhoPublico,
  listarNavegacaoRodapePublica,
} from '@/features/cms/queries/publico'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O lado público do CMS: `/<slug>`, metadados e rodapé.
 *
 * As páginas são criadas pelas actions reais, como o Gestor faria, e lidas
 * pelas mesmas funções que a rota e o layout usam. Visitante não tem sessão:
 * a leitura pública roda com o cookie vazio.
 */

const SUFIXO = '@cms-publico.teste'
const PREFIXO = 'teste-pub-'
const APP_URL_ORIGINAL = process.env.APP_URL

let gestor: ContaDeTeste

function documento(texto: string) {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Seção' }] },
      { type: 'paragraph', content: [{ type: 'text', text: texto }] },
    ],
  }
}

async function criarPagina(slug: string, extra: Record<string, unknown> = {}) {
  entrarComo(gestor.token)
  const resultado = await criarPaginaCms({
    titulo: `Título ${slug}`,
    slug: `${PREFIXO}${slug}`,
    conteudo: documento(`Texto de ${slug}`),
    ...extra,
  })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return resultado.dados!.id
}

async function comoVisitante<T>(leitura: () => Promise<T>) {
  entrarComo(null)
  return leitura()
}

/** `notFound()` lança o erro de fronteira do Next com o código 404. */
async function esperar404(slug: string) {
  await expect(
    PaginaCmsRoute({ params: Promise.resolve({ slug }) }),
  ).rejects.toMatchObject({ digest: expect.stringContaining('404') })
}

async function limpar() {
  await db.delete(cmsGruposNavegacao).where(like(cmsGruposNavegacao.identificador, `${PREFIXO}%`))
  await db.delete(cmsPaginas).where(like(cmsPaginas.slug, `${PREFIXO}%`))
  if (gestor)
    await db
      .delete(eventosAuditoria)
      .where(and(like(eventosAuditoria.acao, 'cms_%'), inArray(eventosAuditoria.autorId, [gestor.id])))
}

beforeAll(async () => {
  ;({ gestor } = await criarContas(SUFIXO, { gestor: { perfil: 'gestor_vincis' } }, '119441'))
  await limpar()
})

beforeEach(() => {
  vi.mocked(updateTag).mockClear()
  process.env.APP_URL = 'https://vincis.example'
})

afterAll(async () => {
  process.env.APP_URL = APP_URL_ORIGINAL
  sairDaSessao()
  await limpar()
  await limparContas(SUFIXO)
})

describe('página pública em /<slug>', () => {
  it('publicada abre para o visitante, com o conteúdo renderizado', async () => {
    const id = await criarPagina('sobre')
    await publicarPaginaCms({ paginaId: id })

    const pagina = await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}sobre`))
    expect(pagina?.titulo).toBe('Título sobre')

    const html = renderToStaticMarkup(
      await PaginaCmsRoute({ params: Promise.resolve({ slug: `${PREFIXO}sobre` }) }),
    )
    expect(html).toContain('<h1')
    expect(html).toContain('Título sobre')
    expect(html).toContain('<h2')
    expect(html).toContain('Texto de sobre')
  })

  it('rascunho, arquivada, inexistente e reservado respondem 404 igual', async () => {
    await criarPagina('rascunho')
    const arquivada = await criarPagina('arquivada')
    await publicarPaginaCms({ paginaId: arquivada })
    await arquivarPaginaCms({ paginaId: arquivada })

    entrarComo(null)
    for (const slug of [`${PREFIXO}rascunho`, `${PREFIXO}arquivada`, `${PREFIXO}nao-existe`, 'admin', 'NAO VALIDO']) {
      expect(await buscarPaginaPublicada(slug), slug).toBeNull()
      await esperar404(slug)
      expect(await generateMetadata({ params: Promise.resolve({ slug }) }), slug).toEqual({})
    }
  })

  it('despublicar tira do ar e preserva o conteúdo e a primeira publicação', async () => {
    const id = await criarPagina('vai-e-volta')
    await publicarPaginaCms({ paginaId: id })
    const primeira = await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}vai-e-volta`))

    entrarComo(gestor.token)
    await despublicarPaginaCms({ paginaId: id })
    expect(await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}vai-e-volta`))).toBeNull()

    entrarComo(gestor.token)
    await publicarPaginaCms({ paginaId: id })
    const segunda = await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}vai-e-volta`))
    expect(segunda?.conteudo).toEqual(primeira?.conteudo)
    expect(segunda?.publicadaEm).toBe(primeira?.publicadaEm)
  })

  it('metadata usa o SEO do CMS, com canonical e Open Graph', async () => {
    const id = await criarPagina('seo', {
      tituloSeo: 'Política de privacidade da Vincis',
      descricaoSeo: 'Como tratamos seus dados.',
    })
    await publicarPaginaCms({ paginaId: id })
    entrarComo(null)

    const metadados = await generateMetadata({ params: Promise.resolve({ slug: `${PREFIXO}seo` }) })
    expect(metadados).toMatchObject({
      title: 'Política de privacidade da Vincis',
      description: 'Como tratamos seus dados.',
      alternates: { canonical: `https://vincis.example/${PREFIXO}seo` },
      openGraph: {
        type: 'article',
        title: 'Política de privacidade da Vincis',
        description: 'Como tratamos seus dados.',
        url: `https://vincis.example/${PREFIXO}seo`,
        siteName: 'Vincis',
        locale: 'pt_BR',
      },
    })
    // Não inventa imagem enquanto o CMS não tem mídia.
    expect(JSON.stringify(metadados)).not.toContain('images')
  })

  it('sem SEO preenchido: título da página com o nome do site e sem descrição inventada', async () => {
    const id = await criarPagina('sem-seo')
    await publicarPaginaCms({ paginaId: id })
    process.env.APP_URL = ''
    entrarComo(null)

    const metadados = await generateMetadata({ params: Promise.resolve({ slug: `${PREFIXO}sem-seo` }) })
    expect(metadados.title).toBe('Título sem-seo | Vincis')
    expect(metadados).not.toHaveProperty('description')
    // Sem APP_URL não há canonical — melhor nenhum que um com host errado.
    expect(metadados).not.toHaveProperty('alternates')
  })

  it('trocar o slug de página publicada move o endereço', async () => {
    const id = await criarPagina('antigo')
    await publicarPaginaCms({ paginaId: id })
    entrarComo(gestor.token)
    await editarPaginaCms({
      paginaId: id,
      titulo: 'Título antigo',
      slug: `${PREFIXO}novo`,
      conteudo: documento('Texto de antigo'),
    })
    expect(vi.mocked(updateTag).mock.calls.flat()).toEqual(
      expect.arrayContaining([
        `cms-pagina:${PREFIXO}antigo`,
        `cms-pagina:${PREFIXO}novo`,
        'cms-paginas-publicadas',
        'cms-navegacao',
      ]),
    )
    expect(await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}antigo`))).toBeNull()
    expect((await comoVisitante(() => buscarPaginaPublicada(`${PREFIXO}novo`)))?.titulo).toBe(
      'Título antigo',
    )
  })
})

describe('rodapé público', () => {
  it('só grupo ativo, link ativo e página publicada, na ordem', async () => {
    entrarComo(gestor.token)
    const publicadaA = await criarPagina('rodape-a')
    const publicadaB = await criarPagina('rodape-b')
    const rascunho = await criarPagina('rodape-rascunho')
    const arquivada = await criarPagina('rodape-arquivada')
    const desligada = await criarPagina('rodape-desligada')
    for (const id of [publicadaA, publicadaB, arquivada, desligada]) await publicarPaginaCms({ paginaId: id })

    const grupo = await criarGrupoNavegacaoCms({
      nome: 'Institucional',
      tituloPublico: 'Institucional',
      identificador: `${PREFIXO}institucional`,
      ativo: true,
    })
    const inativo = await criarGrupoNavegacaoCms({
      nome: 'Escondido',
      tituloPublico: 'Escondido',
      identificador: `${PREFIXO}escondido`,
    })
    const grupoId = grupo.dados!.id

    const itemA = await adicionarItemNavegacaoCms({ grupoId, paginaId: publicadaA })
    const itemB = await adicionarItemNavegacaoCms({ grupoId, paginaId: publicadaB, texto: 'Link B' })
    await adicionarItemNavegacaoCms({ grupoId, paginaId: rascunho })
    await adicionarItemNavegacaoCms({ grupoId, paginaId: arquivada })
    const itemDesligado = await adicionarItemNavegacaoCms({ grupoId, paginaId: desligada })
    await adicionarItemNavegacaoCms({ grupoId: inativo.dados!.id, paginaId: publicadaA })

    // A página entrou na navegação ainda publicada; arquivar a tira de lá.
    await arquivarPaginaCms({ paginaId: arquivada })
    await editarItemNavegacaoCms({ itemId: itemDesligado.dados!.id, texto: null, ativo: false })

    const idsItens = (await db.query.cmsItensNavegacao.findMany({
      where: (item, { eq }) => eq(item.grupoId, grupoId),
      orderBy: (item, { asc }) => asc(item.ordem),
    })).map(({ id }) => id)
    // B antes de A.
    const reordenados = [itemB.dados!.id, ...idsItens.filter((id) => id !== itemB.dados!.id)]
    await reordenarItensNavegacaoCms({ grupoId, idsOrdenados: reordenados })

    const rodape = await comoVisitante(() => listarNavegacaoRodapePublica())
    const meus = rodape.filter(({ id }) => [grupoId, inativo.dados!.id].includes(id))
    expect(meus).toEqual([
      {
        id: grupoId,
        titulo: 'Institucional',
        links: [
          { id: itemB.dados!.id, href: `/${PREFIXO}rodape-b`, texto: 'Link B' },
          { id: itemA.dados!.id, href: `/${PREFIXO}rodape-a`, texto: 'Título rodape-a' },
        ],
      },
    ])

    // Desligar o grupo tira a coluna inteira.
    vi.mocked(updateTag).mockClear()
    entrarComo(gestor.token)
    await alterarAtivacaoGrupoNavegacaoCms({ grupoId, ativo: false })
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith('cms-navegacao')
    const depois = await comoVisitante(() => listarNavegacaoRodapePublica())
    expect(depois.some(({ id }) => id === grupoId)).toBe(false)
  })

  it('toda mutação pertinente invalida só as etiquetas necessárias', async () => {
    const id = await criarPagina('etiquetas')
    vi.mocked(updateTag).mockClear()
    // Rascunho novo não está no ar: nenhuma etiqueta pública muda.
    expect(vi.mocked(updateTag)).not.toHaveBeenCalled()

    await publicarPaginaCms({ paginaId: id })
    expect(vi.mocked(updateTag).mock.calls.flat().sort()).toEqual(
      [`cms-pagina:${PREFIXO}etiquetas`, 'cms-paginas-publicadas', 'cms-navegacao'].sort(),
    )

    vi.mocked(updateTag).mockClear()
    await editarPaginaCms({
      paginaId: id,
      titulo: 'Outro título',
      slug: `${PREFIXO}etiquetas`,
      conteudo: documento('x'),
    })
    // Mesmo slug: a página e o rodapé mudam; o conjunto de publicadas, não.
    expect(vi.mocked(updateTag).mock.calls.flat().sort()).toEqual(
      [`cms-pagina:${PREFIXO}etiquetas`, 'cms-navegacao'].sort(),
    )
  })

  it('falha do banco não derruba o rodapé: devolve vazio e o Footer usa os links fixos', async () => {
    const espiao = vi.spyOn(db, 'select').mockImplementationOnce(() => {
      throw new Error('banco fora do ar')
    })
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await comoVisitante(() => listarNavegacaoRodapePublica())).toEqual([])
    expect(erroConsole).toHaveBeenCalled()
    espiao.mockRestore()
    erroConsole.mockRestore()
  })
})

describe('menu público do cabeçalho', () => {
  it('só grupo ativo, item ativo e página publicada; pai → filhos na ordem', async () => {
    const advocacia = await criarPagina('menu-advocacia')
    const contabilidade = await criarPagina('menu-contabilidade')
    const consultoria = await criarPagina('menu-consultoria')
    const rascunho = await criarPagina('menu-rascunho')
    const sobre = await criarPagina('menu-sobre')
    for (const id of [advocacia, contabilidade, consultoria, sobre]) await publicarPaginaCms({ paginaId: id })

    entrarComo(gestor.token)
    const menu = await criarGrupoNavegacaoCms({
      nome: 'Menu',
      tituloPublico: 'Menu',
      identificador: `${PREFIXO}menu`,
      local: 'cabecalho',
      ativo: true,
    })
    const inativo = await criarGrupoNavegacaoCms({
      nome: 'Menu escondido',
      tituloPublico: 'Menu escondido',
      identificador: `${PREFIXO}menu-escondido`,
      local: 'cabecalho',
    })
    const grupoId = menu.dados!.id

    const servicos = (await adicionarItemNavegacaoCms({ grupoId, texto: 'Serviços' })).dados!.id
    const filhoAdv = (await adicionarItemNavegacaoCms({ grupoId, paginaId: advocacia, paiId: servicos })).dados!.id
    const filhoContab = (
      await adicionarItemNavegacaoCms({ grupoId, paginaId: contabilidade, paiId: servicos, texto: 'Contábil' })
    ).dados!.id
    await adicionarItemNavegacaoCms({ grupoId, paginaId: rascunho, paiId: servicos })
    const filhoDesligado = (
      await adicionarItemNavegacaoCms({ grupoId, paginaId: consultoria, paiId: servicos })
    ).dados!.id
    await editarItemNavegacaoCms({ itemId: filhoDesligado, texto: null, ativo: false })
    const raizSobre = (await adicionarItemNavegacaoCms({ grupoId, paginaId: sobre })).dados!.id

    // Agrupador desligado leva junto os filhos.
    const extras = (await adicionarItemNavegacaoCms({ grupoId, texto: 'Extras' })).dados!.id
    const filhoExtra = await criarPagina('menu-extra')
    await publicarPaginaCms({ paginaId: filhoExtra })
    entrarComo(gestor.token)
    await adicionarItemNavegacaoCms({ grupoId, paginaId: filhoExtra, paiId: extras })
    await editarItemNavegacaoCms({ itemId: extras, texto: 'Extras', ativo: false })
    await adicionarItemNavegacaoCms({ grupoId: inativo.dados!.id, paginaId: sobre })

    await reordenarItensNavegacaoCms({ grupoId, paiId: servicos, idsOrdenados: [filhoContab, filhoAdv, ...(await idsFilhos(servicos)).filter((id) => ![filhoContab, filhoAdv].includes(id))] })

    vi.mocked(updateTag).mockClear()
    await reordenarItensNavegacaoCms({ grupoId, idsOrdenados: [raizSobre, servicos, extras] })
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith('cms-navegacao')

    const cabecalho = await comoVisitante(() => listarMenuCabecalhoPublico())
    const meus = cabecalho.filter(({ id }) => [grupoId, inativo.dados!.id].includes(id))
    expect(meus).toEqual([
      {
        id: grupoId,
        titulo: 'Menu',
        itens: [
          { id: raizSobre, texto: 'Título menu-sobre', href: `/${PREFIXO}menu-sobre`, filhos: [] },
          {
            id: servicos,
            texto: 'Serviços',
            href: null,
            filhos: [
              { id: filhoContab, texto: 'Contábil', href: `/${PREFIXO}menu-contabilidade`, filhos: [] },
              { id: filhoAdv, texto: 'Título menu-advocacia', href: `/${PREFIXO}menu-advocacia`, filhos: [] },
            ],
          },
        ],
      },
    ])

    // Desktop e mobile desenham a mesma árvore: os mesmos itens raiz, e o
    // agrupador como botão de expandir (sem navegar) nos dois.
    const itens = meus[0]!.itens
    const desktop = renderToStaticMarkup(createElement(MenuCmsDesktop, { itens, pathname: '/' }))
    const mobile = renderToStaticMarkup(createElement(MenuCmsMobile, { itens, aoNavegar: () => undefined }))
    for (const html of [desktop, mobile]) {
      expect(html).toContain(`href="/${PREFIXO}menu-sobre"`)
      expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"[^>]*>Serviços/)
      expect(html).not.toContain('Extras')
    }
  })
})

async function idsFilhos(paiId: string) {
  const linhas = await db.query.cmsItensNavegacao.findMany({
    where: (item, { eq }) => eq(item.paiId, paiId),
    orderBy: (item, { asc }) => asc(item.ordem),
  })
  return linhas.map(({ id }) => id)
}

describe('sem HTML cru', () => {
  it('nenhum arquivo do CMS nem da rota pública usa dangerouslySetInnerHTML', () => {
    const raiz = process.cwd()
    const arquivos: string[] = []
    const percorrer = (pasta: string) => {
      for (const nome of readdirSync(pasta)) {
        const caminho = path.join(pasta, nome)
        if (statSync(caminho).isDirectory()) percorrer(caminho)
        else if (/\.tsx?$/.test(nome)) arquivos.push(caminho)
      }
    }
    percorrer(path.join(raiz, 'src/features/cms'))
    percorrer(path.join(raiz, 'src/app/[slug]'))
    arquivos.push(path.join(raiz, 'src/components/shared/Footer.tsx'))
    // O uso real (atributo JSX ou prop num objeto), não a palavra num comentário.
    const comHtmlCru = arquivos.filter((arquivo) =>
      /dangerouslySetInnerHTML\s*[=:]/.test(readFileSync(arquivo, 'utf8')),
    )
    expect(arquivos.length).toBeGreaterThan(10)
    expect(comHtmlCru).toEqual([])
  })
})
