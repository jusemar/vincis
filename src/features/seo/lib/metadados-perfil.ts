import type { Metadata } from 'next'
import {
  imagemPublicaPerfil,
  montarDescricaoPerfil,
  montarTituloPerfil,
  urlCanonicaPerfil,
  type DadosSeoPerfil,
} from './perfil-publico'

/**
 * Página que abre, mas não deve ir para o índice: a vitrine de demonstração
 * (sem `?prestador=`), um `?prestador=` que não é perfil público e as contas
 * de demonstração. `follow` continua liberado — os links do cabeçalho e do
 * rodapé seguem sendo rastreáveis.
 */
export const METADADOS_PERFIL_NAO_INDEXAVEL: Metadata = {
  robots: { index: false, follow: true },
}

/**
 * Metadados de um perfil indexável: título, descrição, canonical, Open Graph e
 * Twitter Card individuais. A canonical consolida qualquer variação do mesmo
 * perfil (parâmetros extras, chegada por `/p/<codigo>`) num único endereço.
 */
export function montarMetadadosPerfil(dados: DadosSeoPerfil): Metadata {
  const titulo = montarTituloPerfil(dados)
  const descricao = montarDescricaoPerfil(dados)
  const url = urlCanonicaPerfil(dados.prestadorId, dados.slug)
  const imagem = imagemPublicaPerfil(dados)
  const nomeImagem = dados.escritorioNome ?? dados.nome

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: dados.escritorioNome ? 'website' : 'profile',
      title: titulo,
      description: descricao,
      url,
      siteName: 'Vincis',
      locale: 'pt_BR',
      ...(imagem ? { images: [{ url: imagem, alt: nomeImagem }] } : {}),
    },
    twitter: {
      card: imagem ? 'summary_large_image' : 'summary',
      title: titulo,
      description: descricao,
      ...(imagem ? { images: [imagem] } : {}),
    },
  }
}
