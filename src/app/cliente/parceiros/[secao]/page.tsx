import { notFound } from 'next/navigation'
import { AreaDoParceiro } from '@/features/parceiros/components/cliente/AreaDoParceiro'
import {
  SECOES_PARCEIRO,
  SECAO_PADRAO,
} from '@/features/parceiros/constants/navegacao'
import { listarCampanhasDoParceiro, obterExtratoDePontos } from '@/features/parceiros/lib/campanhas'
import { obterSituacaoDeNivelDaConta } from '@/features/parceiros/lib/niveis'
import { obterParceiroDaSessao } from '@/features/parceiros/queries/obter-parceiro'
import { listarIndicacoesDoParceiro } from '@/features/parceiros/queries/listar-indicacoes'
import { listarComissoesDoParceiro } from '@/features/parceiros/queries/listar-comissoes'
import { listarDestinosProfissionais } from '@/features/parceiros/queries/listar-destinos-profissionais'
import { baseDoSite } from '@/features/parceiros/lib/link-de-indicacao'
import { obterRecebimentoDoParceiro } from '@/features/parceiros/queries/obter-recebimento'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/**
 * As seções do Programa de Parceiros, cada uma em seu endereço.
 *
 * Um segmento dinâmico, e não treze pastas idênticas: o registro do módulo já
 * é a lista de seções, e é ele que valida o slug. Assim uma seção nova nasce de
 * uma linha em `constants/navegacao` — aparece no menu, ganha rota e ganha
 * conteúdo —, sem arquivo novo para esquecer de criar.
 *
 * Slug desconhecido responde 404. Cair no Dashboard faria qualquer endereço
 * inventado parecer uma página válida do produto.
 */
export function generateStaticParams() {
  return SECOES_PARCEIRO.filter((secao) => secao.id !== SECAO_PADRAO).map(
    (secao) => ({ secao: secao.id }),
  )
}

export default async function SecaoParceirosRoute({
  params,
}: {
  params: Promise<{ secao: string }>
}) {
  const { secao } = await params
  if (!SECOES_PARCEIRO.some((item) => item.id === secao)) notFound()

  const { dados } = await exigirClienteDaSessao()
  const parceiro = await obterParceiroDaSessao()

  /*
    Só a seção de Leads lê o histórico. Buscá-lo em todas faria onze telas
    pagarem por duas consultas que nenhuma delas mostra.
  */
  const indicacoes =
    secao === 'leads' && parceiro
      ? await listarIndicacoesDoParceiro(parceiro.id)
      : []

  // Mesmo princípio da seção de Leads: só a tela financeira paga a consulta
  // financeira. As outras onze não leem `parceiro_comissoes`.
  // A lista de destinos só é lida na tela que a oferece.
  const profissionais =
    secao === 'meu-link' && parceiro ? await listarDestinosProfissionais() : []

  // Só a tela que mostra os dados paga a consulta deles.
  const recebimento =
    secao === 'configuracoes' && parceiro
      ? await obterRecebimentoDoParceiro(parceiro.id)
      : null

  const financeiro =
    secao === 'comissoes' && parceiro
      ? await listarComissoesDoParceiro(parceiro.id)
      : null

  // Só as seções que mostram o nível pagam o cálculo dele.
  const situacaoNivel =
    secao === 'niveis' || secao === 'clientes-indicados'
      ? await obterSituacaoDeNivelDaConta(parceiro?.id ?? null)
      : null

  // Só a seção de Campanhas lê campanhas e pontos.
  const [campanhas, pontos] =
    secao === 'campanhas' && parceiro
      ? await Promise.all([listarCampanhasDoParceiro(parceiro.id), obterExtratoDePontos(parceiro.id)])
      : [[], null]

  return (
    <AreaDoParceiro
      nome={dados.nome}
      secao={secao}
      link={parceiro?.link ?? null}
      situacaoNivel={situacaoNivel}
      campanhas={campanhas}
      pontos={pontos}
      indicacoes={indicacoes}
      comissoes={financeiro?.comissoes ?? []}
      saques={financeiro?.saques ?? []}
      baseDoSite={baseDoSite()}
      profissionais={profissionais}
      recebimento={recebimento}
      {...(financeiro ? { resumoComissoes: financeiro.resumo } : {})}
    />
  )
}
