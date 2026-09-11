import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturas,
  contratacoesServico,
  parceiroComissoes,
  parceiroSaqueItens,
  parceiroSaques,
  parceiros,
  usuarios,
} from '@/db/schema'
import { statusSaqueValido, type StatusSaque } from '../constants/saque'

export type OrigemDoSaque = {
  comissaoId: string
  servico: string | null
  clienteNome: string
  valorCentavos: number
}

export type SaqueParaGestao = {
  id: string
  parceiroId: string
  parceiroCodigo: string
  parceiroNome: string
  parceiroEmail: string
  valorCentavos: number
  status: StatusSaque
  solicitadoEm: Date
  pagoEm: Date | null
  recusadoEm: Date | null
  /** Motivo administrativo da recusa, quando a Gestão registrou um. */
  observacao: string | null
  /**
   * O destino congelado no instante do pedido.
   *
   * Nulo nos saques anteriores a esta funcionalidade — e a tela diz isso, em
   * vez de inventar uma chave. A chave inteira vem porque o Gestor precisa
   * dela para transferir; é o único lugar do sistema onde ela é lida.
   */
  recebimento: {
    metodo: string
    tipoChave: string
    chave: string
    titular: string
  } | null
  origens: OrigemDoSaque[]
}

/**
 * Os saques que a Gestão precisa tratar, do mais recente para o mais antigo.
 *
 * ## Por que as origens vêm junto
 *
 * O Gestor vai transferir dinheiro de verdade por fora da plataforma. Antes
 * disso ele precisa ver **de onde** o valor veio — quais comissões, de quais
 * serviços, de quais clientes. Um total sem origem obrigaria a confiar na
 * soma, e uma contestação depois não teria como ser respondida.
 *
 * ## O que não sai daqui
 *
 * Do parceiro saem nome, e-mail e o código público. Do cliente, só o nome:
 * telefone, documento e status de conta não são recorte de conferência
 * financeira. Não há dado bancário porque a plataforma não guarda nenhum — o
 * pagamento acontece fora, e o Gestor usa o canal que já usa hoje.
 *
 * ## Duas consultas, não N+1
 *
 * Os saques numa, as origens de todos eles em outra, agrupadas na memória.
 */
export async function listarSaquesParaGestao(
  limite = 100,
): Promise<SaqueParaGestao[]> {
  const linhas = await db
    .select({
      id: parceiroSaques.id,
      parceiroId: parceiroSaques.parceiroId,
      parceiroCodigo: parceiros.codigo,
      parceiroNome: usuarios.nome,
      parceiroEmail: usuarios.email,
      valorCentavos: parceiroSaques.valorCentavos,
      status: parceiroSaques.status,
      solicitadoEm: parceiroSaques.solicitadoEm,
      pagoEm: parceiroSaques.pagoEm,
      recusadoEm: parceiroSaques.recusadoEm,
      observacao: parceiroSaques.observacao,
      recebimentoMetodo: parceiroSaques.recebimentoMetodo,
      recebimentoTipoChave: parceiroSaques.recebimentoTipoChave,
      recebimentoChave: parceiroSaques.recebimentoChave,
      recebimentoTitular: parceiroSaques.recebimentoTitular,
    })
    .from(parceiroSaques)
    .innerJoin(parceiros, eq(parceiros.id, parceiroSaques.parceiroId))
    .innerJoin(usuarios, eq(usuarios.id, parceiros.usuarioId))
    .orderBy(desc(parceiroSaques.solicitadoEm))
    .limit(limite)

  if (!linhas.length) return []

  const origens = await db
    .select({
      saqueId: parceiroSaqueItens.saqueId,
      comissaoId: parceiroSaqueItens.comissaoId,
      valorCentavos: parceiroSaqueItens.valorCentavos,
      // Na recorrente, o plano e o mês que geraram a comissão.
      servico: sql<string | null>`coalesce(${contratacoesServico.nomeServicoSnapshot}, ${assinaturas.planoNome} || ' · mês ' || ${assinaturaCompetencias.numero})`,
      clienteNome: usuarios.nome,
    })
    .from(parceiroSaqueItens)
    .innerJoin(
      parceiroComissoes,
      eq(parceiroComissoes.id, parceiroSaqueItens.comissaoId),
    )
    .innerJoin(usuarios, eq(usuarios.id, parceiroComissoes.clienteUsuarioId))
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, parceiroComissoes.contratacaoId),
    )
    .leftJoin(
      assinaturaCompetencias,
      eq(assinaturaCompetencias.id, parceiroComissoes.competenciaId),
    )
    .leftJoin(assinaturas, eq(assinaturas.id, assinaturaCompetencias.assinaturaId))
    .where(
      inArray(
        parceiroSaqueItens.saqueId,
        linhas.map((linha) => linha.id),
      ),
    )

  const porSaque = new Map<string, OrigemDoSaque[]>()
  for (const { saqueId, ...origem } of origens) {
    const lista = porSaque.get(saqueId) ?? []
    lista.push(origem)
    porSaque.set(saqueId, lista)
  }

  return linhas.map(
    ({
      recebimentoMetodo,
      recebimentoTipoChave,
      recebimentoChave,
      recebimentoTitular,
      ...linha
    }) => ({
      ...linha,
      status: statusSaqueValido(linha.status)
        ? linha.status
        : ('solicitado' as StatusSaque),
      recebimento:
        recebimentoChave && recebimentoTipoChave && recebimentoTitular
          ? {
              metodo: recebimentoMetodo ?? 'pix',
              tipoChave: recebimentoTipoChave,
              chave: recebimentoChave,
              titular: recebimentoTitular,
            }
          : null,
      origens: porSaque.get(linha.id) ?? [],
    }),
  )
}
