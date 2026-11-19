import type { Metadata } from 'next'
import { URL_CANONICA_SITE } from '@/features/seo/constants/indexacao'
import { ROTA_CONHECIMENTO, caminhoArtigo, caminhoCategoria } from '../constants/rotas'
import { nomeDoAutor } from './apresentacao'
import type { ArtigoCompleto, CategoriaPublica } from '../types/artigo'

/**
 * SEO da Central e dos artigos — funções puras.
 *
 * Só repetem o que a página mostra: título, resumo, autor real, datas reais
 * gravadas no banco, categoria, capa e as fontes informadas pelo autor.
 * Nenhuma avaliação, credencial ou data é acrescentada.
 */

const MARCA = 'Vincis'
const LIMITE_TITULO = 70
const LIMITE_DESCRICAO = 160

function absoluta(caminho: string): string {
  return new URL(caminho, URL_CANONICA_SITE).toString()
}

function encurtar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, '')}…`
}

/** Imagem para prévia de link: só `https` absoluta fora de máquina local. */
export function imagemPublicaAbsoluta(url: string | null): string | null {
  if (!url) return null
  try {
    const endereco = new URL(url)
    const local = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(endereco.hostname)
    return endereco.protocol === 'https:' && !local ? endereco.toString() : null
  } catch {
    return null
  }
}

export function tituloSeoArtigo(artigo: Pick<ArtigoCompleto, 'titulo' | 'tituloSeo'>): string {
  if (artigo.tituloSeo) return artigo.tituloSeo
  const completo = `${artigo.titulo} | ${MARCA}`
  return completo.length <= LIMITE_TITULO ? completo : encurtar(artigo.titulo, LIMITE_TITULO)
}

export function descricaoSeoArtigo(artigo: Pick<ArtigoCompleto, 'resumo' | 'descricaoSeo'>): string {
  return encurtar(artigo.descricaoSeo || artigo.resumo, LIMITE_DESCRICAO)
}

export function montarMetadadosArtigo(artigo: ArtigoCompleto): Metadata {
  const titulo = tituloSeoArtigo(artigo)
  const descricao = descricaoSeoArtigo(artigo)
  const url = absoluta(caminhoArtigo(artigo.slug))
  const imagem = imagemPublicaAbsoluta(artigo.capaUrl)
  return {
    // `absolute`: o título já traz a marca; o template do layout não repete.
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    authors: [{ name: nomeDoAutor(artigo.autor), url: artigo.autor.tipo === 'profissional' ? absoluta(artigo.autor.perfilUrl) : absoluta('/') }],
    openGraph: {
      type: 'article',
      title: titulo,
      description: descricao,
      url,
      siteName: MARCA,
      locale: 'pt_BR',
      publishedTime: artigo.publicadoEm.toISOString(),
      modifiedTime: artigo.atualizadoEm.toISOString(),
      ...(artigo.categoria ? { section: artigo.categoria.nome } : {}),
      authors: [artigo.autor.tipo === 'profissional' ? absoluta(artigo.autor.perfilUrl) : MARCA],
      ...(imagem ? { images: [{ url: imagem, alt: artigo.capaAlt ?? artigo.titulo }] } : {}),
    },
    twitter: {
      card: imagem ? 'summary_large_image' : 'summary',
      title: titulo,
      description: descricao,
      ...(imagem ? { images: [imagem] } : {}),
    },
  }
}

/** JSON-LD: BlogPosting + BreadcrumbList (a mesma trilha desenhada na página). */
export function montarDadosEstruturadosArtigo(artigo: ArtigoCompleto) {
  const url = absoluta(caminhoArtigo(artigo.slug))
  const imagem = imagemPublicaAbsoluta(artigo.capaUrl)
  const publisher = { '@type': 'Organization', name: MARCA, url: `${URL_CANONICA_SITE}/` }
  const autor =
    artigo.autor.tipo === 'profissional'
      ? {
          '@type': 'Person',
          name: artigo.autor.nome,
          url: absoluta(artigo.autor.perfilUrl),
          ...(artigo.autor.profissao ? { jobTitle: artigo.autor.profissao } : {}),
          ...(artigo.autor.fotoUrl && imagemPublicaAbsoluta(artigo.autor.fotoUrl)
            ? { image: imagemPublicaAbsoluta(artigo.autor.fotoUrl) }
            : {}),
        }
      : artigo.autor.tipo === 'equipe'
        ? {
            // Equipe da plataforma: função real, sem perfil profissional.
            '@type': 'Person',
            name: artigo.autor.nome,
            jobTitle: artigo.autor.funcao,
            worksFor: publisher,
            ...(imagemPublicaAbsoluta(artigo.autor.fotoUrl) ? { image: imagemPublicaAbsoluta(artigo.autor.fotoUrl) } : {}),
          }
        : artigo.autor.responsavel
          ? { '@type': 'Person', name: artigo.autor.responsavel, worksFor: publisher }
          : publisher
  const trilha = [
    { name: 'Início', item: `${URL_CANONICA_SITE}/` },
    { name: 'Conhecimento', item: absoluta(ROTA_CONHECIMENTO) },
    ...(artigo.categoria ? [{ name: artigo.categoria.nome, item: absoluta(caminhoCategoria(artigo.categoria.slug)) }] : []),
    { name: artigo.titulo, item: url },
  ]
  const citacoes = artigo.fontes.map((fonte) => (fonte.url ? { '@type': 'CreativeWork', name: fonte.titulo, url: fonte.url } : fonte.titulo))
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#artigo`,
        headline: artigo.titulo.slice(0, 110),
        description: descricaoSeoArtigo(artigo),
        url,
        mainEntityOfPage: url,
        inLanguage: 'pt-BR',
        datePublished: artigo.publicadoEm.toISOString(),
        dateModified: artigo.atualizadoEm.toISOString(),
        author: autor,
        publisher,
        ...(artigo.categoria ? { articleSection: artigo.categoria.nome } : {}),
        ...(imagem ? { image: imagem } : {}),
        ...(citacoes.length ? { citation: citacoes } : {}),
        // `keywords` do schema.org descreve o conteúdo; não há <meta keywords>.
        ...(artigo.palavrasChave.length ? { keywords: artigo.palavrasChave.join(', ') } : {}),
        isPartOf: { '@type': 'Blog', name: 'Central de Conhecimento Vincis', url: absoluta(ROTA_CONHECIMENTO) },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: trilha.map((item, indice) => ({ '@type': 'ListItem', position: indice + 1, ...item })),
      },
    ],
  }
}

/**
 * Metadados da Central. Busca livre não vai ao índice (combinações infinitas);
 * categoria e paginação vão, cada uma com canonical própria.
 */
export function montarMetadadosCentral(filtros: {
  categoria: CategoriaPublica | null
  busca?: string
  pagina: number
}): Metadata {
  const base = filtros.categoria
    ? `${filtros.categoria.nome} | Central de Conhecimento ${MARCA}`
    : `Central de Conhecimento | ${MARCA}`
  const titulo = filtros.pagina > 1 ? `${base} – página ${filtros.pagina}` : base
  const descricao = filtros.categoria?.descricao
    ? encurtar(`${filtros.categoria.descricao} Artigos de contadores, advogados e da equipe Vincis.`, LIMITE_DESCRICAO)
    : 'Artigos sobre MEI, Imposto de Renda, Reforma Tributária, Simples Nacional, direito empresarial e gestão, escritos por profissionais da Vincis.'
  const parametros = new URLSearchParams()
  if (filtros.categoria) parametros.set('categoria', filtros.categoria.slug)
  if (filtros.pagina > 1) parametros.set('pagina', String(filtros.pagina))
  const canonical = absoluta(`${ROTA_CONHECIMENTO}${parametros.size ? `?${parametros}` : ''}`)
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical },
    robots: filtros.busca ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: 'website', title: titulo, description: descricao, url: canonical, siteName: MARCA, locale: 'pt_BR' },
    twitter: { card: 'summary', title: titulo, description: descricao },
  }
}

