import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, empresas, perfisProfissionais } from '@/db/schema'
import { buscarCapacidadesUsuario } from '@/features/usuarios/queries/buscar-perfil-principal-usuario'
import {
  elegivelParaCentralFiscal,
  SEGMENTO_EMPRESA_CONTABIL,
} from '../lib/elegibilidade-fiscal'

/**
 * Elegibilidade contábil resolvida no servidor.
 *
 * Lê o cadastro real — capacidades da conta, ficha de prestador e, para o
 * Colaborador, o segmento do escritório — e aplica a política pura. É chamada
 * por `resolverAcessoDocumentosFiscais`, que é a porta única do módulo: por ali
 * passam listagem, detalhe, upload, download, revisão e reprocessamento,
 * individuais ou em lote.
 *
 * Sem `empresaId` a pergunta é "esta conta pode ver o módulo em algum lugar?",
 * que é o que o menu precisa saber; com `empresaId`, a resposta é sobre aquele
 * escritório.
 */
/**
 * O Colaborador está vinculado a algum escritório contábil (ou ao escritório
 * informado)? É o que define a área dele, já que o cadastro não lhe atribui
 * profissão regulamentada.
 */
export async function colaboradorEmEscritorioContabil(
  usuarioId: string,
  empresaId?: string | null,
): Promise<boolean> {
  const [vinculo] = await db
    .select({ segmento: empresas.segmento })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(
      and(
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.status, 'ativo'),
        eq(empresas.segmento, SEGMENTO_EMPRESA_CONTABIL),
        ...(empresaId ? [eq(empresaMembros.empresaId, empresaId)] : []),
      ),
    )
    .limit(1)
  return Boolean(vinculo)
}

export async function usuarioElegivelParaCentralFiscal(
  usuarioId: string,
  empresaId?: string | null,
): Promise<boolean> {
  const [capacidades, [cadastro]] = await Promise.all([
    buscarCapacidadesUsuario(usuarioId),
    db
      .select({
        tipoPrestador: perfisProfissionais.tipoPrestador,
        tipoProfissional: perfisProfissionais.tipoProfissional,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
      .limit(1),
  ])
  if (!capacidades) return false

  const contexto = {
    ehGestor: capacidades.ehGestor,
    tipoPrestador: cadastro?.tipoPrestador ?? null,
    tipoProfissional: cadastro?.tipoProfissional ?? null,
  }
  // Decisão que não depende do escritório: resolve sem consultar vínculo.
  if (elegivelParaCentralFiscal(contexto)) return true
  if (contexto.tipoPrestador !== 'colaborador') return false

  const contabil = await colaboradorEmEscritorioContabil(usuarioId, empresaId)
  return elegivelParaCentralFiscal({
    ...contexto,
    segmentoDoEscritorio: contabil ? SEGMENTO_EMPRESA_CONTABIL : null,
  })
}
