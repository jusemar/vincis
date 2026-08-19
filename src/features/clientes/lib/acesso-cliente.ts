import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clienteAtribuicoes,
  clientes,
  colaboracoesCliente,
  empresaMembros,
} from '@/db/schema'
import {
  listarEmpresasAdministradas,
  obterVinculoAtivo,
} from '@/features/empresas/queries/equipe'
import { permissoesEscritorio } from '@/features/empresas/lib/papeis-escritorio'
import {
  permissoesDoNivel,
  type NivelAcessoCliente,
  type PermissoesCliente,
} from './permissoes-cliente'

export { listarEmpresasAdministradas }

// A matriz em si é pura e vive em `permissoes-cliente.ts`, para que a interface
// use a mesma tabela sem arrastar o Drizzle para o bundle do navegador.
export {
  PERMISSOES_POR_NIVEL,
  SEM_PERMISSAO_CLIENTE,
  ehAcessoInterno,
  permissoesDoNivel,
  type NivelAcessoCliente,
  type PermissoesCliente,
} from './permissoes-cliente'

export type AcessoCliente = {
  clienteId: string
  proprietarioId: string
  empresaId: string | null
  nivel: NivelAcessoCliente
}

/** Permissões do acesso resolvido. Sem acesso, nenhuma permissão. */
export function permissoesCliente(
  acesso: AcessoCliente | null,
): PermissoesCliente {
  return permissoesDoNivel(acesso?.nivel ?? null)
}

/**
 * Cliente pertencente ao escopo administrativo de um dos escritórios.
 *
 * Dois ramos porque `clientes.empresa_id` só é gravado na criação: um cliente
 * cadastrado antes de o profissional entrar no escritório fica com `null` para
 * sempre. O segundo ramo — proprietário do cliente é membro ativo do escritório
 * — é o mesmo critério que `alterarAtribuicaoCliente` já usava, e evita uma
 * migration de backfill.
 */
export function condicaoEscopoEscritorio(empresasAdministradas: string[]): SQL {
  if (!empresasAdministradas.length) return sql`false`
  return sql`(${inArray(clientes.empresaId, empresasAdministradas)} or ${condicaoDonoMembroDe(
    empresasAdministradas,
  )})`
}

/** O proprietário do cliente é membro ativo de um dos escritórios informados. */
function condicaoDonoMembroDe(empresaIds: string[]): SQL {
  // Cada id vira um parâmetro próprio: um array ligado a um único placeholder
  // chegaria ao Postgres como texto e quebraria a conversão para uuid[].
  const lista = sql.join(
    empresaIds.map((id) => sql`${id}`),
    sql`, `,
  )
  return sql`exists (
    select 1 from empresa_membros em
    where em.usuario_id = ${clientes.profissionalId}
      and em.status = 'ativo'
      and em.empresa_id in (${lista})
  )`
}

/** Proprietário do cliente. */
function condicaoProprietario(usuarioId: string): SQL {
  return sql`${clientes.profissionalId} = ${usuarioId}`
}

/** Atribuição interna concedida pela administração do escritório. */
function condicaoAtribuido(usuarioId: string): SQL {
  return sql`exists (
    select 1 from cliente_atribuicoes ca
    where ca.cliente_id = ${clientes.id} and ca.profissional_id = ${usuarioId}
  )`
}

/**
 * Existe colaboração externa aceita e não revogada deste usuário no cliente.
 * Usada também para marcar a origem do acesso na interface.
 */
export function condicaoColaboracaoAtiva(usuarioId: string): SQL {
  return sql`exists (
    select 1 from colaboracoes_cliente cc
    where cc.cliente_id = ${clientes.id}
      and cc.destinatario_id = ${usuarioId}
      and cc.status = 'aceito'
      and cc.revogado_em is null
  )`
}

/**
 * Acesso interno: proprietário do cliente, administrador do escritório ao qual
 * o cliente pertence, ou membro com o cliente atribuído. Colaboração externa
 * não entra aqui — ela concede leitura, não responsabilidade sobre o cliente.
 */
export function condicaoAcessoInternoCliente(
  usuarioId: string,
  empresasAdministradas: string[],
): SQL {
  return sql`(${or(
    condicaoProprietario(usuarioId),
    condicaoAtribuido(usuarioId),
    condicaoEscopoEscritorio(empresasAdministradas),
  )})`
}

/**
 * Condição de leitura de clientes usada por TODAS as listagens e pelo detalhe.
 *
 * É o mesmo predicado que `resolverAcessoCliente` avalia linha a linha, de modo
 * que não pode existir cliente invisível na lista mas alcançável por ação — nem
 * o contrário. A revogação de colaboração surte efeito imediato porque a
 * condição é reavaliada a cada consulta.
 */
export function condicaoAcessoCliente(
  usuarioId: string,
  empresasAdministradas: string[],
): SQL {
  return sql`(${or(
    condicaoAcessoInternoCliente(usuarioId, empresasAdministradas),
    condicaoColaboracaoAtiva(usuarioId),
  )})`
}

/**
 * Nível de acesso calculado como coluna, na mesma ordem de precedência de
 * `resolverAcessoCliente`. Permite que a listagem devolva as permissões reais de
 * cada linha sem uma consulta por cliente — e garante que a lista e o detalhe
 * concordem, já que ambos derivam da mesma tabela `PERMISSOES_POR_NIVEL`.
 */
export function colunaNivelAcesso(
  usuarioId: string,
  empresasAdministradas: string[],
) {
  return sql<NivelAcessoCliente>`case
    when ${condicaoProprietario(usuarioId)} then 'proprietario'
    when ${condicaoEscopoEscritorio(empresasAdministradas)} then 'escritorio_admin'
    when ${condicaoAtribuido(usuarioId)} then 'atribuido'
    else 'colaborador_externo'
  end`
}

/**
 * Resolve, no servidor, qual é o acesso real do usuário ao cliente.
 * Retorna null quando não existe nenhum acesso — nunca confiar na interface.
 */
export async function resolverAcessoCliente(
  usuarioId: string,
  clienteId: string,
): Promise<AcessoCliente | null> {
  const [cliente] = await db
    .select({
      id: clientes.id,
      proprietarioId: clientes.profissionalId,
      empresaId: clientes.empresaId,
    })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1)

  if (!cliente) return null

  const base = {
    clienteId: cliente.id,
    proprietarioId: cliente.proprietarioId,
    empresaId: cliente.empresaId,
  }

  if (cliente.proprietarioId === usuarioId) {
    return { ...base, nivel: 'proprietario' }
  }

  // Escopo administrativo: pelo `empresa_id` do cliente quando existir, e pelos
  // escritórios do proprietário quando o cliente for anterior ao vínculo.
  if (await administraOCliente(usuarioId, cliente)) {
    return { ...base, nivel: 'escritorio_admin' }
  }

  const [atribuicao] = await db
    .select({ id: clienteAtribuicoes.id })
    .from(clienteAtribuicoes)
    .where(
      and(
        eq(clienteAtribuicoes.clienteId, cliente.id),
        eq(clienteAtribuicoes.profissionalId, usuarioId),
      ),
    )
    .limit(1)

  if (atribuicao) return { ...base, nivel: 'atribuido' }

  const [colaboracao] = await db
    .select({ id: colaboracoesCliente.id })
    .from(colaboracoesCliente)
    .where(
      and(
        eq(colaboracoesCliente.clienteId, cliente.id),
        eq(colaboracoesCliente.destinatarioId, usuarioId),
        eq(colaboracoesCliente.status, 'aceito'),
        isNull(colaboracoesCliente.revogadoEm),
      ),
    )
    .limit(1)

  if (colaboracao) return { ...base, nivel: 'colaborador_externo' }

  return null
}

/** Espelho linha a linha de `condicaoEscopoEscritorio`. */
async function administraOCliente(
  usuarioId: string,
  cliente: { proprietarioId: string; empresaId: string | null },
): Promise<boolean> {
  if (cliente.empresaId) {
    const vinculo = await obterVinculoAtivo(usuarioId, cliente.empresaId)
    if (vinculo && permissoesEscritorio(vinculo).administrar) return true
  }

  const administradas = await listarEmpresasAdministradas(usuarioId)
  if (!administradas.length) return false

  const [vinculoDono] = await db
    .select({ id: empresaMembros.id })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.usuarioId, cliente.proprietarioId),
        eq(empresaMembros.status, 'ativo'),
        inArray(empresaMembros.empresaId, administradas),
      ),
    )
    .limit(1)

  return Boolean(vinculoDono)
}

/**
 * Convite de colaboração exige acesso legítimo e interno ao cliente.
 * Quem entrou por colaboração externa não pode repassar o acesso adiante.
 */
export function podeConvidarColaborador(acesso: AcessoCliente) {
  return permissoesCliente(acesso).compartilhar
}

/**
 * Revogar é permitido a quem enviou o convite e a quem responde pelo cliente.
 */
export function podeRevogarColaboracao(
  acesso: AcessoCliente,
  usuarioId: string,
  remetenteId: string,
) {
  if (!permissoesCliente(acesso).compartilhar) return false
  return (
    remetenteId === usuarioId ||
    acesso.nivel === 'proprietario' ||
    acesso.nivel === 'escritorio_admin'
  )
}
