import { readdirSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CONTEUDO_PAGINA_VAZIO,
  ConteudoRenderizado,
  LIMITES_CMS,
  STATUS_PAGINA,
  aplicarTransicao,
  conteudoPaginaSchema,
  criarSchemasCms,
  criarVerificadorSlugReservado,
  filtrarPaginasAssociaveis,
  criariaCiclo,
  gerarIdentificador,
  irmaos,
  montarGruposPublicos,
  montarMenuPublico,
  validarPosicaoItem,
  montarSeoPagina,
  ordenacaoEhCompleta,
  paginaEhEditavel,
  resolverPublicadaEm,
  statusPaginaSchema,
  tagCmsPagina,
  TAG_CMS_NAVEGACAO,
} from '@/features/cms/nucleo'
import { schemasCms } from '@/features/cms/integracao/schemas'
import {
  ROTAS_RESERVADAS_VINCIS,
  slugReservadoVincis,
} from '@/features/cms/integracao/rotas-reservadas'

/**
 * O núcleo do CMS, sem banco e sem sessão: regras puras.
 *
 * O que importa aqui é o que protege o site — slug que não sequestra rota,
 * conteúdo que não carrega HTML nem `javascript:` — e o ciclo de vida da
 * página.
 */

const UUID = '7f1c1d3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f'

function documento(...content: unknown[]) {
  return { type: 'doc', content }
}

function paginaValida(extra: Record<string, unknown> = {}) {
  return {
    titulo: 'Política de Privacidade',
    slug: 'privacidade',
    conteudo: CONTEUDO_PAGINA_VAZIO,
    ...extra,
  }
}

describe('identificador e slug', () => {
  it('normaliza título em slug: acentos, caixa, espaços e pontuação', () => {
    expect(gerarIdentificador('  Política de Privacidade  ')).toBe('politica-de-privacidade')
    expect(gerarIdentificador('Termos & Condições — 2026!')).toBe('termos-condicoes-2026')
    expect(gerarIdentificador('---Sobre---Nós---')).toBe('sobre-nos')
    expect(gerarIdentificador('a'.repeat(200))).toHaveLength(120)
  })

  it('aceita slug válido e normaliza caixa e espaços nas pontas', () => {
    expect(schemasCms.slug.parse('sobre')).toBe('sobre')
    expect(schemasCms.slug.parse('perguntas-frequentes-2026')).toBe('perguntas-frequentes-2026')
    expect(schemasCms.slug.parse('  Contabilidade ')).toBe('contabilidade')
  })

  it.each([
    ['vazio', ''],
    ['espaço interno', 'sobre nos'],
    ['hífen na ponta', '-sobre'],
    ['hífen duplo', 'sobre--nos'],
    ['barra', 'sobre/nos'],
    ['acento', 'politica-de-privacidade-ç'],
    ['ponto', 'robots.txt'],
    ['grande demais', 'a'.repeat(121)],
  ])('recusa slug inválido: %s', (_caso, slug) => {
    expect(schemasCms.slug.safeParse(slug).success).toBe(false)
  })

  it('recusa slug reservado por rota real, também em outra caixa', () => {
    for (const slug of ['admin', 'api', 'precos', 'cliente', 'p', 'suporte', 'gestao']) {
      const resultado = schemasCms.slug.safeParse(slug)
      expect(resultado.success, slug).toBe(false)
    }
    expect(schemasCms.slug.safeParse('ADMIN').success).toBe(false)
    expect(slugReservadoVincis('_next')).toBe(true)
  })

  it('o núcleo só reserva o que recebe, além dos nomes técnicos', () => {
    const verificador = criarVerificadorSlugReservado(['loja'])
    expect(verificador('loja')).toBe(true)
    expect(verificador('api')).toBe(true)
    expect(verificador('admin')).toBe(false)
    const schemas = criarSchemasCms({ slugReservado: verificador })
    expect(schemas.slug.safeParse('admin').success).toBe(true)
  })

  /**
   * Barreira contra colisão futura: uma rota nova em `src/app` (ou uma pasta
   * nova em `public/`) que não entrar na lista quebra este teste, em vez de ser
   * sequestrada por uma página do CMS em `/[slug]`.
   */
  it('reserva todo primeiro segmento real de src/app e de public/', () => {
    const raiz = process.cwd()
    const segmentosDaAplicacao = readdirSync(path.join(raiz, 'src/app'), { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name)
      // Grupos `(x)`, dinâmicas `[x]` e privadas `_x` não ocupam segmento de URL.
      .filter((nome) => !/^[([_]/.test(nome))
    const entradasPublicas = readdirSync(path.join(raiz, 'public'))

    const faltando = [...segmentosDaAplicacao, ...entradasPublicas].filter(
      (nome) => !slugReservadoVincis(nome),
    )
    expect(faltando).toEqual([])
    // E a lista não carrega rota fantasma sem saber: todo item é real ou legado.
    const conhecidos = new Set([...segmentosDaAplicacao, ...entradasPublicas, 'gestao'])
    expect(ROTAS_RESERVADAS_VINCIS.filter((rota) => !conhecidos.has(rota))).toEqual([])
  })
})

describe('schema do conteúdo', () => {
  it('aceita o documento vazio e um documento com todos os nós permitidos', () => {
    expect(conteudoPaginaSchema.safeParse(CONTEUDO_PAGINA_VAZIO).success).toBe(true)
    const completo = documento(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'negrito', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'itálico', marks: [{ type: 'italic' }] },
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href: 'https://vincis.com.br', target: '_blank' } }],
          },
          { type: 'text', text: 'interno', marks: [{ type: 'link', attrs: { href: '/precos' } }] },
        ],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 3 },
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
    )
    expect(conteudoPaginaSchema.safeParse(completo).success).toBe(true)
  })

  it.each([
    ['raiz que não é documento', { type: 'paragraph' }],
    ['nó fora da lista', documento({ type: 'image', attrs: { src: 'https://x.y/a.png' } })],
    ['HTML cru', documento({ type: 'html', content: '<script>alert(1)</script>' })],
    ['atributo extra', documento({ type: 'paragraph', attrs: { onclick: 'x()' } })],
    ['título de nível 4', documento({ type: 'heading', attrs: { level: 4 } })],
    [
      'link javascript:',
      documento({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        ],
      }),
    ],
    [
      'link protocol-relative',
      documento({
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: '//mal.com' } }] }],
      }),
    ],
    ['marca fora da lista', documento({ type: 'text', text: 'x', marks: [{ type: 'strike' }] })],
    ['lista vazia', documento({ type: 'bulletList', content: [] })],
  ])('recusa conteúdo inválido: %s', (_caso, conteudo) => {
    expect(conteudoPaginaSchema.safeParse(conteudo).success).toBe(false)
  })

  it('recusa documento acima do limite de tamanho', () => {
    // Cada texto fica abaixo do teto por nó; a soma passa do teto do documento.
    const bloco = { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(90_000) }] }
    const grande = documento(...Array.from({ length: 12 }, () => bloco))
    expect(JSON.stringify(grande).length).toBeGreaterThan(LIMITES_CMS.conteudo)
    const resultado = conteudoPaginaSchema.safeParse(grande)
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toMatch(/limite/)
  })

  it('o renderizador escapa texto e não desenha link inseguro', () => {
    const html = renderToStaticMarkup(
      createElement(ConteudoRenderizado, {
        conteudo: documento(
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Seção' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '<img src=x onerror=alert(1)>' },
              {
                type: 'text',
                text: 'clique',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
              {
                type: 'text',
                text: 'externo',
                marks: [{ type: 'link', attrs: { href: 'https://vincis.com.br', target: '_blank' } }],
              },
            ],
          },
          { type: 'desconhecido', content: [{ type: 'text', text: 'some' }] },
        ),
      }),
    )
    expect(html).toContain('<h2')
    expect(html).not.toContain('<h1')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://vincis.com.br"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('some')
  })
})

describe('schemas de entrada', () => {
  it('aceita página válida e transforma SEO vazio em nulo', () => {
    const resultado = schemasCms.criarPagina.parse(paginaValida({ tituloSeo: '   ', descricaoSeo: '' }))
    expect(resultado.tituloSeo).toBeNull()
    expect(resultado.descricaoSeo).toBeNull()
    expect(resultado.titulo).toBe('Política de Privacidade')
  })

  it('recusa título vazio, SEO longo demais e status escolhido na criação', () => {
    expect(schemasCms.criarPagina.safeParse(paginaValida({ titulo: '  ' })).success).toBe(false)
    expect(
      schemasCms.criarPagina.safeParse(paginaValida({ descricaoSeo: 'x'.repeat(321) })).success,
    ).toBe(false)
    // Criação não aceita status: o campo é descartado e a página nasce rascunho.
    expect('status' in schemasCms.criarPagina.parse(paginaValida({ status: 'publicada' }))).toBe(false)
  })

  it('aceita só os três estados de página e os locais conhecidos', () => {
    expect(STATUS_PAGINA).toEqual(['rascunho', 'publicada', 'arquivada'])
    for (const status of STATUS_PAGINA) expect(statusPaginaSchema.parse(status)).toBe(status)
    expect(statusPaginaSchema.safeParse('excluida').success).toBe(false)
    expect(
      schemasCms.criarGrupo.safeParse({
        nome: 'Institucional',
        tituloPublico: 'A Vincis',
        identificador: 'institucional',
        local: 'lateral',
      }).success,
    ).toBe(false)
  })

  it('recusa reordenação com repetição e ids inválidos', () => {
    expect(
      schemasCms.reordenarItens.safeParse({ grupoId: UUID, idsOrdenados: [UUID, UUID] }).success,
    ).toBe(false)
    expect(
      schemasCms.reordenarItens.safeParse({ grupoId: UUID, idsOrdenados: ['1'] }).success,
    ).toBe(false)
  })
})

describe('ciclo de vida e ordenação', () => {
  it('permite só os movimentos previstos', () => {
    expect(aplicarTransicao('rascunho', 'publicar')).toBe('publicada')
    expect(aplicarTransicao('publicada', 'despublicar')).toBe('rascunho')
    expect(aplicarTransicao('rascunho', 'arquivar')).toBe('arquivada')
    expect(aplicarTransicao('publicada', 'arquivar')).toBe('arquivada')
    expect(aplicarTransicao('publicada', 'publicar')).toBeNull()
    expect(aplicarTransicao('rascunho', 'despublicar')).toBeNull()
    expect(aplicarTransicao('arquivada', 'publicar')).toBeNull()
    expect(aplicarTransicao('arquivada', 'arquivar')).toBeNull()
    expect(paginaEhEditavel('arquivada')).toBe(false)
    expect(paginaEhEditavel('publicada')).toBe(true)
  })

  it('a primeira publicação fixa a data', () => {
    const primeira = new Date('2026-01-01T12:00:00Z')
    const agora = new Date('2026-06-01T12:00:00Z')
    expect(resolverPublicadaEm(null, agora)).toBe(agora)
    expect(resolverPublicadaEm(primeira, agora)).toBe(primeira)
  })

  it('filtra páginas associáveis: sem arquivadas e sem as já presentes', () => {
    const paginas = [
      { id: 'a', status: 'publicada' as const },
      { id: 'b', status: 'rascunho' as const },
      { id: 'c', status: 'arquivada' as const },
    ]
    expect(filtrarPaginasAssociaveis(paginas, ['a']).map(({ id }) => id)).toEqual(['b'])
  })

  it('reordenação só vale com o conjunto completo, sem repetição', () => {
    expect(ordenacaoEhCompleta(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
    expect(ordenacaoEhCompleta(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
    expect(ordenacaoEhCompleta(['a', 'b'], ['a', 'a'])).toBe(false)
    expect(ordenacaoEhCompleta(['a', 'b'], ['a', 'x'])).toBe(false)
  })

  it('etiquetas de cache estáveis', () => {
    expect(TAG_CMS_NAVEGACAO).toBe('cms-navegacao')
    expect(tagCmsPagina('sobre')).toBe('cms-pagina:sobre')
  })
})

describe('formato real do editor', () => {
  it('aceita o link exatamente como o TipTap 3 grava (com title nulo)', () => {
    const doTiptap = documento({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'site',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://vincis.com.br',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
                title: null,
              },
            },
          ],
        },
      ],
    })
    expect(conteudoPaginaSchema.safeParse(doTiptap).success).toBe(true)
  })
})

describe('SEO da página', () => {
  const site = { nome: 'Vincis', idioma: 'pt_BR', urlBase: 'https://vincis.com.br' }

  it('usa o SEO preenchido, com canonical absoluto', () => {
    const seo = montarSeoPagina(
      { titulo: 'Sobre', slug: 'sobre', tituloSeo: 'Sobre a Vincis', descricaoSeo: 'Quem somos.' },
      site,
    )
    expect(seo).toEqual({
      titulo: 'Sobre a Vincis',
      descricao: 'Quem somos.',
      canonical: 'https://vincis.com.br/sobre',
      openGraph: {
        type: 'article',
        title: 'Sobre a Vincis',
        description: 'Quem somos.',
        url: 'https://vincis.com.br/sobre',
        siteName: 'Vincis',
        locale: 'pt_BR',
      },
    })
  })

  it('sem SEO: título com o nome do site, sem descrição; sem URL base, sem canonical', () => {
    const seo = montarSeoPagina(
      { titulo: 'Termos', slug: 'termos', tituloSeo: '  ', descricaoSeo: null },
      { ...site, urlBase: null },
    )
    expect(seo.titulo).toBe('Termos | Vincis')
    expect(seo.descricao).toBeNull()
    expect(seo.canonical).toBeNull()
    expect(seo.openGraph.url).toBeNull()
  })
})

describe('montagem do rodapé público', () => {
  const linha = (grupo: string, ordemGrupo: number, item: string, ordemItem: number, slug: string, texto: string | null = null) => ({
    grupoId: grupo,
    grupoTitulo: `Grupo ${grupo}`,
    grupoOrdem: ordemGrupo,
    itemId: item,
    itemOrdem: ordemItem,
    texto,
    paginaTitulo: `Página ${slug}`,
    paginaSlug: slug,
  })

  it('ordena grupos e links, usa o título da página sem texto próprio e pula slug reservado', () => {
    const grupos = montarGruposPublicos(
      [
        linha('b', 1, 'b1', 0, 'contato'),
        linha('a', 0, 'a2', 1, 'termos', '  '),
        linha('a', 0, 'a1', 0, 'sobre', 'Quem somos'),
        linha('c', 2, 'c1', 0, 'admin'),
      ],
      slugReservadoVincis,
    )
    expect(grupos).toEqual([
      {
        id: 'a',
        titulo: 'Grupo a',
        links: [
          { id: 'a1', href: '/sobre', texto: 'Quem somos' },
          { id: 'a2', href: '/termos', texto: 'Página termos' },
        ],
      },
      { id: 'b', titulo: 'Grupo b', links: [{ id: 'b1', href: '/contato', texto: 'Página contato' }] },
    ])
  })
})

describe('árvore de navegação: posição de um item', () => {
  // G1: agrupador A (raiz), link L (raiz), filho F (de A). G2: agrupador B.
  const itens = [
    { id: 'A', grupoId: 'G1', paiId: null, paginaId: null },
    { id: 'L', grupoId: 'G1', paiId: null, paginaId: 'p-l' },
    { id: 'F', grupoId: 'G1', paiId: 'A', paginaId: 'p-f' },
    { id: 'B', grupoId: 'G2', paiId: null, paginaId: null },
  ]
  const novoLink = { grupoId: 'G1', paginaId: 'p-novo' }

  it('aceita raiz (link ou agrupador) e filho válido no cabeçalho', () => {
    expect(validarPosicaoItem({ item: novoLink, paiId: null, local: 'cabecalho', itens })).toBeNull()
    expect(
      validarPosicaoItem({ item: { grupoId: 'G1', paginaId: null }, paiId: null, local: 'cabecalho', itens }),
    ).toBeNull()
    expect(validarPosicaoItem({ item: novoLink, paiId: 'A', local: 'cabecalho', itens })).toBeNull()
    // Mover um link raiz para dentro do agrupador.
    expect(
      validarPosicaoItem({ item: { id: 'L', grupoId: 'G1', paginaId: 'p-l' }, paiId: 'A', local: 'cabecalho', itens }),
    ).toBeNull()
  })

  it('rodapé é plano: sem agrupador e sem submenu', () => {
    expect(
      validarPosicaoItem({ item: { grupoId: 'G1', paginaId: null }, paiId: null, local: 'rodape', itens }),
    ).toBe('agrupador_fora_de_menu')
    expect(validarPosicaoItem({ item: novoLink, paiId: 'A', local: 'rodape', itens })).toBe(
      'submenu_nao_permitido',
    )
  })

  it.each([
    ['pai inexistente', novoLink, 'X', 'pai_inexistente'],
    ['pai de outro grupo', novoLink, 'B', 'pai_de_outro_grupo'],
    ['auto-referência', { id: 'A', grupoId: 'G1', paginaId: null }, 'A', 'auto_referencia'],
    ['terceiro nível (pai já é filho)', novoLink, 'F', 'profundidade_excedida'],
    ['agrupador levado a pai de outro grupo', { id: 'A', grupoId: 'G1', paginaId: null }, 'B', 'pai_de_outro_grupo'],
    ['pai que é link, não agrupador', novoLink, 'L', 'pai_nao_agrupador'],
    ['filho sem página', { grupoId: 'G1', paginaId: null }, 'A', 'filho_sem_pagina'],
  ] as const)('recusa %s', (_caso, item, paiId, erro) => {
    expect(validarPosicaoItem({ item, paiId, local: 'cabecalho', itens })).toBe(erro)
  })

  it('recusa levar um agrupador com filhos para dentro de outro (seria 3º nível)', () => {
    const comOutroAgrupador = [...itens, { id: 'C', grupoId: 'G1', paiId: null, paginaId: null }]
    expect(
      validarPosicaoItem({
        item: { id: 'A', grupoId: 'G1', paginaId: null },
        paiId: 'C',
        local: 'cabecalho',
        itens: comOutroAgrupador,
      }),
    ).toBe('profundidade_excedida')
  })

  it('detecta ciclo, direto ou indireto', () => {
    // Estado corrompido de propósito: X → Y → Z, e propõe-se Z como pai de X.
    const paiDe = (id: string) => ({ Y: 'X', Z: 'Y' })[id] ?? null
    expect(criariaCiclo('X', 'Z', paiDe)).toBe(true)
    expect(criariaCiclo('X', 'X', paiDe)).toBe(true)
    expect(criariaCiclo('Z', 'X', paiDe)).toBe(false)
    const comCiclo = [
      { id: 'X', grupoId: 'G', paiId: null, paginaId: null },
      { id: 'Y', grupoId: 'G', paiId: 'X', paginaId: null },
    ]
    expect(
      validarPosicaoItem({ item: { id: 'X', grupoId: 'G', paginaId: null }, paiId: 'Y', local: 'cabecalho', itens: comCiclo }),
    ).toBe('ciclo')
  })

  it('irmãos: raízes de um grupo e filhos de um pai, separados', () => {
    expect(irmaos(itens, 'G1', null).map(({ id }) => id)).toEqual(['A', 'L'])
    expect(irmaos(itens, 'G1', 'A').map(({ id }) => id)).toEqual(['F'])
  })
})

describe('árvore de navegação: menu público', () => {
  const linha = (dados: Partial<Parameters<typeof montarMenuPublico>[0][number]> & { itemId: string }) => ({
    grupoId: 'G',
    grupoTitulo: 'Menu',
    grupoOrdem: 0,
    paiId: null,
    itemOrdem: 0,
    texto: null,
    ehAgrupador: false,
    paginaSlug: null,
    paginaTitulo: null,
    ...dados,
  })

  it('monta raiz → filhos na ordem e esconde o que não pode aparecer', () => {
    const menu = montarMenuPublico(
      [
        linha({ itemId: 'sobre', itemOrdem: 1, paginaSlug: 'sobre', paginaTitulo: 'Sobre' }),
        linha({ itemId: 'servicos', itemOrdem: 0, texto: 'Serviços', ehAgrupador: true }),
        linha({ itemId: 'contab', paiId: 'servicos', itemOrdem: 1, paginaSlug: 'contabilidade', paginaTitulo: 'Contabilidade' }),
        linha({ itemId: 'adv', paiId: 'servicos', itemOrdem: 0, paginaSlug: 'advocacia', paginaTitulo: 'Advocacia', texto: 'Advocacia empresarial' }),
        // Filho com página não publicada (chega sem slug): some.
        linha({ itemId: 'rascunho', paiId: 'servicos', itemOrdem: 2 }),
        // Link raiz para página fora do ar: some.
        linha({ itemId: 'fora', itemOrdem: 2 }),
        // Agrupador sem filho visível: some.
        linha({ itemId: 'vazio', itemOrdem: 3, texto: 'Vazio', ehAgrupador: true }),
        // Filho de pai desligado (o pai não veio na consulta): some.
        linha({ itemId: 'orfao', paiId: 'desligado', paginaSlug: 'orfao', paginaTitulo: 'Órfão' }),
        // Slug reservado nunca vira link.
        linha({ itemId: 'admin', itemOrdem: 4, paginaSlug: 'admin', paginaTitulo: 'Admin' }),
      ],
      slugReservadoVincis,
    )
    expect(menu).toEqual([
      {
        id: 'G',
        titulo: 'Menu',
        itens: [
          {
            id: 'servicos',
            texto: 'Serviços',
            href: null,
            filhos: [
              { id: 'adv', texto: 'Advocacia empresarial', href: '/advocacia', filhos: [] },
              { id: 'contab', texto: 'Contabilidade', href: '/contabilidade', filhos: [] },
            ],
          },
          { id: 'sobre', texto: 'Sobre', href: '/sobre', filhos: [] },
        ],
      },
    ])
  })

  it('grupo sem nada visível não aparece; grupos seguem a ordem deles', () => {
    const menu = montarMenuPublico(
      [
        linha({ itemId: 'b', grupoId: 'G2', grupoTitulo: 'Dois', grupoOrdem: 1, paginaSlug: 'b', paginaTitulo: 'B' }),
        linha({ itemId: 'a', grupoId: 'G1', grupoTitulo: 'Um', grupoOrdem: 0, paginaSlug: 'a', paginaTitulo: 'A' }),
        linha({ itemId: 'x', grupoId: 'G3', grupoOrdem: 2, texto: 'Só agrupador', ehAgrupador: true }),
      ],
      slugReservadoVincis,
    )
    expect(menu.map(({ id }) => id)).toEqual(['G1', 'G2'])
  })

  it('schema do item: agrupador exige nome; cabeçalho é local válido', () => {
    const grupoId = UUID
    expect(schemasCms.adicionarItem.safeParse({ grupoId }).success).toBe(false)
    expect(schemasCms.adicionarItem.safeParse({ grupoId, texto: 'Serviços' }).success).toBe(true)
    expect(
      schemasCms.criarGrupo.safeParse({
        nome: 'Menu',
        tituloPublico: 'Menu',
        identificador: 'menu',
        local: 'cabecalho',
      }).success,
    ).toBe(true)
  })
})
