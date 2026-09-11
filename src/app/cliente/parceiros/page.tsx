import { AreaDoParceiro } from '@/features/parceiros/components/cliente/AreaDoParceiro'
import { SECAO_PADRAO } from '@/features/parceiros/constants/navegacao'
import { obterSituacaoDeNivel } from '@/features/parceiros/lib/niveis'
import { obterParceiroDaSessao } from '@/features/parceiros/queries/obter-parceiro'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/**
 * Raiz do Programa de Parceiros: o Dashboard.
 *
 * Prévia visual, com uma exceção: o **link de indicação** é real e vem de
 * `parceiros`. Todo o resto — comissões, níveis, campanhas, funil — continua em
 * `features/parceiros/constants/mock-painel`, e o rodapé da tela avisa isso.
 *
 * `null` em `link` significa que a conta ainda não ativou o programa: quem
 * decide o que aparece nesse caso é o card, não a rota.
 */
export default async function ParceirosRoute() {
  const { dados } = await exigirClienteDaSessao()
  const parceiro = await obterParceiroDaSessao()
  // O nível é refeito agora, pela configuração vigente — nada fixo na tela.
  const situacaoNivel = parceiro ? await obterSituacaoDeNivel(parceiro.id) : null

  return (
    <AreaDoParceiro
      nome={dados.nome}
      secao={SECAO_PADRAO}
      link={parceiro?.link ?? null}
      situacaoNivel={situacaoNivel}
    />
  )
}
