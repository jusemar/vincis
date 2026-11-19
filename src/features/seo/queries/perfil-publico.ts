import type { Metadata } from 'next'
import { cache } from 'react'
import { z } from 'zod'
import { perfilEhIndexavel } from '@/features/profissionais/queries/perfis-indexaveis'
import { obterIdentidadePublicaDaRequisicao } from '@/features/servicos/queries/identidade-publica'
import { METADADOS_PERFIL_NAO_INDEXAVEL, montarMetadadosPerfil } from '../lib/metadados-perfil'
import { montarDadosEstruturadosPerfil, type DadosSeoPerfil } from '../lib/perfil-publico'

const identificadorPrestador = z.string().uuid()

export type SeoDoPerfil = {
  metadados: Metadata
  /** JSON-LD; só existe para perfil indexável. */
  dadosEstruturados: ReturnType<typeof montarDadosEstruturadosPerfil> | null
}

const NAO_INDEXAVEL: SeoDoPerfil = { metadados: METADADOS_PERFIL_NAO_INDEXAVEL, dadosEstruturados: null }

/**
 * SEO do perfil aberto por `?prestador=`. Só leitura.
 *
 * A identidade vem da mesma leitura memorizada que a página usa (uma consulta
 * por requisição), e a decisão de indexar é a mesma regra do sitemap. Qualquer
 * caso fora disso — sem prestador, identificador inválido, perfil não público,
 * conta de demonstração — recebe `noindex` e nenhum dado estruturado. Falha de
 * banco também cai em `noindex`: melhor não indexar uma vez do que derrubar a
 * página por causa de metadado. Memorizada por requisição: metadata e página
 * compartilham o resultado.
 */
export const obterSeoDoPerfil = cache(async (prestadorId: string | undefined): Promise<SeoDoPerfil> => {
  if (!prestadorId || !identificadorPrestador.safeParse(prestadorId).success) return NAO_INDEXAVEL
  try {
    const [identidade, indexavel] = await Promise.all([
      obterIdentidadePublicaDaRequisicao(prestadorId),
      perfilEhIndexavel(prestadorId),
    ])
    if (!identidade || !indexavel) return NAO_INDEXAVEL

    const dados: DadosSeoPerfil = {
      prestadorId,
      slug: identidade.slugPublico,
      nome: identidade.nome,
      escritorioNome: identidade.escritorioNome,
      tipoProfissional: identidade.tipoProfissional,
      cidade: identidade.cidade,
      estado: identidade.estado,
      especialidades: identidade.especialidades,
      apresentacao: identidade.apresentacao,
      sobreTexto: identidade.sobreTexto,
      fotoDestaqueUrl: identidade.fotoDestaqueUrl,
      avatarUrl: identidade.avatarUrl,
    }
    return { metadados: montarMetadadosPerfil(dados), dadosEstruturados: montarDadosEstruturadosPerfil(dados) }
  } catch (erro) {
    console.error('[SEO_PERFIL_FALHOU]', { prestadorId, erro })
    return NAO_INDEXAVEL
  }
})
