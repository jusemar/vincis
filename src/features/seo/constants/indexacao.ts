import { DADOS_INSTITUCIONAIS } from '@/features/institucional/constants/dados'

/**
 * Domínio canônico de tudo que é anunciado a buscadores.
 *
 * Fixo de propósito, e não lido de `APP_URL`: o sitemap e o robots.txt servem
 * para o Google indexar a produção, e uma homologação ou um localhost nunca
 * devem anunciar o próprio host como canônico.
 */
export const URL_CANONICA_SITE = DADOS_INSTITUCIONAIS.site

/**
 * Páginas institucionais públicas e indexáveis — rotas reais de `src/app`,
 * abertas sem sessão e sem parâmetros.
 *
 * Ficam de fora, de propósito:
 * - áreas autenticadas (`/admin`, `/cliente`, `/cadastro-*`);
 * - fluxos com token (`/confirmar-email`, `/redefinir-senha`);
 * - vitrines de demonstração (`/perfil-profissional` sem `?prestador=`,
 *   `/perfil-profissionalv3`, `/perfil-colaborador`);
 * - redirecionadores (`/profissional`, `/p/<codigo>`, `/gestao`);
 * - variações filtradas da busca (`/profissionais?area=…`).
 *
 * As páginas do CMS (`/sobre-nos`, termos, privacidade…) não entram aqui: vêm
 * do banco, só quando publicadas.
 */
export const ROTAS_INSTITUCIONAIS_INDEXAVEIS = [
  '/',
  '/profissionais',
  '/precos',
  '/como-funciona',
  '/parceiros',
  '/suporte',
  '/contato',
] as const

/** Rota do perfil público real — o único formato aceito pela página. */
export function caminhoPerfilPublico(prestadorId: string): string {
  return `/perfil-profissional?prestador=${encodeURIComponent(prestadorId)}`
}

/**
 * O que buscadores não devem rastrear.
 *
 * Só áreas privadas ou técnicas, nunca uma página pública: as autenticadas já
 * redirecionam sem sessão, e `/p/` registraria acessos de robôs como se fossem
 * visitas vindas de parceiros. Bloquear no robots não substitui a proteção do
 * servidor — é só para não gastar rastreamento nem poluir métricas.
 */
export const CAMINHOS_NAO_RASTREAVEIS = [
  '/admin',
  '/cliente',
  '/cadastro-profissional',
  '/cadastro-colaborador',
  '/gestao',
  '/confirmar-email',
  '/redefinir-senha',
  '/api/',
  '/p/',
] as const
