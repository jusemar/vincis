import { gerarIdentificador } from '@/features/cms/nucleo/lib/identificador'
import { SLUGS_RESERVADOS_ARTIGO } from '../constants/rotas'

/** Formato aceito na rota pública `/conhecimento/<slug>`. */
export const PADRAO_SLUG_ARTIGO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const TAMANHO_MAXIMO_SLUG_ARTIGO = 140

/**
 * Base do slug a partir do título. Mesma normalização dos identificadores do
 * CMS (sem acentos, `a-z0-9-`). Reservados e vazios ganham prefixo `artigo-`.
 */
export function montarBaseSlugArtigo(titulo: string): string {
  const base = gerarIdentificador(titulo).slice(0, TAMANHO_MAXIMO_SLUG_ARTIGO).replace(/-+$/g, '')
  if (!base) return 'artigo'
  return SLUGS_RESERVADOS_ARTIGO.has(base) ? `artigo-${base}` : base
}

export function escolherSlugArtigoLivre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base
  for (let numero = 2; ; numero += 1) {
    const sufixo = `-${numero}`
    const candidato = `${base.slice(0, TAMANHO_MAXIMO_SLUG_ARTIGO - sufixo.length).replace(/-+$/g, '')}${sufixo}`
    if (!ocupados.has(candidato)) return candidato
  }
}

/**
 * Normaliza o que a pessoa digita no campo "URL amigável": mesma conversão do
 * título (minúsculas, sem acentos, hífens). Não aplica prefixo de reservado —
 * aí a validação avisa, em vez de trocar a URL escolhida em silêncio.
 */
export function normalizarSlugArtigo(texto: string): string {
  return gerarIdentificador(texto).slice(0, TAMANHO_MAXIMO_SLUG_ARTIGO).replace(/-+$/g, '')
}

/** Motivo de recusa de um slug escolhido, ou `null` quando é válido. */
export function motivoSlugInvalido(slug: string): string | null {
  if (slug.length < 3) return 'Use pelo menos 3 caracteres.'
  if (slug.length > TAMANHO_MAXIMO_SLUG_ARTIGO) return `Use no máximo ${TAMANHO_MAXIMO_SLUG_ARTIGO} caracteres.`
  if (!PADRAO_SLUG_ARTIGO.test(slug)) return 'Use apenas letras minúsculas, números e hífens.'
  if (SLUGS_RESERVADOS_ARTIGO.has(slug)) return 'Este endereço é reservado pela Vincis. Escolha outro.'
  return null
}
