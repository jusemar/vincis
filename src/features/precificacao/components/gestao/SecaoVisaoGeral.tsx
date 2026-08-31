'use client'

import { formatarCentavos } from '../../lib/formato'
import { calcularPrecos } from '../../lib/motor'
import { descontoPercentual } from '../../lib/conversao'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { Painel, ValorLido } from './primitivas'

/**
 * O retrato da vitrine, com os números do motor de verdade.
 *
 * Um resumo escrito à mão seria a segunda fonte de verdade que este módulo
 * inteiro existe para não ter — e mentiria justamente no dia em que alguém
 * mudasse uma regra.
 */
export function SecaoVisaoGeral({
  tabela,
  respostas,
}: {
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
}) {
  const precos = calcularPrecos(tabela, respostas)
  const periodos = tabela.descontos.filter((d) => d.tipo === 'periodo')
  const combo = tabela.descontos.find((d) => d.tipo === 'combo')
  const ativos = tabela.adicionais.filter((a) => a.ativo).length

  return (
    <div className="space-y-4">
      <Painel
        titulo="Como a vitrine está agora"
        descricao="Valor mensal de cada serviço para o cenário escolhido na simulação."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {precos.map((preco) => {
            const servico = tabela.servicos.find((s) => s.codigo === preco.servico)
            const doze = preco.periodos.at(-1)
            return (
              <div
                key={preco.servico}
                className="rounded-lg border border-border/70 bg-background p-3"
              >
                <p className="truncate text-xs font-medium text-muted-foreground">
                  {servico?.nome}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                  {formatarCentavos(preco.mensalCentavos)}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    /mês
                  </span>
                </p>
                {doze ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {doze.rotulo}: {formatarCentavos(doze.mensalCentavos)}/mês
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </Painel>

      <Painel titulo="Parâmetros comerciais">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {periodos
            .filter((p) => p.descontoMilesimos > 0)
            .map((p) => (
              <ValorLido
                key={p.codigo}
                rotulo={`Desconto — ${p.rotulo}`}
                valor={`${descontoPercentual(p.descontoMilesimos)}%`}
              />
            ))}
          {combo ? (
            <ValorLido
              rotulo="Desconto do pacote"
              valor={`${descontoPercentual(combo.descontoMilesimos)}%`}
              destaque
            />
          ) : null}
          <ValorLido
            rotulo="Adicionais ativos"
            valor={`${ativos} de ${tabela.adicionais.length}`}
          />
          <ValorLido
            rotulo="Arredondamento"
            valor={`múltiplo de ${formatarCentavos(tabela.parametros.arredondamentoCentavos)}`}
          />
        </div>
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
          O arredondamento é estrutural e não é editado por aqui.
        </p>
      </Painel>
    </div>
  )
}
