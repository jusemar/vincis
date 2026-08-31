'use client'

import Link from 'next/link'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * O que a Precificação mostra ao Gestor quando não consegue ler a configuração.
 *
 * ## Por que ela existe
 *
 * A leitura da tabela **falha alto** de propósito: uma grade incoerente lança
 * em vez de virar um preço que ninguém consegue explicar. Só que deixar essa
 * exceção subir pela rota não produzia uma tela de erro — produzia a tela de
 * carregamento do painel, parada para sempre. A área administrativa inteira
 * vive atrás de dois portões de cliente (sessão e contexto da empresa) que
 * renderizam um aviso de espera no lugar do conteúdo; um Componente de
 * Servidor que estoura lá dentro nunca chega a ser montado, e a fronteira de
 * erro que o cobriria também não. Quem administra preço via "Preparando seu
 * espaço de trabalho..." e nada mais.
 *
 * Por isso a rota trata a falha em vez de deixá-la subir — o mesmo desenho que
 * `/precos` já usava. A fronteira de erro continua existindo como segunda
 * porta, para o que estourar durante a renderização.
 *
 * ## O que ela diz
 *
 * Que a configuração não pôde ser lida, que nada foi alterado e o que fazer.
 * Nunca a mensagem do erro, o nome de uma tabela, uma consulta ou uma pilha: o
 * detalhe fica no relatório do servidor, onde o registro da Precificação já o
 * guarda.
 */
export function PrecificacaoIndisponivel({ aoTentarDeNovo }: { aoTentarDeNovo?: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>

        <h1 className="mt-6 text-xl font-semibold text-foreground">
          Não foi possível abrir a Precificação
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A configuração comercial não pôde ser lida agora, e esta tela prefere
          não mostrar valores em que não se pode confiar. Nada foi alterado, e a
          página de preços já está protegida do mesmo jeito. Tente de novo em
          instantes — se continuar assim, avise a equipe técnica da Vincis.
        </p>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={aoTentarDeNovo ?? (() => window.location.reload())}>
            <RotateCcw /> Tentar de novo
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/central">Voltar para a Central</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
