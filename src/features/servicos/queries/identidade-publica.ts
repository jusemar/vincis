import { modeloContratacaoPublico } from '@/features/profissionais/constants/modelo-contratacao'
import { situacaoDocumentos } from '@/features/perfil-pro/lib/perfil-pro'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { obterReputacaoDoPrestador } from '@/features/avaliacoes/queries/reputacao'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'

/**
 * Identidade pública de um prestador, para o perfil aberto por `?prestador=`.
 *
 * Exige conta ativa, verificada e cadastro habilitado — os mesmos critérios da
 * vitrine de `/profissionais`, para que ninguém apareça publicamente por uma
 * porta que a listagem não abriria.
 */
export async function obterIdentidadePublica(prestadorId: string) {
  const [prestador] = await db
    .select({
      nome: usuarios.nome,
      // O identificador que o cliente pode citar. É o mesmo que aparece no
      // card do negócio em Parceiros — um profissional, um código.
      codigoPublico: perfisProfissionais.codigoPublico,
      apresentacao: perfisProfissionais.apresentacao,
      experienciaAnos: perfisProfissionais.tempoExperiencia,
      // Campos já persistidos no cadastro, expostos aqui para o perfil público
      // parar de exibir conteúdo fixo de demonstração nos blocos de Formação,
      // Especializações, disponibilidade e avatar. Nenhum é obrigatório: quando
      // vazio, o bloco correspondente simplesmente não aparece.
      especialidades: perfisProfissionais.especialidades,
      certificacoes: perfisProfissionais.certificacoes,
      formacao: perfisProfissionais.formacao,
      instituicaoEnsino: perfisProfissionais.instituicaoEnsino,
      anoFormacao: perfisProfissionais.anoFormacao,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      cidade: perfisProfissionais.cidade,
      estado: perfisProfissionais.estado,
      disponivelAtendimento: perfisProfissionais.disponivelAtendimento,
      regimesAtendidos: perfisProfissionais.regimesAtendidos,
      avatarUrl: perfisProfissionais.avatarUrl,
      // Foto grande do perfil, independente do avatar dos cards.
      fotoDestaqueUrl: perfisProfissionais.fotoDestaqueUrl,
      valorHoraCentavos: perfisProfissionais.valorHoraCentavos,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      sobreTitulo: perfisProfissionais.sobreTitulo,
      sobreTexto: perfisProfissionais.sobreTexto,
      numeroRegistro: perfisProfissionais.numeroRegistro,
      estadoRegistro: perfisProfissionais.estadoRegistro,
      modeloContratacaoBruto: perfisProfissionais.modeloContratacao,
    })
    .from(usuarios)
    .innerJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(
      and(
        eq(usuarios.id, prestadorId),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorHabilitado(),
      ),
    )
    .limit(1)

  if (!prestador) return null

  /**
   * A nota e a quantidade vêm da agregação real das avaliações.
   *
   * Antes saíam de `perfis_profissionais.avaliacao_media` / `total_avaliacoes`,
   * duas colunas preenchidas por script de demonstração. Os nomes dos campos
   * continuam iguais para que o bloco de métricas do perfil não mude nada —
   * mesmo tamanho, mesma cor, mesma posição —, e `mediaEmDecimos` preserva a
   * convenção "valor / 10" que aquele bloco já aplicava.
   *
   * Prestador sem avaliação nenhuma volta com `null` e `0`: é o que faz a tela
   * mostrar o estado vazio em vez de afirmar uma nota que ninguém deu.
   */
  const reputacao = await obterReputacaoDoPrestador(prestadorId)
  // Perfil Essencial/Pro — só advocacia; identifica recursos, não qualidade.
  const documentos = await situacaoDocumentos(db, prestadorId)

  const { numeroRegistro, estadoRegistro, modeloContratacaoBruto, ...publico } = prestador
  return {
    ...publico,
    // Registro da OAB já salvo no cadastro (sem campo novo), para "Formação".
    registroProfissional:
      prestador.tipoProfissional === 'advocacia' ? rotuloRegistroOab(numeroRegistro, estadoRegistro) : null,
    // Mesma regra da listagem: honorário de advogado não sai para o público.
    valorHoraCentavos:
      prestador.tipoProfissional === 'advocacia' ? null : prestador.valorHoraCentavos,
    avaliacaoMedia: reputacao.mediaEmDecimos,
    perfilAdvocacia: documentos.nivel,
    // Contábil: modelo comercial só quando definido pelo gestor.
    modeloContratacao: modeloContratacaoPublico(prestador.tipoProfissional, modeloContratacaoBruto),
    totalAvaliacoes: reputacao.total,
  }
}

/**
 * "OAB/MG 123456" a partir de `numero_registro` + `estado_registro`. Número que
 * já traz a sigla (ex.: "OAB/MG 123456") sai como foi digitado, sem duplicar.
 */
export function rotuloRegistroOab(numero: string | null, estado: string | null): string | null {
  const limpo = numero?.trim()
  if (!limpo) return null
  if (/^oab\b/i.test(limpo)) return limpo
  const uf = estado?.trim().toUpperCase()
  return uf ? `OAB/${uf} ${limpo}` : `OAB ${limpo}`
}
