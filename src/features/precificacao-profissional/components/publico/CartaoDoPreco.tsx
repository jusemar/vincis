'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { rotuloDaLinha } from '@/features/precificacao/lib/descricao'
import {
  formatarCentavos,
  reaisDeCentavos,
} from '@/features/precificacao/lib/formato'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { AnimatedPrice } from '@/features/precos/components/AnimatedPrice'
import {
  GRUPO_DO_PROFISSIONAL,
  SERVICO_DO_PROFISSIONAL,
} from '../../constants/precificacao-profissional'

/**
 * O preço mensal deste Profissional para este perfil de empresa.
 *
 * ## Um número, e a conta que levou até ele
 *
 * Nada é calculado aqui. `calcularPreco` é o motor da Vincis, chamado sobre a
 * tabela do Profissional — as mesmas linhas de composição, o mesmo
 * arredondamento, a mesma explicação em "Como chegamos nesse valor?". A
 * diferença entre esta tela e a de `/precos` está inteiramente na tabela que
 * cada uma recebe.
 *
 * ## Um card, e não uma grade de planos
 *
 * A vitrine da Vincis compara Padrão, Consultiva, Jurídico e Pacote, e mostra
 * o mesmo mensal em três prazos. Aqui o cliente veio fazer uma pergunta só, e
 * ela tem uma resposta só: quanto custa por mês. Sem escolha de produto, sem
 * prazo, sem desconto — porque a tabela do Profissional não tem nenhum dos
 * três, e não porque este componente os esconde.
 */
export function CartaoDoPreco({
  tabela,
  respostas,
  primeiroNome,
  rodape,
}: {
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
  primeiroNome: string
  /** Ação ou aviso abaixo do preço. A prévia do painel usa um diferente. */
  rodape?: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)

  /*
    O cálculo é a única coisa aqui que pode falhar, e falhar não pode levar a
    página junto: uma resposta que a tabela não conhece — porque a grade mudou
    entre o carregamento e o clique — vira um aviso, e o resto continua em pé.
  */
  const calculo = (() => {
    try {
      return {
        resultado: calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, respostas),
        erro: null as string | null,
      }
    } catch (erro) {
      return {
        resultado: null,
        erro:
          erro instanceof Error
            ? erro.message
            : 'Não foi possível calcular este perfil.',
      }
    }
  })()

  if (!calculo.resultado) {
    return (
      <article className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="size-4" /> Não foi possível calcular
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Ajuste uma das respostas acima e o valor volta a aparecer.
        </p>
      </article>
    )
  }

  const resultado = calculo.resultado
  const servico = tabela.servicos.find(
    (s) => s.codigo === SERVICO_DO_PROFISSIONAL,
  )

  return (
    <article className="flex flex-col rounded-2xl border border-primary bg-card p-5 shadow-md">
      <span className="mb-2 inline-block w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
        Preço de {primeiroNome}
      </span>
      <h3 className="text-lg font-bold text-foreground">{servico?.nome}</h3>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {servico?.chamada}
      </p>

      <div className="mt-4 rounded-xl bg-primary/10 px-4 py-3">
        <p className="text-xs font-medium text-primary">Valor mensal</p>
        <p className="flex items-baseline gap-1">
          <span className="text-sm font-medium text-muted-foreground">R$</span>
          <span className="text-4xl font-bold tabular-nums text-foreground">
            <AnimatedPrice value={reaisDeCentavos(resultado.mensalCentavos)} />
          </span>
          <span className="text-sm text-muted-foreground">/mês</span>
        </p>
      </div>

      <Collapsible open={aberto} onOpenChange={setAberto} className="mt-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
          >
            {aberto ? 'Ocultar cálculo' : 'Como chegamos nesse valor?'}
            <ChevronDown
              className={`size-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="mt-3 space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs">
            {resultado.linhas.map((linha) => {
              const rotulo = rotuloDaLinha(linha, GRUPO_DO_PROFISSIONAL)
              return (
                <li
                  key={rotulo}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-muted-foreground">{rotulo}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatarCentavos(linha.valorCentavos)}
                  </span>
                </li>
              )
            })}
            {resultado.fatores.map((fator) => (
              <li
                key={fator.dimensao}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-muted-foreground">{fator.rotulo}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  ×{(fator.multiplicadorMilesimos / 1000).toFixed(2)}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5 font-semibold text-foreground">
              <span>Total mensal</span>
              <span className="tabular-nums">
                {formatarCentavos(resultado.mensalCentavos)}
              </span>
            </li>
          </ul>
        </CollapsibleContent>
      </Collapsible>

      {rodape ? <div className="mt-4">{rodape}</div> : null}
    </article>
  )
}
