'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Percent } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { definirComissaoServicosAvulsos } from '../../actions/comissao'
import { formatarPercentualMilesimos } from '../../constants/comissao'

/**
 * Comissão da Vincis nos serviços avulsos, na Gestão Vincis.
 *
 * Sem valor configurado não existe padrão: o card mostra "Configuração
 * pendente" e a contratação paga de serviço avulso fica indisponível até a
 * Gestão definir o percentual — melhor nenhuma cobrança do que uma divisão
 * errada. Não tem relação com a comissão do parceiro indicador.
 */
export function ComissaoServicosAvulsosCard({ milesimos }: { milesimos: number | null }) {
  const router = useRouter()
  const [valor, setValor] = useState(milesimos === null ? '' : (milesimos / 10).toLocaleString('pt-BR'))
  const [salvando, iniciarTransicao] = useTransition()

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await definirComissaoServicosAvulsos({ percentual: valor })
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
            <Percent className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              Comissão da Vincis (avulsos e planos)
              {milesimos === null ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Configuração pendente
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  Atual: {formatarPercentualMilesimos(milesimos)}
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Percentual que a Vincis retém do valor pago pelo cliente em serviços avulsos e planos recorrentes
              intermediados pela Vincis; o restante é do profissional. A comissão do parceiro indicador sai da
              parte da Vincis. Honorários advocatícios e recorrentes diretos de Autônomos ficam fora.
            </p>
          </div>
        </div>

        {milesimos === null ? (
          <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            Enquanto não houver percentual definido, serviços avulsos e planos não podem ser pagos pela Vincis.
          </p>
        ) : null}

        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={salvar}>
          <div className="space-y-1.5">
            <Label htmlFor="comissao-servicos-avulsos" className="text-xs">
              Percentual (%)
            </Label>
            <Input
              id="comissao-servicos-avulsos"
              inputMode="decimal"
              placeholder="Ex.: 15"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-32"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar comissão'}
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">
            Vale para novas cobranças. Cada contratação guarda o percentual com que foi paga.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
