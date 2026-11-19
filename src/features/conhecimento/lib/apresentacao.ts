import {
  ROTA_BUSCA_CONTABILIDADE,
  ROTA_BUSCA_JURIDICA,
} from '@/features/institucional/constants/rotas'
import type { AutorPublico, CategoriaPublica } from '../types/artigo'

/** Regras de apresentação puras (cliente e servidor). */

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

export function formatarData(data: Date): string {
  return FORMATO_DATA.format(data)
}

/** Mesmo dia (no fuso de Brasília)? Evita "Atualizado em" igual à publicação. */
export function mesmoDia(a: Date, b: Date): boolean {
  return formatarData(a) === formatarData(b)
}

/**
 * Chamada de conversão do artigo — só para rotas e filtros **reais** da busca.
 * A categoria diz a área; sem área, a busca abre sem filtro. Nunca promete
 * serviço ou disponibilidade: leva à vitrine, onde o visitante vê o que existe.
 */
export function chamadaDeConversao(categoria: CategoriaPublica | null): { texto: string; rota: string } {
  const rota =
    categoria?.areaBusca === 'contabilidade'
      ? ROTA_BUSCA_CONTABILIDADE
      : categoria?.areaBusca === 'advocacia'
        ? ROTA_BUSCA_JURIDICA
        : '/profissionais'
  return {
    texto: categoria?.chamadaConversao ?? 'Precisa de ajuda com este assunto? Encontre um profissional na Vincis.',
    rota,
  }
}

/** Nome exibido do autor numa linha ("Mariana Lopes" / "Vincis"). */
export function nomeDoAutor(autor: AutorPublico): string {
  return autor.tipo === 'institucional' ? 'Vincis' : autor.nome
}

/** Linha de apoio ("Contador · Imposto de Renda" / "Equipe editorial"). */
export function descricaoDoAutor(autor: AutorPublico): string {
  if (autor.tipo === 'equipe') return autor.funcao
  if (autor.tipo === 'institucional')
    return autor.responsavel ? `Responsável editorial: ${autor.responsavel}` : 'Conteúdo institucional'
  return [autor.profissao, autor.especialidade].filter(Boolean).join(' · ')
}

/** Linha extra de identificação (equipe Vincis: "Equipe Vincis · Suporte e Gestão"). */
export function identificacaoDoAutor(autor: AutorPublico): string | null {
  if (autor.tipo === 'equipe') return autor.identificacao
  if (autor.tipo === 'profissional') {
    const local = autor.cidade && autor.estado ? `${autor.cidade}/${autor.estado}` : null
    return [autor.escritorio, local].filter(Boolean).join(' · ') || null
  }
  return null
}

export function iniciais(nome: string): string {
  const partes = nome.replace(/^(dr|dra)\.?\s+/i, '').trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || 'V'
}
