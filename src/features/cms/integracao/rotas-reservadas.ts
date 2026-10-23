import { criarVerificadorSlugReservado } from '../nucleo/lib/slugs-reservados'

/**
 * Primeiros segmentos de URL que já pertencem à Vincis.
 *
 * As páginas do CMS vão morar em `/[slug]`, na raiz. Sem esta lista, uma página
 * chamada "admin" ou "precos" disputaria o endereço com a rota real. Entram:
 *
 * - toda pasta de primeiro nível de `src/app` (o teste `cms-nucleo` lê o disco
 *   e falha se uma rota nova nascer sem entrar aqui);
 * - toda entrada de primeiro nível de `public/`;
 * - endereços aposentados que ainda respondem com redirecionamento (`gestao`,
 *   tratado em `src/proxy.ts`).
 */
export const ROTAS_RESERVADAS_VINCIS = [
  // src/app
  'admin',
  'api',
  'cadastro-colaborador',
  'cadastro-profissional',
  'cliente',
  'como-funciona',
  'confirmar-email',
  'p',
  'parceiros',
  'perfil-colaborador',
  'perfil-profissional',
  'perfil-profissionalv3',
  'precos',
  'profissionais',
  'profissional',
  'redefinir-senha',
  'suporte',
  // public/
  'images',
  'temp',
  // legado redirecionado
  'gestao',
] as const

export const slugReservadoVincis = criarVerificadorSlugReservado(ROTAS_RESERVADAS_VINCIS)
