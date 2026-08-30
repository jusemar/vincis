'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarDescontos } from '../../actions/precificacao'
import { descontoPercentual } from '../../lib/conversao'
import { impressaoDaSecao } from '../../lib/impressao'
import type { TabelaPrecificacao } from '../../types/precificacao'
import { LinhaValor, SecaoCard, paraNumero, paraTexto } from './base'

/**
 * Os dois abatimentos que a Vincis concede.
 *
 * Prazo e pacote aparecem juntos porque são a mesma conversa comercial — "o
 * que o cliente ganha ao se comprometer mais" — e porque salvá-los juntos
 * evita o estado meio-torto de um combo mais barato que a soma com desconto
 * de doze meses.
 *
 * A composição do Pacote (Consultiva + Jurídico) é estrutural e aparece só
 * como explicação: trocar os componentes mudaria o que o produto é, não quanto
 * ele custa.
 */
export function SecaoDescontos({ tabela }: { tabela: TabelaPrecificacao }) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()

  const periodos = tabela.descontos.filter((d) => d.tipo === 'periodo')
  const combos = tabela.descontos.filter((d) => d.tipo === 'combo')

  const inicial = useMemo(
    () =>
      Object.fromEntries(
        tabela.descontos.map((d) => [
          d.codigo,
          paraTexto(descontoPercentual(d.descontoMilesimos)),
        ]),
      ),
    [tabela],
  )

  const [valores, setValores] = useState(inicial)
  const alterado = JSON.stringify(valores) !== JSON.stringify(inicial)

  function salvar() {
    const entrada = tabela.descontos.map((d) => ({
      codigo: d.codigo,
      percentual: paraNumero(valores[d.codigo] ?? ''),
    }))

    if (entrada.some((d) => Number.isNaN(d.percentual))) {
      toast.error('Confira os campos: há porcentagens em branco ou inválidas.')
      return
    }

    iniciar(async () => {
      const resultado = await salvarDescontos({
        impressao: impressaoDaSecao(tabela, 'descontos'),
        descontos: entrada,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success('Descontos atualizados.')
      router.refresh()
    })
  }

  const campo = (codigo: string, rotulo: string, ajuda?: string) => (
    <LinhaValor
      key={codigo}
      id={`desconto-${codigo}`}
      rotulo={rotulo}
      ajuda={ajuda}
      unidade="porcento"
      valor={valores[codigo] ?? ''}
      onChange={(valor) => setValores((atual) => ({ ...atual, [codigo]: valor }))}
    />
  )

  const nomeDoServico = (codigo: string) =>
    tabela.servicos.find((s) => s.codigo === codigo)?.nome ?? codigo

  return (
    <div className="space-y-4">
      <SecaoCard
        titulo="Desconto por prazo"
        descricao="Quanto o cliente economiza ao fechar por mais tempo. O desconto incide sobre o valor mensal já calculado."
        alterado={alterado}
        salvando={salvando}
        onSalvar={salvar}
        onDesfazer={() => setValores(inicial)}
      >
        {periodos.map((periodo) =>
          campo(
            periodo.codigo,
            periodo.rotulo,
            periodo.meses === 1
              ? 'Sem compromisso de permanência.'
              : `Compromisso de ${periodo.meses} meses.`,
          ),
        )}
      </SecaoCard>

      {combos.map((combo) => {
        const servico = tabela.servicos.find((s) => s.codigo === combo.servicoCodigo)
        return (
          <SecaoCard
            key={combo.codigo}
            titulo={servico?.nome ?? 'Pacote'}
            descricao={servico?.chamada}
            alterado={alterado}
            salvando={salvando}
            onSalvar={salvar}
            onDesfazer={() => setValores(inicial)}
            rodape="A composição do pacote é estrutural: aqui você define apenas o desconto."
          >
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
              {(servico?.componentes ?? []).map((codigo, indice) => (
                <span key={codigo} className="flex items-center gap-2">
                  {indice > 0 ? (
                    <span className="text-muted-foreground">+</span>
                  ) : null}
                  <span className="rounded-md bg-background px-2 py-1 text-xs font-medium">
                    {nomeDoServico(codigo)}
                  </span>
                </span>
              ))}
              <span className="text-muted-foreground">−</span>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                desconto do pacote
              </span>
            </div>
            {campo(combo.codigo, 'Desconto do pacote')}
          </SecaoCard>
        )
      })}
    </div>
  )
}
