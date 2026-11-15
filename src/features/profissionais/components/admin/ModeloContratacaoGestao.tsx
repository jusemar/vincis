'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Handshake } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { definirModeloContratacao } from '../../actions/modelo-contratacao'
import {
  OPCOES_MODELO_ADMIN,
  ROTULO_MODELO_CONTRATACAO,
  ehModeloContratacao,
  type ModeloContratacao,
} from '../../constants/modelo-contratacao'

/**
 * "Modelo de contratação" do profissional contábil, na Gestão.
 *
 * Mostra o estado atual em destaque (inclusive "Não definido", que não aparece
 * em lugar nenhum público) e deixa o Gestor escolher entre as duas opções.
 */
export function ModeloContratacaoGestao({ usuarioId, atual }: { usuarioId: string; atual: string | null }) {
  const router = useRouter()
  const doServidor: ModeloContratacao | null = ehModeloContratacao(atual) ? atual : null
  /*
    O valor salvo fica também no estado local: logo após o sucesso o botão já
    volta a "sem alteração" (desativado), sem esperar o `router.refresh()`
    trazer o novo `atual` — nesse intervalo ele reabilitaria e convidaria a
    um segundo clique.
  */
  const [salvo, setSalvo] = useState<ModeloContratacao | null>(doServidor)
  const [escolha, setEscolha] = useState<ModeloContratacao | null>(doServidor)
  const [salvando, iniciar] = useTransition()
  const alterado = escolha !== salvo

  function salvar() {
    if (salvando || !alterado) return
    iniciar(async () => {
      try {
        const resultado = await definirModeloContratacao({ usuarioId, modelo: escolha })
        if (!resultado.sucesso) {
          // A escolha continua marcada: o Gestor pode tentar de novo.
          toast.error(resultado.mensagem)
          return
        }
        setSalvo(escolha)
        toast.success(resultado.mensagem)
        router.refresh()
      } catch {
        // Falha de rede/servidor: sem isso a transição terminava em silêncio.
        toast.error('Não foi possível salvar o modelo de contratação. Tente novamente.')
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <Handshake className="size-5 text-primary" />
            Modelo de contratação
          </h2>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold',
              salvo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            Atual: {OPCOES_MODELO_ADMIN[salvo ?? 'nao_definido']}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modelo de contratação">
          {(['vincis', 'autonomo'] as const).map((modelo) => (
            <button
              key={modelo}
              type="button"
              role="radio"
              aria-checked={escolha === modelo}
              onClick={() => setEscolha(modelo)}
              disabled={salvando}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                escolha === modelo ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
              )}
            >
              <span className="block text-sm font-semibold text-foreground">{OPCOES_MODELO_ADMIN[modelo]}</span>
              <span className="block text-xs text-muted-foreground">{ROTULO_MODELO_CONTRATACAO[modelo].descricao}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Autônomo: planos recorrentes não são contratados nem pagos pela Vincis. Enquanto não definido, nada é exibido
          no card e no perfil público.
        </p>
        <div className="flex justify-end">
          {/* Desativado sem alteração; processando mantém o destaque com indicador e bloqueia o duplo clique. */}
          <Button
            type="button"
            onClick={salvar}
            disabled={!alterado && !salvando}
            carregando={salvando}
            className="w-full sm:w-auto"
          >
            {salvando ? 'Salvando…' : 'Salvar modelo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
