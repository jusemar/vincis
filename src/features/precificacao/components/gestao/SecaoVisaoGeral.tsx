'use client'

import { useMemo, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { descontoPercentual } from '../../lib/conversao'
import { formatarCentavos } from '../../lib/formato'
import { calcularPrecos } from '../../lib/motor'
import { respostasIniciais } from '../../lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { ValorLido } from './base'

/**
 * A primeira tela: o que a vitrine está cobrando hoje, e um simulador.
 *
 * ## Os números não são um resumo escrito à mão
 *
 * Eles saem de `calcularPrecos`, o mesmo motor que a página pública usa. Um
 * "resumo" que reproduzisse a conta por fora seria a segunda fonte de verdade
 * que este módulo inteiro existe para não ter — e mentiria exatamente no dia em
 * que alguém mudasse uma regra.
 *
 * ## O simulador responde à pergunta que precede toda alteração
 *
 * "Se eu mexer aqui, quanto fica para uma empresa de verdade?" Ele roda no
 * navegador sobre a tabela já carregada: nenhuma ida ao servidor, nenhuma
 * gravação, nenhum efeito sobre o que o cliente vê.
 */
export function SecaoVisaoGeral({ tabela }: { tabela: TabelaPrecificacao }) {
  const referencia = useMemo(() => respostasIniciais(tabela), [tabela])
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(referencia)
  const precos = useMemo(
    () => calcularPrecos(tabela, respostas),
    [tabela, respostas],
  )

  const dimensao = (codigo: string) =>
    tabela.dimensoes.find((d) => d.codigo === codigo)?.opcoes.filter((o) => o.ativo) ??
    []
  const faixas = (tipo: string) =>
    tabela.faixas
      .filter((f) => f.grupo === 'contabil' && f.tipo === tipo)
      .sort((a, b) => a.limiteMin - b.limiteMin)

  const periodos = tabela.descontos.filter((d) => d.tipo === 'periodo')
  const combo = tabela.descontos.find((d) => d.tipo === 'combo')
  const adicionaisAtivos = tabela.adicionais.filter((a) => a.ativo).length

  const seletor = (
    id: string,
    rotulo: string,
    valor: string,
    opcoes: { codigo: string; rotulo: string }[],
    aoMudar: (v: string) => void,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
      >
        {opcoes.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Como a vitrine está hoje</h2>
            <p className="text-sm text-muted-foreground">
              Valor mensal de cada serviço para o perfil de empresa com que a
              página de preços abre.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {precos.map((preco) => {
              const servico = tabela.servicos.find((s) => s.codigo === preco.servico)
              const doze = preco.periodos.at(-1)
              return (
                <div
                  key={preco.servico}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {servico?.nome}
                  </p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                    {formatarCentavos(preco.mensalCentavos)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      /mês
                    </span>
                  </p>
                  {doze ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {doze.rotulo}: {formatarCentavos(doze.mensalCentavos)}/mês
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>

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
              rotulo="Serviços adicionais ativos"
              valor={`${adicionaisAtivos} de ${tabela.adicionais.length}`}
            />
          </div>

          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Todo valor exibido na vitrine é arredondado para o múltiplo de{' '}
            {formatarCentavos(tabela.parametros.arredondamentoCentavos)} mais
            próximo. Essa regra é estrutural e não é editada por aqui.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <SlidersHorizontal className="size-4 text-primary" />
                Simular uma empresa
              </h2>
              <p className="text-sm text-muted-foreground">
                Mesmo cálculo da página pública. Nada aqui é salvo.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRespostas(referencia)}
              className="text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              Perfil de referência
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {seletor(
              'sim-regime',
              'Enquadramento fiscal',
              respostas.regime,
              dimensao('regime'),
              (v) => setRespostas((a) => ({ ...a, regime: v })),
            )}
            {seletor(
              'sim-atividade',
              'Ramo da empresa',
              respostas.atividades[0] ?? '',
              dimensao('atividade'),
              (v) => setRespostas((a) => ({ ...a, atividades: [v] })),
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sim-funcionarios" className="text-xs text-muted-foreground">
                Funcionários registrados
              </Label>
              <input
                id="sim-funcionarios"
                type="number"
                min={0}
                max={200}
                value={respostas.funcionarios}
                onChange={(evento) =>
                  setRespostas((a) => ({
                    ...a,
                    funcionarios: Math.max(
                      0,
                      Math.min(200, Math.trunc(Number(evento.target.value) || 0)),
                    ),
                  }))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums text-foreground"
              />
            </div>
            {seletor(
              'sim-notas',
              'Notas fiscais por mês',
              respostas.notasFiscais,
              faixas('notas_fiscais'),
              (v) => setRespostas((a) => ({ ...a, notasFiscais: v })),
            )}
            {seletor(
              'sim-emissor',
              'Quem emite as notas',
              respostas.emissor,
              dimensao('emissor'),
              (v) => setRespostas((a) => ({ ...a, emissor: v })),
            )}
            {seletor(
              'sim-faturamento',
              'Faturamento mensal',
              respostas.faturamento,
              faixas('faturamento'),
              (v) => setRespostas((a) => ({ ...a, faturamento: v })),
            )}
            {seletor(
              'sim-atendimento',
              'Como quer ser atendido',
              respostas.atendimento,
              dimensao('atendimento'),
              (v) => setRespostas((a) => ({ ...a, atendimento: v })),
            )}
            {seletor(
              'sim-rotina',
              'Quem cuida da rotina',
              respostas.rotina,
              dimensao('rotina'),
              (v) => setRespostas((a) => ({ ...a, rotina: v })),
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {precos.map((preco) => (
              <ValorLido
                key={preco.servico}
                rotulo={
                  tabela.servicos.find((s) => s.codigo === preco.servico)?.nome ?? ''
                }
                valor={`${formatarCentavos(preco.mensalCentavos)}/mês`}
                destaque={preco.servico === 'combo'}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
