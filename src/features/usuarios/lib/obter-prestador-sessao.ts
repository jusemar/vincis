import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import type { TipoPrestador } from '../constants/prestador'
import { condicaoPrestadorHabilitado } from './prestador'
import { obterSessaoServidor } from './sessao-servidor'
import { tipoPrestadorDoPerfil } from './tipos-pessoa'

export type PrestadorSessao = {
  usuarioId: string
  nome: string
  /** Escritório legado gravado em `usuarios.empresa_id`. Pode ser nulo. */
  empresaId: string | null
  tipoPrestador: TipoPrestador
}

/**
 * Porta única de entrada dos prestadores no `/admin`.
 *
 * Vale para os dois tipos: Profissional (cadastro aprovado) e Colaborador
 * (cadastro ativo) — o Colaborador nunca precisa fingir aprovação de
 * habilitação técnica para atravessar aqui. O tipo gravado no cadastro precisa
 * bater com o tipo da pessoa; sem isso, trocar o perfil da conta viraria atalho
 * de acesso.
 *
 * Esta função só responde "é um prestador habilitado?". O que ele pode fazer
 * depois é decidido pelas matrizes: `permissoesCliente` para cada cliente e
 * `permissoesEscritorio` para cada escritório.
 */
export async function obterPrestadorSessao(): Promise<PrestadorSessao | null> {
  const sessao = await obterSessaoServidor()
  if (!sessao) return null

  const tipoPrestador = tipoPrestadorDoPerfil(sessao.perfilTipo)
  if (!tipoPrestador) return null

  const [prestador] = await db
    .select({
      usuarioId: usuarios.id,
      nome: usuarios.nome,
      empresaId: usuarios.empresaId,
    })
    .from(usuarios)
    .innerJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(
      and(
        eq(usuarios.id, sessao.id),
        eq(perfisProfissionais.tipoPrestador, tipoPrestador),
        condicaoPrestadorHabilitado(),
      ),
    )
    .limit(1)

  return prestador ? { ...prestador, tipoPrestador } : null
}
