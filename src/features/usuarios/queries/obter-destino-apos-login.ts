import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { ehGestorPlataforma } from '../lib/gestor-plataforma'
import {
  ROTA_CADASTRO_PRESTADOR,
  type TipoPrestador,
} from '../constants/prestador'
import { prestadorHabilitado, tipoPrestadorDoPerfil } from '../lib/prestador'
import { contaVerificada } from '../lib/verificacao-conta'
import type { PerfilTipo } from '../types'
import { buscarPerfilPrincipalUsuario } from './buscar-perfil-principal-usuario'

export type AcessoUsuario = {
  perfil: PerfilTipo
  /** Tipo de prestador da pessoa; `null` para cliente e gestor da Vincis. */
  tipoPrestador: TipoPrestador | null
  destino: string
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
 * - Gestor Vincis          → /admin (área administrativa unificada)
 * - Profissional habilitado → /admin
 * - Profissional pendente   → /cadastro-profissional
 * - Colaborador habilitado  → /admin
 * - Colaborador pendente    → /cadastro-colaborador
 * - Cliente                 → home (o portal do cliente ainda não existe)
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

  const perfil = await buscarPerfilPrincipalUsuario(usuarioId)
  if (ehGestorPlataforma(perfil)) {
    return {
      perfil,
      tipoPrestador: null,
      destino: '/admin',
      statusProfissional: null,
      habilitado: false,
    }
  }

  const tipoPrestador = tipoPrestadorDoPerfil(perfil)

  // Cliente tem área própria, separada do painel do prestador. Quem não é
  // prestador nem gestor entra por aqui — nunca no `/admin`.
  if (!tipoPrestador) {
    return {
      perfil,
      tipoPrestador: null,
      destino: '/cliente',
      statusProfissional: null,
      habilitado: false,
    }
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

  return {
    perfil,
    tipoPrestador,
    destino: habilitado ? '/admin' : ROTA_CADASTRO_PRESTADOR[tipoPrestador],
    statusProfissional: cadastro?.statusAnalise ?? null,
    habilitado,
  }
}

export async function obterDestinoAposLogin(usuarioId: string) {
  return (await resolverAcessoUsuario(usuarioId))?.destino ?? '/'
}
