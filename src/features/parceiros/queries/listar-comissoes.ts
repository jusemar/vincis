import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturas,
  contratacoesServico,
  parceiroBonus,
  parceiroComissoes,
  parceiroSaqueItens,
  parceiroSaques,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { ROTULO_SAQUE, statusSaqueValido, type StatusSaque } from '../constants/saque'
import {
  statusComissaoValido,
  tipoComissaoValido,
  type StatusComissao,
  type TipoComissao,
} from '../constants/comissao'

const profissional = alias(usuarios, 'profissional_da_comissao')
const cliente = alias(usuarios, 'cliente_da_comissao')

export type ComissaoDoParceiro = {
  id: string
  /** `avulso`: um negócio do catálogo. `recorrente`: um mês de assinatura. */
  tipo: TipoComissao
  /** O mês que gerou a recorrente, com o período quando já datado. */
  competencia: { numero: number; inicio: string | null; fim: string | null } | null
  servico: string | null
  categoria: string | null
  clienteNome: string
  profissionalNome: string | null
  profissionalCodigo: string | null
  valorBaseCentavos: number
  percentual: number
  valorCentavos: number
  status: StatusComissao
  geradaEm: Date
}

export type ResumoDeComissoes = {
  totalCentavos: number
  geradaCentavos: number
  disponivelCentavos: number
  pagaCentavos: number
  canceladaCentavos: number
  negocios: number
  /** Comissões liberadas que já estão comprometidas com um saque. */
  reservadoCentavos: number
  /** O que ainda pode virar um pedido novo: disponível + bônus disponível − reservado. */
  livreCentavos: number
  /** Bônus de campanha disponível (não é comissão; entra no mesmo saldo). */
  bonusDisponivelCentavos: number
  /** Bônus de campanha já pago em saque. */
  bonusPagoCentavos: number
}

export type SaqueDoParceiro = {
  id: string
  valorCentavos: number
  status: StatusSaque
  rotulo: string
  solicitadoEm: Date
  pagoEm: Date | null
}

/**
 * O que o parceiro gerou, do mais recente para o mais antigo.
 *
 * ## Só as dele
 *
 * O `where` é `parceiro_id`, e o id vem da sessão pelo chamador — nunca da
 * requisição. Um parceiro não alcança a comissão de outro nem conhecendo o id,
 * porque a linha simplesmente não entra no resultado.
 *
 * ## O que não sai daqui
 *
 * Do cliente sai o nome, e nada além: e-mail, WhatsApp e status da conta não
 * são recorte de acompanhamento financeiro. Do profissional saem nome e o
 * código **público** — o uuid fica no banco, onde ele serve para alguma coisa.
 *
 * ## Os totais são somados aqui
 *
 * No servidor, sobre as mesmas linhas que a tela lista, e não recalculados a
 * partir de percentual: o valor de cada comissão é o congelado no instante do
 * direito, e somar outra coisa faria o total discordar da lista logo abaixo
 * dele. Comissão cancelada não entra em total nenhum.
 */
export async function listarComissoesDoParceiro(
  parceiroId: string,
  limite = 100,
): Promise<{
  comissoes: ComissaoDoParceiro[]
  resumo: ResumoDeComissoes
  saques: SaqueDoParceiro[]
}> {
  const linhas = await db
    .select({
      id: parceiroComissoes.id,
      tipo: parceiroComissoes.tipo,
      // O serviço do catálogo na avulsa; o plano congelado na recorrente.
      servico: sql<string | null>`coalesce(${contratacoesServico.nomeServicoSnapshot}, ${assinaturas.planoNome})`,
      competenciaNumero: assinaturaCompetencias.numero,
      competenciaInicio: assinaturaCompetencias.periodoInicio,
      competenciaFim: assinaturaCompetencias.periodoFim,
      categoria: parceiroComissoes.servicoReferencia,
      clienteNome: cliente.nome,
      profissionalNome: profissional.nome,
      profissionalCodigo: perfisProfissionais.codigoPublico,
      valorBaseCentavos: parceiroComissoes.valorBaseCentavos,
      percentual: parceiroComissoes.percentual,
      valorCentavos: parceiroComissoes.valorCentavos,
      status: parceiroComissoes.status,
      geradaEm: parceiroComissoes.geradaEm,
    })
    .from(parceiroComissoes)
    .innerJoin(cliente, eq(cliente.id, parceiroComissoes.clienteUsuarioId))
    .leftJoin(profissional, eq(profissional.id, parceiroComissoes.profissionalId))
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, parceiroComissoes.profissionalId),
    )
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, parceiroComissoes.contratacaoId),
    )
    .leftJoin(
      assinaturaCompetencias,
      eq(assinaturaCompetencias.id, parceiroComissoes.competenciaId),
    )
    .leftJoin(assinaturas, eq(assinaturas.id, assinaturaCompetencias.assinaturaId))
    .where(eq(parceiroComissoes.parceiroId, parceiroId))
    .orderBy(desc(parceiroComissoes.geradaEm))
    .limit(limite)

  const comissoes = linhas.map(
    ({ competenciaNumero, competenciaInicio, competenciaFim, ...linha }) => ({
    ...linha,
    tipo: tipoComissaoValido(linha.tipo) ? linha.tipo : ('avulso' as TipoComissao),
    competencia:
      competenciaNumero !== null
        ? { numero: competenciaNumero, inicio: competenciaInicio, fim: competenciaFim }
        : null,
    percentual: Number(linha.percentual),
    status: statusComissaoValido(linha.status)
      ? linha.status
      : ('gerada' as StatusComissao),
  }),
  )

  const somar = (estados: StatusComissao[]) =>
    comissoes
      .filter((comissao) => estados.includes(comissao.status))
      .reduce((total, comissao) => total + comissao.valorCentavos, 0)

  /*
    Os saques deste parceiro, e quanto eles seguram.

    O reservado sai dos **itens**, não do total do saque: é a soma das comissões
    de fato comprometidas, a mesma fonte que o índice único protege. Somar o
    campo agregado daria o mesmo número hoje e mentiria no dia em que os dois
    discordassem.
  */
  const linhasSaque = await db
    .select({
      id: parceiroSaques.id,
      valorCentavos: parceiroSaques.valorCentavos,
      status: parceiroSaques.status,
      solicitadoEm: parceiroSaques.solicitadoEm,
      pagoEm: parceiroSaques.pagoEm,
    })
    .from(parceiroSaques)
    .where(eq(parceiroSaques.parceiroId, parceiroId))
    .orderBy(desc(parceiroSaques.solicitadoEm))
    .limit(limite)

  const saques = linhasSaque.map((linha) => {
    const status = statusSaqueValido(linha.status)
      ? linha.status
      : ('solicitado' as StatusSaque)
    return { ...linha, status, rotulo: ROTULO_SAQUE[status] }
  })

  const [reserva] = await db
    .select({
      total: sql<number>`coalesce(sum(${parceiroSaqueItens.valorCentavos}), 0)::int`,
    })
    .from(parceiroSaqueItens)
    .innerJoin(parceiroSaques, eq(parceiroSaques.id, parceiroSaqueItens.saqueId))
    .where(
      and(
        eq(parceiroSaques.parceiroId, parceiroId),
        /*
          Reservado é o que está **preso num pedido em aberto**.

          Saque pago não reserva nada: as comissões dele viraram `paga` e já
          saíram de `disponivel`, então contá-las aqui subtrairia um valor que
          nunca foi somado — e o saldo livre do parceiro ficaria travado em
          zero para sempre. Saque recusado também não reserva: os itens dele
          estão liberados.
        */
        eq(parceiroSaques.status, 'solicitado'),
        isNull(parceiroSaqueItens.liberadoEm),
      ),
    )

  const [bonus] = await db
    .select({
      disponivel: sql<number>`coalesce(sum(${parceiroBonus.valorCentavos}) filter (where ${parceiroBonus.status} = 'disponivel'), 0)::int`,
      pago: sql<number>`coalesce(sum(${parceiroBonus.valorCentavos}) filter (where ${parceiroBonus.status} = 'paga'), 0)::int`,
    })
    .from(parceiroBonus)
    .where(eq(parceiroBonus.parceiroId, parceiroId))
  const bonusDisponivelCentavos = Number(bonus?.disponivel ?? 0)

  const reservadoCentavos = Number(reserva?.total ?? 0)
  const disponivelCentavos = somar(['disponivel'])

  return {
    comissoes,
    saques,
    resumo: {
      reservadoCentavos,
      // Nunca negativo: se algum dia a reserva passar o disponível, o problema
      // é de dado, e mostrar saldo negativo esconderia isso atrás de um número.
      livreCentavos: Math.max(disponivelCentavos + bonusDisponivelCentavos - reservadoCentavos, 0),
      bonusDisponivelCentavos,
      bonusPagoCentavos: Number(bonus?.pago ?? 0),
      totalCentavos: somar(['gerada', 'disponivel', 'paga']),
      geradaCentavos: somar(['gerada']),
      disponivelCentavos: somar(['disponivel']),
      pagaCentavos: somar(['paga']),
      // Fora do total de propósito: cancelada perdeu o direito, e somá-la
      // faria a tela prometer um dinheiro que não existe mais.
      canceladaCentavos: somar(['cancelada']),
      negocios: comissoes.filter((c) => c.status !== 'cancelada').length,
    },
  }
}
