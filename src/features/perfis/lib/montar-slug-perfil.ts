import { gerarIdentificador } from '@/features/cms/nucleo/lib/identificador'
import { nomeCompletoDoEscritorio } from '@/features/empresas/lib/titulo-escritorio'

/**
 * Regras puras do slug do perfil público (`/profissionais/<slug>`).
 *
 * Formato: `<nome público>-<área>-<cidade>` — por exemplo
 * `mariana-lopes-contabilidade-belo-horizonte` ou
 * `escritorio-alfa-contabilidade-sao-paulo`.
 *
 * - Nome público: o do escritório como o perfil o apresenta ("Escritório Alfa")
 *   quando a pessoa atua como escritório; senão o nome da pessoa, sem
 *   tratamento ("Dr.", "Dra.").
 * - Área: substantivo neutro da profissão ("contabilidade", "advocacia",
 *   "assistente-contabil"), e não "contador/contadora": o cadastro não guarda
 *   gênero, e o slug não pode presumir um.
 * - Cidade do cadastro.
 *
 * Acentos e caracteres especiais saem pela mesma função de identificadores do
 * CMS (NFD + só `a-z0-9-`). Unicidade é resolvida por quem grava, com sufixo
 * numérico (`-2`, `-3`…).
 */
export const TAMANHO_MAXIMO_SLUG_PERFIL = 150

const AREA_POR_TIPO: Record<string, string> = {
  contabilidade: 'contabilidade',
  advocacia: 'advocacia',
  colaborador: 'assistente-contabil',
  especialista_fiscal: 'especialista-fiscal',
}

const TRATAMENTOS = /^(dr|dra|sr|sra)\.?\s+/i

export type DadosSlugPerfil = {
  nome: string
  escritorioNome: string | null
  tipoProfissional: string | null
  cidade: string | null
}

function cortar(texto: string, limite: number): string {
  return texto.slice(0, limite).replace(/-+$/g, '')
}

export function montarBaseSlugPerfil(dados: DadosSlugPerfil): string {
  const nomePublico = dados.escritorioNome ? nomeCompletoDoEscritorio(dados.escritorioNome) : dados.nome
  const nome = gerarIdentificador(nomePublico.trim().replace(TRATAMENTOS, ''))
  const area = dados.tipoProfissional ? AREA_POR_TIPO[dados.tipoProfissional] ?? '' : ''
  const cidade = gerarIdentificador(dados.cidade ?? '')
  const partes = [cortar(nome, 80), area, cortar(cidade, 50)].filter(Boolean)
  const base = cortar(partes.join('-'), TAMANHO_MAXIMO_SLUG_PERFIL)
  // Nome feito só de símbolos: ainda assim um endereço válido e estável.
  return base || 'perfil'
}

/** Primeiro candidato livre: `base`, `base-2`, `base-3`… */
export function escolherSlugLivre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base
  for (let numero = 2; ; numero += 1) {
    const candidato = `${cortar(base, TAMANHO_MAXIMO_SLUG_PERFIL - String(numero).length - 1)}-${numero}`
    if (!ocupados.has(candidato)) return candidato
  }
}

/** Formato aceito na rota pública — o mesmo dos identificadores do CMS. */
export const PADRAO_SLUG_PERFIL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
