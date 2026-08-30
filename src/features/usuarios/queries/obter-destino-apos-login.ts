import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import {
  ROTA_CADASTRO_PRESTADOR,
  type TipoPrestador,
} from '../constants/prestador'
import { prestadorHabilitado, tipoPrestadorDoPerfil } from '../lib/prestador'
import { contaVerificada } from '../lib/verificacao-conta'
import type { PerfilTipo } from '../types'
import { buscarCapacidadesUsuario } from './buscar-perfil-principal-usuario'

export type AcessoUsuario = {
  /** O que a pessoa exerce: prestador ou cliente. Nunca `gestor_vincis`. */
  perfil: PerfilTipo
  /**
   * Administra a plataforma. É uma capacidade **somada** ao perfil, não um
   * substituto dele: o Gestor continua sendo Profissional, dono do próprio
   * escritório e Cliente quando o fluxo permitir.
   */
  ehGestor: boolean
  /** Tipo de prestador da pessoa; `null` para quem não presta serviço. */
  tipoPrestador: TipoPrestador | null
  /** Onde a pessoa cai ao entrar. Não é a única área que ela pode abrir. */
  destino: string
  /**
   * Áreas protegidas que esta conta pode abrir. O destino é a primeira; o
   * Gestor acumula `/admin` (a Gestão da Plataforma vive lá) e `/cliente`
   * (administrar a Vincis não tira dele o direito de contratar).
   */
  areasPermitidas: string[]
  /** Situação do cadastro de prestador, quando existir. */
  statusProfissional: string | null
  /** O cadastro de prestador está completo e habilitado a operar. */
  habilitado: boolean
}

/**
 * Resolução central de acesso. É o único lugar que decide para onde cada pessoa
 * vai — o middleware, as páginas e a sessão do servidor consultam esta função
 * em vez de repetir a regra.
 *
 * - Profissional habilitado → /admin
 * - Profissional pendente   → /cadastro-profissional
 * - Colaborador habilitado  → /admin
 * - Colaborador pendente    → /cadastro-colaborador
 * - Cliente                 → /cliente
 *
 * Ser Gestor da Plataforma **não muda** nenhuma dessas linhas: ela não é uma
 * sexta persona, é uma permissão que se soma. Um Gestor que também é
 * Profissional cai no painel dele; um Gestor sem cadastro de prestador cai em
 * `/admin`, porque é lá que a Gestão da Plataforma vive. Em qualquer dos casos
 * `areasPermitidas` guarda o que mais aquela conta alcança.
 */
export async function resolverAcessoUsuario(
  usuarioId: string,
): Promise<AcessoUsuario | null> {
  const [usuario] = await db
    .select({
      status: usuarios.status,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
    })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  // A porta é a identidade comprovada, não o canal usado para comprová-la:
  // vale o clique no e-mail ou a confirmação da Gestão pelo WhatsApp.
  if (!usuario || usuario.status !== 'ativo' || !contaVerificada(usuario))
    return null

  const { perfilOperacional: perfil, ehGestor } =
    await buscarCapacidadesUsuario(usuarioId)

  /**
   * O Gestor alcança o painel e a área do Cliente além do próprio destino.
   * Esconder isso do middleware faria a Gestão da Plataforma ficar inacessível
   * para um Gestor cujo cadastro de prestador ainda estivesse em análise.
   */
  const areasDoGestor = ehGestor ? ['/admin', '/cliente'] : []
  const montar = (acesso: Omit<AcessoUsuario, 'areasPermitidas'>) => ({
    ...acesso,
    areasPermitidas: [...new Set([acesso.destino, ...areasDoGestor])],
  })

  const tipoPrestador = tipoPrestadorDoPerfil(perfil)

  // Cliente tem área própria, separada do painel do prestador. Quem não presta
  // serviço entra por lá — a não ser que administre a plataforma, e aí o
  // destino é o painel, onde a Gestão vive.
  if (!tipoPrestador) {
    return montar({
      perfil,
      ehGestor,
      tipoPrestador: null,
      destino: ehGestor ? '/admin' : '/cliente',
      statusProfissional: null,
      habilitado: false,
    })
  }

  const [cadastro] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      statusAnalise: perfisProfissionais.statusAnalise,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1)

  // Um cadastro gravado com tipo diferente do tipo da pessoa não habilita
  // ninguém: sem isso, trocar o perfil da conta viraria um atalho de acesso.
  const habilitado =
    cadastro?.tipoPrestador === tipoPrestador && prestadorHabilitado(cadastro)

  return montar({
    perfil,
    ehGestor,
    tipoPrestador,
    // Cadastro pendente leva ao cadastro, inclusive para o Gestor: ele precisa
    // conseguir completá-lo para atuar como profissional. O acesso à Gestão da
    // Plataforma não se perde por isso — está em `areasPermitidas`.
    destino: habilitado ? '/admin' : ROTA_CADASTRO_PRESTADOR[tipoPrestador],
    statusProfissional: cadastro?.statusAnalise ?? null,
    habilitado,
  })
}

export async function obterDestinoAposLogin(usuarioId: string) {
  return (await resolverAcessoUsuario(usuarioId))?.destino ?? '/'
}
