'use client'

import { ExternalLink, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { rotuloDaLinha } from '../../lib/descricao'
import { formatarCentavos } from '../../lib/formato'
import { calcularPrecos } from '../../lib/motor'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'

/**
 * A prévia que acompanha a edição.
 *
 * ## Ela não é ilustrativa
 *
 * Os números saem de `calcularPrecos`, o mesmo motor que atende `/precos`, sobre
 * a tabela que o Gestor está montando neste instante. Um painel decorativo
 * responderia sempre a mesma coisa e mentiria justamente no dia em que alguém
 * mudasse uma regra — que é o dia em que ele precisa ser lido.
 *
 * ## Ela mostra o que ainda não foi salvo
 *
 * De propósito: a pergunta que antecede qualquer alteração de preço é "quanto
 * fica?", e respondê-la só depois de gravar obrigaria a salvar para descobrir.
 * O selo diz que há rascunho em jogo, e nada disso toca o banco — gravar
 * continua sendo o botão de cada seção.
 */
export function PrevisaoLateral({
  tabela,
  respostas,
  onRespostas,
  temRascunho,
  servicoEmFoco,
}: {
  /** A tabela **simulada**: o que está salvo, com o rascunho por cima. */
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
  onRespostas: (r: RespostasPrecificacao) => void
  temRascunho: boolean
  /** Serviço cuja composição é detalhada. */
  servicoEmFoco: string
}) {
  const precos = calcularPrecos(tabela, respostas)
  const foco = precos.find((p) => p.servico === servicoEmFoco) ?? precos[0]
  const servicoFoco = tabela.servicos.find((s) => s.codigo === foco?.servico)
  const combo = precos.find((p) => p.combo)

  const opcoes = (dimensao: string) =>
    tabela.dimensoes.find((d) => d.codigo === dimensao)?.opcoes.filter((o) => o.ativo) ??
    []
  const faixas = (tipo: string) =>
    tabela.faixas
      .filter((f) => f.grupo === 'contabil' && f.tipo === tipo)
      .sort((a, b) => a.limiteMin - b.limiteMin)

  const seletor = (
    id: string,
    rotulo: string,
    valor: string,
    lista: { codigo: string; rotulo: string }[],
    aoMudar: (v: string) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {rotulo}
      </Label>
      <select
        id={id}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
      >
        {lista.map((o) => (
          <option key={o.codigo} value={o.codigo}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <SlidersHorizontal className="size-3.5 text-primary" />
            Simulação
          </span>
          {temRascunho ? (
            <Badge
              variant="outline"
              className="border-primary/40 text-[10px] text-primary"
            >
              com alterações
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {seletor('sim-regime', 'Enquadramento', respostas.regime, opcoes('regime'), (v) =>
            onRespostas({ ...respostas, regime: v }),
          )}
          {seletor(
            'sim-atividade',
            'Ramo',
            respostas.atividades[0] ?? '',
            opcoes('atividade'),
            (v) => onRespostas({ ...respostas, atividades: [v] }),
          )}
          <div className="space-y-1">
            <Label htmlFor="sim-func" className="text-[11px] text-muted-foreground">
              Funcionários
            </Label>
            <input
              id="sim-func"
              type="number"
              min={0}
              max={200}
              value={respostas.funcionarios}
              onChange={(evento) =>
                onRespostas({
                  ...respostas,
                  funcionarios: Math.max(
                    0,
                    Math.min(200, Math.trunc(Number(evento.target.value) || 0)),
                  ),
                })
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs tabular-nums text-foreground"
            />
          </div>
          {seletor('sim-emissor', 'Emissor', respostas.emissor, opcoes('emissor'), (v) =>
            onRespostas({ ...respostas, emissor: v }),
          )}
          {seletor(
            'sim-notas',
            'Notas/mês',
            respostas.notasFiscais,
            faixas('notas_fiscais'),
            (v) => onRespostas({ ...respostas, notasFiscais: v }),
          )}
          {seletor(
            'sim-faturamento',
            'Faturamento',
            respostas.faturamento,
            faixas('faturamento'),
            (v) => onRespostas({ ...respostas, faturamento: v }),
          )}
          {seletor(
            'sim-atendimento',
            'Atendimento',
            respostas.atendimento,
            opcoes('atendimento'),
            (v) => onRespostas({ ...respostas, atendimento: v }),
          )}
          {seletor('sim-rotina', 'Rotina', respostas.rotina, opcoes('rotina'), (v) =>
            onRespostas({ ...respostas, rotina: v }),
          )}
        </div>

        {foco ? (
          <>
            <Separator className="my-3" />
            <p className="text-[11px] font-medium text-foreground">
              Composição · {servicoFoco?.nome}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {foco.linhas.map((linha) => (
                <li
                  key={`${linha.tipo}-${linha.codigo ?? ''}`}
                  className="flex justify-between gap-2 text-muted-foreground"
                >
                  <span className="truncate">
                    {rotuloDaLinha(linha, servicoFoco?.grupoBase ?? '')}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {linha.valorCentavos < 0 ? '− ' : ''}
                    {formatarCentavos(Math.abs(linha.valorCentavos))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <Separator className="my-3" />
        <ul className="space-y-1.5">
          {precos.map((preco) => {
            const servico = tabela.servicos.find((s) => s.codigo === preco.servico)
            const emFoco = preco.servico === foco?.servico
            return (
              <li
                key={preco.servico}
                className={`flex items-baseline justify-between gap-2 rounded-md px-2 py-1 ${
                  emFoco ? 'bg-primary/10' : ''
                }`}
              >
                <span className="truncate text-xs text-muted-foreground">
                  {servico?.nome}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    emFoco ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {formatarCentavos(preco.mensalCentavos)}
                </span>
              </li>
            )
          })}
        </ul>

        {foco ? (
          <>
            <Separator className="my-3" />
            <p className="text-[11px] font-medium text-foreground">
              Prazos · {servicoFoco?.nome}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {foco.periodos.map((periodo) => (
                <li key={periodo.periodo} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {periodo.rotulo}
                    {periodo.descontoPercentual > 0
                      ? ` · −${periodo.descontoPercentual}%`
                      : ''}
                  </span>
                  <span className="tabular-nums text-foreground">
                    {formatarCentavos(periodo.mensalCentavos)}/mês
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {combo?.combo ? (
          <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
            Pacote: separados {formatarCentavos(combo.combo.separadoCentavos)} ·
            economia{' '}
            <span className="font-semibold text-primary">
              {formatarCentavos(combo.combo.economiaMensalCentavos)}/mês
            </span>
          </p>
        ) : null}

        <Button asChild variant="outline" size="sm" className="mt-3 w-full">
          <Link href="/precos" target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Abrir página de preços
          </Link>
        </Button>
      </div>
    </div>
  )
}
