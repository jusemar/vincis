'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { definirPrazoOportunidade } from '../actions/configuracoes'
import { CHAVE_PRAZO_OPORTUNIDADE, CONFIGURACOES } from '../lib/configuracoes'

const definicao = CONFIGURACOES[CHAVE_PRAZO_OPORTUNIDADE]

/**
 * Prazo global das oportunidades, na Gestão Vincis.
 *
 * O número vive no banco, não no código: é decisão de produto e muda sem
 * deploy. A alteração vale para as solicitações **futuras** — as em curso já
 * carregam o próprio vencimento, congelado na publicação, para que mexer aqui
 * não encurte negociação de ninguém.
 */
export function PrazoOportunidadeCard({ horas }: { horas: number }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(horas))
  const [salvando, iniciarTransicao] = useTransition()

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await definirPrazoOportunidade({ horas: valor })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <Card className="w-full max-w-2xl border-border/70 bg-card/90 backdrop-blur">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Timer className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">{definicao.rotulo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {definicao.ajuda}
            </p>
          </div>
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={salvar}>
          <div className="space-y-1.5">
            <Label htmlFor="prazo-oportunidade" className="text-xs">
              Prazo em {definicao.unidade}
            </Label>
            <Input
              id="prazo-oportunidade"
              type="number"
              min={definicao.minimo}
              max={definicao.maximo}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-32"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar prazo'}
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">
            Vale para novas solicitações. As que já estão em andamento mantêm o
            prazo com que foram publicadas.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
