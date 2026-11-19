import { caminhoDoPerfilPublico } from '@/features/perfis/constants/rotas-perfil'
import { identificacaoProfissional } from '@/features/profissionais/lib/identificacao-profissional'
import { fotoDoCard } from '@/features/profissionais/lib/vitrine-publica'
import { canalSuporteDoAtendente } from '@/features/suporte/lib/canal-suporte'
import { APRESENTACAO_EQUIPE_VINCIS } from '@/features/usuarios/constants/identidade-publica'
import type { AutorPublico } from '../types/artigo'

/**
 * Autoria pública a partir dos dados gravados — regra única para a Central,
 * a página do artigo, a prévia e a moderação.
 *
 * Ordem de decisão (nunca campo livre):
 * 1. `tipo_autoria = institucional` → "Vincis" (com responsável editorial, se houver);
 * 2. identidade pública `equipe_vincis` → equipe da plataforma: nome e foto da
 *    conta, função fixa, contato com o Suporte; profissão, especialidades,
 *    escritório e link de perfil do cadastro de prestador são **ignorados**;
 * 3. demais → profissional, com profissão, especialidade, escritório e perfil.
 */
export type DadosAutor = {
  tipoAutoria: string
  autorId: string
  autorNome: string
  identidadePublica: string | null
  avatarUrl: string | null
  fotoDestaqueUrl: string | null
  tipoProfissional: string | null
  especialidades: string[] | null
  areasAtuacao: string[] | null
  cidade: string | null
  estado: string | null
  slugPublico: string | null
  responsavelNome: string | null
  escritorioNome: string | null
}

export function montarAutorPublico(dados: DadosAutor): AutorPublico {
  if (dados.tipoAutoria === 'institucional')
    return { tipo: 'institucional', nome: 'Vincis', responsavel: dados.responsavelNome }
  const fotoUrl = fotoDoCard(dados.avatarUrl, dados.fotoDestaqueUrl)
  if (dados.identidadePublica === 'equipe_vincis')
    return {
      tipo: 'equipe',
      id: dados.autorId,
      nome: dados.autorNome,
      fotoUrl,
      funcao: APRESENTACAO_EQUIPE_VINCIS.funcao,
      identificacao: APRESENTACAO_EQUIPE_VINCIS.identificacao,
      contato: canalSuporteDoAtendente(dados.autorId),
    }
  return {
    tipo: 'profissional',
    id: dados.autorId,
    nome: dados.autorNome,
    fotoUrl,
    // Profissão da **pessoa** (autora), não do escritório.
    profissao: identificacaoProfissional(dados.tipoProfissional, false)?.rotulo ?? null,
    especialidade: dados.especialidades?.[0] ?? dados.areasAtuacao?.[0] ?? null,
    escritorio: dados.escritorioNome,
    cidade: dados.cidade,
    estado: dados.estado,
    perfilUrl: caminhoDoPerfilPublico(dados.autorId, dados.slugPublico),
  }
}
