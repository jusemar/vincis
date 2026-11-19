import { and, isNull, sql, type SQL } from 'drizzle-orm'
import { perfisProfissionais } from '@/db/schema'
import { condicaoIdentidadePessoal } from '@/features/usuarios/lib/identidade-publica'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'

/**
 * Quem aparece na **vitrine pública** — regra única.
 *
 * Vitrine = busca de `/profissionais`, filtro de localizações, demonstração da
 * Home, sitemap e índice dos buscadores. O perfil em si continua abrindo por
 * link direto (`identidade-publica`), para que atendimentos, agendamentos,
 * contratações e links compartilhados não quebrem; ele só deixa de ser
 * anunciado.
 *
 * Quatro condições, todas no banco (a consulta precisa juntar `usuarios`):
 * 1. prestador público (profissional habilitado ou colaborador com vitrine);
 * 2. não ocultado pela Gestão (`oculto_vitrine_em` nulo — perfis de teste);
 * 3. com foto pública válida: a foto dos cards (`avatar_url`) ou, na falta
 *    dela, a imagem grande do perfil (`foto_destaque_url`). Para escritórios a
 *    foto do card é o logotipo enviado pelo responsável — a Vincis não tem uma
 *    coluna de logo separada, e o upload já aceita qualquer imagem pública;
 * 4. identidade pública `pessoal`: a equipe Vincis (Gestor que também testa os
 *    fluxos de prestador) não é anunciada como profissional — sem perder
 *    nenhuma permissão, que vem de outro lugar.
 *
 * Nenhum registro é apagado por esta regra.
 */

/**
 * Formato aceito como foto pública: caminho interno (`/api/armazenamento-local/…`
 * no localhost, `/images/…`) ou endereço `https://`. Texto vazio, `http://` e
 * `//host` ficam de fora — não são imagem utilizável por um visitante.
 */
const PADRAO_FOTO_PUBLICA = '^(https://[^\\s]+|/[^/\\s][^\\s]*)$'

/** Versão TypeScript da mesma regra, para quem já tem as URLs em mãos. */
export function ehFotoPublicaValida(url: string | null | undefined): boolean {
  const limpa = url?.trim()
  return Boolean(limpa && new RegExp(PADRAO_FOTO_PUBLICA).test(limpa))
}

/** A foto que o card deve usar: avatar, ou a imagem do perfil quando não há avatar. */
export function fotoDoCard(avatarUrl: string | null, fotoDestaqueUrl: string | null): string | null {
  if (ehFotoPublicaValida(avatarUrl)) return avatarUrl!.trim()
  if (ehFotoPublicaValida(fotoDestaqueUrl)) return fotoDestaqueUrl!.trim()
  return null
}

export function condicaoTemFotoPublica(): SQL {
  return sql`(coalesce(btrim(${perfisProfissionais.avatarUrl}), '') ~ ${PADRAO_FOTO_PUBLICA}
    or coalesce(btrim(${perfisProfissionais.fotoDestaqueUrl}), '') ~ ${PADRAO_FOTO_PUBLICA})`
}

export function condicaoNaoOcultoDaVitrine(): SQL {
  return isNull(perfisProfissionais.ocultoVitrineEm)
}

/**
 * Prestador público + não ocultado + com foto + identidade pessoal.
 * Combine com conta ativa e verificada. Exige `usuarios` na consulta.
 */
export function condicaoVitrinePublica(): SQL {
  return and(
    condicaoPrestadorPublico(),
    condicaoNaoOcultoDaVitrine(),
    condicaoTemFotoPublica(),
    condicaoIdentidadePessoal(),
  ) as SQL
}
