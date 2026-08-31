'use client'

import Link from 'next/link'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * O que a página de preços mostra quando não pode calcular.
 *
 * ## Por que não existe um número aqui
 *
 * Porque um preço errado é pior do que preço nenhum. Se a configuração
 * comercial não pode ser lida, ou não passa nas garantias — preço zerado,
 * desconto que anula a mensalidade, pacote mais caro que a soma —, qualquer
 * valor exibido seria um compromisso que a Vincis não pretendeu assumir. Não
 * há preço antigo guardado no código para cair, e não deve haver: um fallback
 * silencioso é justamente o defeito que ninguém percebe.
 *
 * ## Por que ainda é uma página comercial
 *
 * Quem chegou até aqui estava pesquisando preço. Devolver uma tela de erro
 * técnica perde a pessoa e não informa nada a ela. A página assume o tom de
 * quem continua querendo atender: explica em uma frase, oferece a proposta
 * pelos caminhos que a plataforma já tem e não menciona banco, consulta nem
 * qualquer detalhe interno.
 */
export function PrecoIndisponivel() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageCircle className="size-6" />
        </div>

        <h1 className="mt-6 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
          Não foi possível calcular seu valor agora
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          A simulação de preços está indisponível neste momento. Nossa equipe
          pode preparar uma proposta para a sua empresa — com o mesmo cuidado de
          sempre, e sem depender desta página.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/cliente?aba=orcamentos">
              Pedir uma proposta <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/suporte">Falar com a Vincis</Link>
          </Button>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Enquanto isso, você pode conhecer{' '}
          <Link href="/profissionais" className="underline underline-offset-4">
            os profissionais da plataforma
          </Link>{' '}
          e{' '}
          <Link href="/como-funciona" className="underline underline-offset-4">
            como a Vincis funciona
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
