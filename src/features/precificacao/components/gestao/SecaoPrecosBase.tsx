'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarPrecosBase } from '../../actions/precificacao'
import { acrescimoPercentual, centavosParaReais } from '../../lib/conversao'
import { formatarCentavos } from '../../lib/formato'
import { impressaoDaSecao } from '../../lib/impressao'
import { precoBaseDoServico } from '../../lib/motor'
import type { TabelaPrecificacao } from '../../types/precificacao'
import { LinhaValor, SecaoCard, paraNumero, paraTexto } from './base'

/**
 * O preço de partida de cada regime, e o acréscimo da Consultiva.
 *
 * As duas coisas ficam na mesma tela porque são a mesma decisão: a Consultiva
 * não tem grade própria, ela é a rotina contábil mais uma porcentagem. Separá-las
 * faria o Gestor reajustar a Contabilidade sem ver o que acontece com o plano
 * mais vendido.
 *
 * A prévia ao lado do acréscimo sai do motor central (`precoBaseDoServico`) —
 * é o mesmo número que a página pública vai mostrar, e não uma multiplicação
 * refeita aqui.
 */
export function SecaoPrecosBase({ tabela }: { tabela: TabelaPrecificacao }) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()

  const regimes = tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ?? []
  const inicial = useMemo(
    () => ({
      precos: Object.fromEntries(
        tabela.precosBase.map((p) => [
          `${p.grupo}/${p.regime}`,
          paraTexto(centavosParaReais(p.valorCentavos)),
        ]),
      ),
      acrescimo: paraTexto(
        acrescimoPercentual(
          tabela.servicos.find((s) => s.codigo === 'consultiva')
            ?.multiplicadorMilesimos ?? 1000,
        ),
      ),
    }),
    [tabela],
  )

  const [formulario, setFormulario] = useState(inicial)
  const alterado = JSON.stringify(formulario) !== JSON.stringify(inicial)

  /** Tabela hipotética com o acréscimo digitado, para a prévia da Consultiva. */
  const tabelaSimulada = useMemo(() => {
    const percentual = paraNumero(formulario.acrescimo)
    if (Number.isNaN(percentual)) return null
    return {
      ...tabela,
      precosBase: tabela.precosBase.map((p) => {
        const digitado = paraNumero(formulario.precos[`${p.grupo}/${p.regime}`] ?? '')
        return Number.isNaN(digitado)
          ? p
          : { ...p, valorCentavos: Math.round(digitado * 100) }
      }),
      servicos: tabela.servicos.map((s) =>
        s.codigo === 'consultiva'
          ? { ...s, multiplicadorMilesimos: 1000 + Math.round(percentual * 10) }
          : s,
      ),
    }
  }, [tabela, formulario])

  function baseSimulada(servico: string, regime: string) {
    if (!tabelaSimulada) return null
    try {
      return precoBaseDoServico(tabelaSimulada, servico, regime)
    } catch {
      return null
    }
  }

  function salvar() {
    const precos = Object.entries(formulario.precos).map(([chave, texto]) => {
      const [grupo, regime] = chave.split('/')
      return { grupo, regime, valorReais: paraNumero(texto) }
    })
    const acrescimoConsultiva = paraNumero(formulario.acrescimo)

    if (
      precos.some((p) => Number.isNaN(p.valorReais)) ||
      Number.isNaN(acrescimoConsultiva)
    ) {
      toast.error('Confira os campos: há valores em branco ou inválidos.')
      return
    }

    iniciar(async () => {
      const resultado = await salvarPrecosBase({
        impressao: impressaoDaSecao(tabela, 'precos_base'),
        precos,
        acrescimoConsultiva,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success('Preços-base atualizados.')
      router.refresh()
    })
  }

  const campos = (grupo: 'contabil' | 'juridico', servico: string) =>
    regimes.map((regime) => {
      const chave = `${grupo}/${regime.codigo}`
      const base = baseSimulada(servico, regime.codigo)
      return (
        <LinhaValor
          key={chave}
          id={`preco-${chave}`}
          rotulo={regime.rotulo}
          ajuda={regime.ajuda ?? undefined}
          unidade="reais"
          valor={formulario.precos[chave] ?? ''}
          onChange={(valor) =>
            setFormulario((atual) => ({
              ...atual,
              precos: { ...atual.precos, [chave]: valor },
            }))
          }
          apoio={
            base === null
              ? null
              : `Na página de preços, parte de ${formatarCentavos(base)}`
          }
        />
      )
    })

  return (
    <div className="space-y-4">
      <SecaoCard
        titulo="Contabilidade"
        descricao="Quanto custa a rotina contábil de cada regime tributário, antes dos acréscimos de porte e de atendimento."
        alterado={alterado}
        salvando={salvando}
        onSalvar={salvar}
        onDesfazer={() => setFormulario(inicial)}
        rodape="Os valores exibidos na vitrine são arredondados para o múltiplo de R$ 5 mais próximo."
      >
        {campos('contabil', 'padrao')}

        <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-3">
          <p className="text-sm font-semibold text-foreground">
            Contabilidade Consultiva
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A Consultiva usa a mesma base da Contabilidade Padrão e aplica um
            acréscimo. Ela não tem preço próprio por regime.
          </p>
          <div className="mt-3">
            <LinhaValor
              id="acrescimo-consultiva"
              rotulo="Acréscimo sobre a Contabilidade Padrão"
              unidade="porcento"
              valor={formulario.acrescimo}
              onChange={(valor) =>
                setFormulario((atual) => ({ ...atual, acrescimo: valor }))
              }
            />
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {regimes.map((regime) => {
              const padrao = baseSimulada('padrao', regime.codigo)
              const consultiva = baseSimulada('consultiva', regime.codigo)
              return (
                <li
                  key={regime.codigo}
                  className="flex items-baseline justify-between gap-2 rounded-md bg-background/70 px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">{regime.rotulo}</span>
                  <span className="tabular-nums text-foreground">
                    {padrao === null ? '—' : formatarCentavos(padrao)}
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span className="font-semibold text-primary">
                      {consultiva === null ? '—' : formatarCentavos(consultiva)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </SecaoCard>

      <SecaoCard
        titulo="Assistência Jurídica"
        descricao="Quanto custa a assistência jurídica de cada regime tributário."
        alterado={alterado}
        salvando={salvando}
        onSalvar={salvar}
        onDesfazer={() => setFormulario(inicial)}
      >
        {campos('juridico', 'juridico')}
      </SecaoCard>
    </div>
  )
}
