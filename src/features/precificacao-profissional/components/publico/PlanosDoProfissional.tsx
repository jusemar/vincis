'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { CartaoDoPreco } from './CartaoDoPreco'
import { ConfiguradorDaEmpresa } from './ConfiguradorDaEmpresa'

/**
 * Os planos e preços de um Profissional, como o cliente os vê.
 *
 * A tabela chega pronta do servidor e vive aqui como propriedade — o mesmo
 * desenho de `/precos`. O motor é puro e roda no navegador sobre ela: cada
 * clique no configurador recalcula na hora, sem uma ida ao servidor por
 * resposta.
 *
 * O componente não sabe se está numa página pública ou dentro da prévia do
 * painel. É de propósito: a prévia precisa mostrar **exatamente** o que o
 * cliente veria, e a única forma de garantir isso é ser a mesma tela.
 */
export function PlanosDoProfissional({
  tabela,
  nome,
  primeiroNome,
  voltarPara,
  demonstracao = false,
}: {
  tabela: TabelaPrecificacao
  nome: string
  primeiroNome: string
  /** Link de volta ao perfil. Ausente na prévia do painel. */
  voltarPara?: string
  /** Prévia do painel: sem ação de contratar e com aviso de demonstração. */
  demonstracao?: boolean
}) {
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(() =>
    respostasIniciais(tabela),
  )

  return (
    <main className={demonstracao ? '' : 'min-h-screen bg-background'}>
      {demonstracao ? null : (
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-12 sm:pt-20">
            {voltarPara ? (
              <Link
                href={voltarPara}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Voltar ao perfil de {primeiroNome}
              </Link>
            ) : null}
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
              Planos e preços
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl leading-[1.1] font-bold text-foreground sm:text-5xl">
              Quanto {primeiroNome} cobra para cuidar da sua contabilidade
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Responda sobre a empresa e o valor mensal aparece na hora. Os
              preços são definidos por {nome} — não são a tabela da Vincis.
            </p>
          </div>
        </section>
      )}

      <section
        className={
          demonstracao ? '' : 'mx-auto max-w-6xl px-5 py-10'
        }
      >
        {/*
          Na prévia o valor vem primeiro.

          O conteúdo é o mesmo da página pública — mesmo configurador, mesmo
          card, mesmo motor. O que muda é a ordem de empilhamento: a prévia vive
          numa coluna estreita ao lado dos campos, e com o card embaixo do
          formulário inteiro o preço ficaria fora da tela justamente enquanto o
          Profissional digita o preço. Ali a pergunta é "quanto ficou?", e a
          resposta precisa estar à vista.
        */}
        <div
          className={
            demonstracao
              ? 'flex min-w-0 flex-col-reverse gap-4'
              : 'grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start'
          }
        >
          <div className="min-w-0">
            <ConfiguradorDaEmpresa
              tabela={tabela}
              respostas={respostas}
              onChange={setRespostas}
              compacto={demonstracao}
            />
          </div>

          <div className="min-w-0">
            <CartaoDoPreco
              tabela={tabela}
              respostas={respostas}
              primeiroNome={primeiroNome}
              rodape={
                demonstracao ? null : (
                  <Button className="w-full" asChild>
                    <Link href="/perfil-profissional">
                      Falar com {primeiroNome} <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )
              }
            />

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Valor calculado a partir do perfil informado. A proposta final é
              confirmada por {primeiroNome} após a análise dos documentos da
              empresa.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
