import {
  KPIS_PARCEIRO,
  SITUACAO_PARCEIRO,
} from '../../constants/mock-painel'
import type { LinkDoParceiro } from '../../lib/link-de-indicacao'
import type { SituacaoDeNivel } from '../../lib/niveis'
import { CardDeNiveis } from './CardDeNiveis'
import { GraficoDeComissoes } from './GraficoDeComissoes'
import { HeroDoParceiro } from './HeroDoParceiro'
import { IndicadoresDoParceiro } from './IndicadoresDoParceiro'
import {
  AcademiaVincis,
  CampanhasAtivas,
  ComunidadeVincis,
  CupomDoParceiro,
  FunilDeConversao,
  LinkDeIndicacao,
  MateriaisDeDivulgacao,
  PrevisaoDeRenda,
  RankingSemanal,
  SistemaHibrido,
} from './BlocosDoParceiro'

/**
 * Painel do Parceiro, dentro da Área do Cliente.
 *
 * ## O que esta tela é, hoje
 *
 * Uma **demonstração visual**. O programa de parceiros ainda não tem tabela,
 * consulta nem action: todo número aqui vem de `constants/mock-painel`, e
 * nenhum botão grava coisa alguma. A tela existe para ser aprovada — e para
 * que a implementação real depois preencha estruturas que já estarão prontas.
 *
 * ## Onde ela mora
 *
 * É a seção **Dashboard** do módulo, e vive dentro do `ShellDoParceiro` — que
 * traz a barra lateral, o cabeçalho e a navegação mobile no padrão da área
 * administrativa. Este componente começa no conteúdo: não desenha moldura,
 * cabeçalho nem rodapé próprios.
 *
 * ## Composição
 *
 * A ordem dos blocos e a distribuição das colunas são as da referência visual —
 * Hero, indicadores, gráfico + níveis, híbrido + cupom, previsão + link,
 * campanhas + funil, ranking + comunidade + academia, materiais. O que mudou é
 * o material de que tudo é feito: tokens da Vincis, componentes da Vincis,
 * tipografia da Vincis. Nenhuma cor literal, nenhum segundo design system.
 */
export function PainelDoParceiro({
  nome,
  link,
  situacaoNivel = null,
}: {
  nome: string
  /** Link real do parceiro; `null` enquanto a conta não ativou. */
  link: LinkDoParceiro | null
  /** Nível real, da configuração publicada. Nulo quando indisponível. */
  situacaoNivel?: SituacaoDeNivel | null
}) {
  const rendaRecorrente =
    KPIS_PARCEIRO.find((kpi) => kpi.id === 'renda-recorrente')?.valor ?? 0

  return (
    <div className="space-y-6">
      <HeroDoParceiro
        nome={nome}
        situacao={situacaoNivel}
        clientesAtivos={SITUACAO_PARCEIRO.clientesAtivos}
        rendaRecorrente={rendaRecorrente}
        mesesConsecutivos={SITUACAO_PARCEIRO.mesesConsecutivos}
      />

      <IndicadoresDoParceiro />

      {/*
        As linhas seguem o ritmo da referência: um bloco largo (dois terços) ao
        lado de um estreito (um terço). No celular tudo empilha na mesma ordem
        em que se lê — o que precisa de contexto vem antes do que o detalha.
      */}
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:h-full">
          <GraficoDeComissoes />
        </div>
        <CardDeNiveis situacao={situacaoNivel} />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:h-full">
          <SistemaHibrido situacao={situacaoNivel} />
        </div>
        <CupomDoParceiro />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:h-full">
          <PrevisaoDeRenda />
        </div>
        <LinkDeIndicacao link={link} />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:h-full">
          <CampanhasAtivas />
        </div>
        <FunilDeConversao />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <RankingSemanal />
        <ComunidadeVincis />
        <AcademiaVincis />
      </div>

      <MateriaisDeDivulgacao />

      {/*
        A tela inteira é demonstração. Dizer isso na própria tela evita que
        alguém leia "R$ 48.230" como saldo — e some no dia em que os dados
        forem reais.
      */}
      <p className="pb-2 text-center text-xs text-muted-foreground">
        Prévia visual do Programa de Parceiros. Os números desta tela são
        demonstrativos.
      </p>
    </div>
  )
}
