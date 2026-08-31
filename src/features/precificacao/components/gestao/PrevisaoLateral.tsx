'use client'

import Link from 'next/link'
import { Eye, Settings2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle } from 'lucide-react'
import { rotuloDaLinha } from '../../lib/descricao'
import { formatarCentavos } from '../../lib/formato'
import { violacoesComerciais } from '../../lib/invariantes'
import { calcularPrecos } from '../../lib/motor'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'

/**
 * A trilha de simulação, no lugar e na forma do protótipo — com o motor real
 * por dentro.
 *
 * O protótipo trazia uma lista de valores ilustrativos e um aviso dizendo que
 * nada ali estava ligado. Aqui a composição, o total e os prazos saem de
 * `calcularPrecos`, o mesmo motor que atende `/precos`, sobre a tabela que o
 * Gestor está montando neste instante. É a diferença entre um painel que
 * mostra um número e um painel que responde à pergunta que antecede toda
 * alteração de preço.
 *
 * Nada aqui grava. O rascunho é local; o banco só muda pelo botão de salvar.
 */
export function PrevisaoLateral({
  prefixo,
  tabela,
  respostas,
  onRespostas,
  servicoEmFoco,
  cenario,
}: {
  /** Distingue as duas instâncias (lateral e móvel) nos ids dos campos. */
  prefixo: string
  /** A tabela **simulada**: o que está salvo, com o rascunho por cima. */
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
  onRespostas: (r: RespostasPrecificacao) => void
  /** Serviço cuja composição é detalhada. */
  servicoEmFoco: string
  /** Uma linha descrevendo o perfil usado, como no protótipo. */
  cenario: string
}) {
  /*
    A simulação é a primeira barreira, e por isso ela precisa saber falhar.

    Um rascunho pode chegar a um estado que o motor não sabe precificar — uma
    opção que deixou de existir, um valor que zera o plano. Deixar o componente
    quebrar levaria a tela inteira embora e, com ela, tudo o que o Gestor
    digitou. Aqui a falha vira um aviso: os campos continuam onde estão e ele
    corrige com a explicação à vista.
  */
  const calculo = (() => {
    try {
      return { precos: calcularPrecos(tabela, respostas), erro: null as string | null }
    } catch (erro) {
      return {
        precos: null,
        erro:
          erro instanceof Error
            ? erro.message
            : 'Não foi possível calcular este cenário.',
      }
    }
  })()

  const alertas = calculo.precos ? violacoesComerciais(tabela) : []

  if (!calculo.precos) {
    return (
      <div className="sticky top-4 space-y-4">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-destructive">
            <AlertTriangle className="size-4" /> Simulação indisponível
          </div>
          <p className="mt-3 text-sm text-foreground">
            Não foi possível calcular este cenário com o rascunho atual.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {calculo.erro} Corrija o campo e a simulação volta sozinha — nada do
            que você digitou foi perdido.
          </p>
        </div>
      </div>
    )
  }

  const precos = calculo.precos
  const foco = precos.find((p) => p.servico === servicoEmFoco) ?? precos[0]
  const servicoFoco = tabela.servicos.find((s) => s.codigo === foco?.servico)
  const combo = precos.find((p) => p.combo)

  /*
    O efeito de cada multiplicador, em dinheiro.

    O motor devolve o total e os fatores aplicados; o rateio abaixo é só a
    leitura desses mesmos fatores em reais, para o Gestor ver o peso de cada
    escolha. O número que vale continua sendo `mensalCentavos`, que vem do
    motor — nada aqui recalcula preço.
  */
  const nucleo =
    foco?.linhas
      .filter((l) => l.tipo !== 'adicional')
      .reduce((total, l) => total + l.valorCentavos, 0) ?? 0
  const fatores = (foco?.fatores ?? []).reduce<{
    lista: { dimensao: string; rotulo: string; multiplicadorMilesimos: number; efeito: number }[]
    acumulado: number
  }>(
    (estado, fator) => {
      const depois = Math.round(
        (estado.acumulado * fator.multiplicadorMilesimos) / 1000,
      )
      return {
        lista: [...estado.lista, { ...fator, efeito: depois - estado.acumulado }],
        acumulado: depois,
      }
    },
    { lista: [], acumulado: nucleo },
  ).lista

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
    <div className="sticky top-4 space-y-4">
      {/* O impedimento vem antes de tudo: um aviso abaixo da dobra é um aviso
          que ninguém lê, e este é o que decide se a publicação vai passar. */}
      {alertas.length > 0 ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
            <AlertTriangle className="size-3.5" />
            {alertas.length === 1
              ? 'Este rascunho não pode ser publicado'
              : `${alertas.length} pontos impedem a publicação`}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            {alertas.slice(0, 3).map((alerta) => (
              <li key={`${alerta.secao}-${alerta.campo ?? ''}-${alerta.mensagem}`}>
                {alerta.mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* O protótipo descrevia um perfil fixo em texto. Aqui ele é escolhível,
          porque a pergunta do Gestor muda com a empresa que ele tem em mente. */}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="size-4 text-primary" /> Cenário
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {seletor(
      `${prefixo}-sim-regime`, 'Enquadramento', respostas.regime, opcoes('regime'), (v) =>
            onRespostas({ ...respostas, regime: v }),
          )}
          {seletor(
      `${prefixo}-sim-atividade`,
            'Ramo',
            respostas.atividades[0] ?? '',
            opcoes('atividade'),
            (v) => onRespostas({ ...respostas, atividades: [v] }),
          )}
          <div className="space-y-1">
            <Label
              htmlFor={`${prefixo}-sim-func`}
              className="text-[11px] text-muted-foreground"
            >
              Funcionários
            </Label>
            <input
              id={`${prefixo}-sim-func`}
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
          {seletor(
      `${prefixo}-sim-emissor`, 'Emissor', respostas.emissor, opcoes('emissor'), (v) =>
            onRespostas({ ...respostas, emissor: v }),
          )}
          {seletor(
      `${prefixo}-sim-notas`,
            'Notas/mês',
            respostas.notasFiscais,
            faixas('notas_fiscais'),
            (v) => onRespostas({ ...respostas, notasFiscais: v }),
          )}
          {seletor(
      `${prefixo}-sim-faturamento`,
            'Faturamento',
            respostas.faturamento,
            faixas('faturamento'),
            (v) => onRespostas({ ...respostas, faturamento: v }),
          )}
          {seletor(
      `${prefixo}-sim-atendimento`,
            'Atendimento',
            respostas.atendimento,
            opcoes('atendimento'),
            (v) => onRespostas({ ...respostas, atendimento: v }),
          )}
          {seletor(
      `${prefixo}-sim-rotina`, 'Rotina', respostas.rotina, opcoes('rotina'), (v) =>
            onRespostas({ ...respostas, rotina: v }),
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Settings2 className="size-4 text-primary" /> Simulação
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{cenario}</p>

        <div className="mt-4 space-y-2 text-sm">
          {foco?.linhas.map((linha) => (
            <div
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
            </div>
          ))}
          {fatores.map((fator) => (
            <div
              key={fator.dimensao}
              className="flex justify-between gap-2 text-muted-foreground"
            >
              <span className="truncate">
                {fator.rotulo} ({(fator.multiplicadorMilesimos / 1000).toFixed(2)}x)
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {fator.efeito > 0 ? '+ ' : ''}
                {formatarCentavos(fator.efeito)}
              </span>
            </div>
          ))}
        </div>

        <Separator className="my-4" />
        <div className="flex items-end justify-between">
          <span className="text-xs text-muted-foreground">
            Total mensal · {servicoFoco?.nome}
          </span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {foco ? formatarCentavos(foco.mensalCentavos) : '—'}
          </span>
        </div>

        <Separator className="my-4" />
        <ul className="space-y-1.5 text-sm">
          {precos.map((preco) => {
            const servico = tabela.servicos.find((s) => s.codigo === preco.servico)
            const emFoco = preco.servico === foco?.servico
            return (
              <li
                key={preco.servico}
                className={`flex items-baseline justify-between gap-2 rounded-md px-2 py-1 ${
                  emFoco ? 'bg-accent' : ''
                }`}
              >
                <span className="truncate text-xs text-muted-foreground">
                  {servico?.nome}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatarCentavos(preco.mensalCentavos)}
                </span>
              </li>
            )
          })}
        </ul>

        {foco ? (
          <>
            <Separator className="my-4" />
            <ul className="space-y-1.5 text-xs">
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

        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href="/precos" target="_blank" rel="noreferrer">
            <Eye /> Abrir página de preços
          </Link>
        </Button>
      </div>

      {combo?.combo ? (
        <div className="rounded-xl border border-primary/30 bg-accent p-4">
          <p className="text-xs font-semibold text-accent-foreground">
            Pacote Empresarial Completo
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Separados {formatarCentavos(combo.combo.separadoCentavos)} · no pacote{' '}
            {formatarCentavos(combo.mensalCentavos)} · economia de{' '}
            <span className="font-semibold text-primary">
              {formatarCentavos(combo.combo.economiaMensalCentavos)}/mês
            </span>{' '}
            ({formatarCentavos(combo.combo.economiaAnualCentavos)}/ano).
          </p>
        </div>
      ) : null}
    </div>
  )
}
