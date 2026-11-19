import type { NoConteudo } from '../lib/conteudo/schema-conteudo'
import type { CanalSuporte } from '@/features/suporte/lib/canal-suporte'
import type { FonteArtigo } from '@/db/tables/conhecimento_artigo_versoes/tabela'
import type { SituacaoEditorial, StatusPublicacao, StatusVersao } from '../constants/status'

export type { FonteArtigo }

/**
 * Autoria como o público vê. Montada **sempre** no servidor a partir da
 * identidade gravada (`autor_id`, `tipo_autoria`) e do cadastro público — não
 * existe campo livre de autor em lugar nenhum.
 */
export type AutorPublico =
  | {
      tipo: 'profissional'
      id: string
      nome: string
      fotoUrl: string | null
      /** "Contador", "Advogado", "Assistente Contábil"… */
      profissao: string | null
      especialidade: string | null
      escritorio: string | null
      cidade: string | null
      estado: string | null
      perfilUrl: string
    }
  | {
      /**
       * Integrante da equipe Vincis (identidade pública `equipe_vincis`): nome e
       * foto reais, função fixa da plataforma e contato com o Suporte — nunca
       * profissão, escritório ou perfil herdados do cadastro de prestador.
       */
      tipo: 'equipe'
      id: string
      nome: string
      fotoUrl: string | null
      funcao: string
      identificacao: string
      contato: CanalSuporte
    }
  | {
      tipo: 'institucional'
      nome: 'Vincis'
      /** Gestor que assina como responsável editorial; nulo = só "Vincis". */
      responsavel: string | null
    }

export type CategoriaPublica = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  areaBusca: 'contabilidade' | 'advocacia' | null
  chamadaConversao: string | null
}

export type CardArtigo = {
  id: string
  slug: string
  titulo: string
  resumo: string
  capaUrl: string | null
  capaAlt: string | null
  categoria: Pick<CategoriaPublica, 'nome' | 'slug'> | null
  autor: AutorPublico
  publicadoEm: Date
  atualizadoEm: Date
  destaque: boolean
}

export type ArtigoCompleto = CardArtigo & {
  conteudo: NoConteudo
  fontes: FonteArtigo[]
  /** Organização editorial e busca interna (não viram meta keywords). */
  palavrasChave: string[]
  tituloSeo: string | null
  descricaoSeo: string | null
  categoriaCompleta: CategoriaPublica | null
  minutosLeitura: number
}

/** Linha do painel do autor e da Gestão. */
export type ResumoArtigoGestao = {
  id: string
  slug: string
  titulo: string
  situacao: SituacaoEditorial
  statusPublicacao: StatusPublicacao
  versaoAbertaStatus: StatusVersao | null
  revisaoEmAndamento: boolean
  categoria: string | null
  tipoAutoria: 'profissional' | 'institucional'
  autorNome: string
  destaque: boolean
  enviadaEm: Date | null
  publicadoEm: Date | null
  atualizadoEm: Date
}

export type DecisaoHistorico = {
  id: string
  acao: string
  observacao: string | null
  executorNome: string | null
  criadoEm: Date
}
