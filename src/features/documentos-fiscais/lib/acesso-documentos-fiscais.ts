import { and, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes, documentosFiscais } from '@/db/schema'
import {
  condicaoAcessoInternoCliente,
  condicaoEscopoEscritorio,
  ehAcessoInterno,
  resolverAcessoCliente,
} from '@/features/clientes/lib/acesso-cliente'
import {
  papelDoVinculo,
  permissoesEscritorio,
  type PapelEscritorio,
} from '@/features/empresas/lib/papeis-escritorio'
import {
  listarEmpresasAdministradas,
  obterVinculoAtivo,
} from '@/features/empresas/queries/equipe'
import { possuiPermissao } from '@/features/usuarios/lib/possui-permissao'
import {
  PERMISSOES_FISCAIS_ADMINISTRATIVAS,
  type PermissaoDocumentosFiscais,
} from '../constants/permissoes'
import { usuarioElegivelParaCentralFiscal } from '../queries/elegibilidade-fiscal'

/**
 * Acesso resolvido à Central Fiscal de um escritório.
 *
 * Nasce só no servidor, a partir do usuário da sessão. `empresaId` aqui já foi
 * conferido contra o vínculo ativo — é o único valor de empresa que uma
 * consulta fiscal pode usar.
 */
export type AcessoDocumentosFiscais = {
  usuarioId: string
  empresaId: string
  papel: PapelEscritorio
  /** Proprietário ou Administrador: enxerga todos os documentos do escritório. */
  administra: boolean
  /** Escopo administrativo usado pelas regras de cliente. */
  empresasAdministradas: string[]
}

/**
 * Resolve se o usuário pode exercer `permissao` na Central Fiscal da empresa.
 *
 * Quatro condições, todas obrigatórias:
 * 1. **elegibilidade contábil** — Documentos Fiscais é módulo da atividade
 *    contábil (`lib/elegibilidade-fiscal`). Advogado e demais áreas param aqui,
 *    mesmo que tenham recebido a permissão por engano; o Gestor da plataforma é
 *    a exceção administrativa prevista pela regra de negócio;
 * 2. a permissão no RBAC da plataforma (`possuiPermissao`);
 * 3. vínculo ativo, com papel reconhecido, na empresa ativa;
 * 4. para atos administrativos (excluir, integrações), papel que administra.
 *
 * Esta é a **porta única** do módulo: listagem, detalhe, upload, download,
 * revisão e reprocessamento — individuais ou em lote — passam por aqui ou por
 * `resolverAcessoDocumentoFiscal`, que a chama. Nenhuma tela, rota ou action
 * decide acesso por conta própria.
 *
 * `empresaId` pode ter vindo do cookie de contexto ou da própria linha do
 * documento: nunca é confiado, é conferido aqui. Sem acesso, `null`.
 */
export async function resolverAcessoDocumentosFiscais(
  usuarioId: string,
  permissao: PermissaoDocumentosFiscais,
  empresaId: string,
): Promise<AcessoDocumentosFiscais | null> {
  if (!(await usuarioElegivelParaCentralFiscal(usuarioId, empresaId))) return null
  if (!(await possuiPermissao(usuarioId, permissao))) return null

  const vinculo = await obterVinculoAtivo(usuarioId, empresaId)
  const papel = papelDoVinculo(vinculo)
  if (!vinculo || !papel) return null

  const administra = permissoesEscritorio(vinculo).administrar
  if (PERMISSOES_FISCAIS_ADMINISTRATIVAS.includes(permissao) && !administra) return null

  return {
    usuarioId,
    empresaId: vinculo.empresaId,
    papel,
    administra,
    empresasAdministradas: await listarEmpresasAdministradas(usuarioId),
  }
}

/**
 * Condição de leitura de `documentos_fiscais` para listagens.
 *
 * Sempre presa à empresa do acesso. Quem administra o escritório vê todos os
 * documentos dele; os demais membros veem apenas documentos de clientes aos
 * quais têm acesso interno (proprietário do cliente ou atribuído) — a mesma
 * regra que já decide quem vê o cliente. Documento sem cliente é do escritório
 * e fica com a administração.
 *
 * É o espelho de `resolverAcessoDocumentoFiscal`: não pode existir documento
 * visível na lista e negado no detalhe, nem o contrário.
 */
export function condicaoEscopoDocumentosFiscais(acesso: AcessoDocumentosFiscais): SQL {
  const daEmpresa = eq(documentosFiscais.empresaId, acesso.empresaId)
  if (acesso.administra) return daEmpresa

  return and(
    daEmpresa,
    sql`exists (
      select 1 from clientes
      where clientes.id = ${documentosFiscais.clienteId}
        and ${condicaoAcessoInternoCliente(acesso.usuarioId, acesso.empresasAdministradas)}
    )`,
  )!
}

/**
 * Acesso a um documento específico (detalhe, download, revisão, exclusão).
 *
 * A empresa sai da linha do documento, não da requisição, e passa pela mesma
 * resolução de vínculo e permissão. Documento inexistente e documento de outro
 * escritório respondem igual: `null`.
 */
export async function resolverAcessoDocumentoFiscal(
  usuarioId: string,
  permissao: PermissaoDocumentosFiscais,
  documentoFiscalId: string,
): Promise<AcessoDocumentosFiscais | null> {
  const [documento] = await db
    .select({ empresaId: documentosFiscais.empresaId, clienteId: documentosFiscais.clienteId })
    .from(documentosFiscais)
    .where(eq(documentosFiscais.id, documentoFiscalId))
    .limit(1)
  if (!documento) return null

  const acesso = await resolverAcessoDocumentosFiscais(usuarioId, permissao, documento.empresaId)
  if (!acesso) return null
  if (acesso.administra) return acesso
  if (!documento.clienteId) return null

  const acessoCliente = await resolverAcessoCliente(usuarioId, documento.clienteId)
  return acessoCliente && ehAcessoInterno(acessoCliente.nivel) ? acesso : null
}

/**
 * O cliente pertence ao escopo do escritório?
 *
 * Guarda obrigatória de toda gravação de `documentos_fiscais.cliente_id` — o
 * banco não consegue garanti-la sozinho. `clientes.empresa_id` não é confiável
 * para isso: é copiado de `usuarios.empresa_id`, que só o Proprietário tem, então
 * cliente cadastrado por membro comum (ou antes de entrar no escritório) fica com
 * `null`. Comparar a coluna recusaria esses clientes; aceitar o `null` abriria a
 * porta para cliente de outro escritório.
 *
 * Usa a mesma regra que já define o escopo administrativo de clientes
 * (`condicaoEscopoEscritorio`): `empresa_id` do cliente, ou proprietário do
 * cliente membro ativo do escritório. Quem grava ainda precisa do próprio acesso
 * ao cliente — esta função responde só sobre o escritório.
 */
export async function clienteNoEscopoDoEscritorio(
  clienteId: string,
  empresaId: string,
): Promise<boolean> {
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), condicaoEscopoEscritorio([empresaId])))
    .limit(1)
  return Boolean(cliente)
}
