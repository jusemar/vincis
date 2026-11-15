'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  rotuloDaCapacidade,
  situacaoDaCapacidade,
  type Ocupacao,
} from '@/features/assinaturas/constants/contador-responsavel'
import { cn } from '@/lib/utils'
import { definirCapacidadeClientes } from '../../actions/capacidade'
import { CapacidadeClientesSchema, type CapacidadeClientesDTO } from '../../schemas/capacidade'

/**
 * "Capacidade máxima de clientes recorrentes" do contador parceiro, na Gestão.
 *
 * Mostra a ocupação atual (só planos pagos) e deixa o Gestor definir o limite
 * ou deixar sem limite. Baixar abaixo da ocupação não remove ninguém.
 */
export function CapacidadeClientesGestao({
  usuarioId,
  capacidade,
  ocupacao,
}: {
  usuarioId: string
  capacidade: number | null
  /** Ativos + reservas de planos pendentes já alocados. */
  ocupacao: Ocupacao
}) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()
  const { lotado, acimaDoLimite } = situacaoDaCapacidade(capacidade, ocupacao)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CapacidadeClientesDTO>({
    resolver: zodResolver(CapacidadeClientesSchema),
    defaultValues: { usuarioId, capacidade: capacidade === null ? '' : String(capacidade) },
  })

  const salvar = handleSubmit((dados) =>
    iniciar(async () => {
      const resultado = await definirCapacidadeClientes(dados)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      // O valor salvo vira a nova base: o botão volta a desabilitar.
      reset(dados)
      router.refresh()
    }),
  )

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={salvar} className="space-y-4">
          <input type="hidden" {...register('usuarioId')} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Users className="size-5 text-primary" />
              Capacidade de clientes recorrentes
            </h2>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                lotado
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {rotuloDaCapacidade(capacidade, ocupacao)}
            </span>
          </div>
          {acimaDoLimite ? (
            <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              Acima da capacidade: ninguém é removido, mas novas alocações ficam bloqueadas até a ocupação ficar abaixo
              do limite.
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="capacidade-clientes">Capacidade máxima de clientes recorrentes</Label>
            <Input
              id="capacidade-clientes"
              inputMode="numeric"
              placeholder="Sem limite definido"
              className="sm:max-w-xs"
              {...register('capacidade')}
            />
            {errors.capacidade ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.capacidade.message}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Ocupação = clientes ativos + planos aguardando pagamento já alocados (reserva de vaga). Pix vencido ou
            cancelado libera a reserva. No limite, o contador continua com os clientes atuais e deixa de aparecer para
            novos clientes e novas alocações. Vazio = sem limite definido.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={salvando || !isDirty}>
              {salvando ? 'Salvando...' : 'Salvar capacidade'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
