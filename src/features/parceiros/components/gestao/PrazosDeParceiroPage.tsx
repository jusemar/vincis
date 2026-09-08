'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  definirPrazoDoServico,
  definirPrazoPadraoDeParceiro,
} from '../../actions/definir-prazo'
import {
  PRAZO_MAXIMO_DIAS,
  PRAZO_MINIMO_DIAS,
  rotuloDaReferencia,
  type PrazoVigente,
} from '../../constants/prazo'

/**
 * Prazo das indicações, na Gestão Vincis.
 *
 * ## O que a tela promete
 *
 * Um número por serviço, mais um padrão para os que não têm número próprio. É
 * o mínimo que a regra exige, e nada além: comissão, níveis e cupons ainda não
 * existem, e oferecer campos para eles ensinaria a ignorar a tela.
 *
 * ## O aviso é a regra
 *
 * "Vale apenas para novas indicações" aparece em cada bloco porque é a decisão
 * mais fácil de entender errado: a Gestão pode achar que subir de 30 para 60
 * estende quem já está em curso. Não estende — o prazo é copiado para o
 * registro no instante em que a indicação nasce.
 */
function CampoDePrazo({
  titulo,
  ajuda,
  valorInicial,
  placeholder,
  onSalvar,
  icone: Icone,
}: {
  titulo: string
  ajuda: string
  valorInicial: string
  placeholder?: string
  onSalvar: (dias: string) => Promise<{ sucesso: boolean; mensagem: string }>
  icone: typeof Timer
}) {
  const router = useRouter()
  const [valor, setValor] = useState(valorInicial)
  const [salvando, iniciarTransicao] = useTransition()
  const id = `prazo-${titulo.toLowerCase().replace(/\s+/g, '-')}`

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await onSalvar(valor)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <Card className="border-border/70 bg-card/90 backdrop-blur">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">{titulo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ajuda}</p>
          </div>
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={salvar}>
          <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs">
              Prazo em dias
            </Label>
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={PRAZO_MINIMO_DIAS}
              max={PRAZO_MAXIMO_DIAS}
              value={valor}
              placeholder={placeholder}
              onChange={(evento) => setValor(evento.target.value)}
              className="w-32 tabular-nums"
            />
          </div>
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Vale apenas para novas indicações. As que já existem mantêm o prazo com
          que nasceram.
        </p>
      </CardContent>
    </Card>
  )
}

export function PrazosDeParceiroPage({
  padrao,
  servicos,
}: {
  padrao: PrazoVigente
  servicos: { referencia: string; dias: number | null }[]
}) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Programa de Parceiros
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold">
          Prazo das indicações
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Por quantos dias uma indicação continua valendo para o negócio que ela
          originou. Cada serviço pode ter o seu; os que não tiverem usam o padrão.
        </p>
      </header>

      <CampoDePrazo
        icone={Timer}
        titulo="Prazo padrão"
        ajuda={
          padrao.origem === 'servico' || padrao.origem === 'padrao'
            ? 'Aplicado a todo serviço sem prazo próprio.'
            : `Ainda não definido pela Gestão — hoje vale o ponto de partida de ${padrao.dias} dia(s).`
        }
        valorInicial={String(padrao.dias)}
        onSalvar={(dias) => definirPrazoPadraoDeParceiro({ dias })}
      />

      <section className="space-y-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Por serviço
        </h2>
        {servicos.map((servico) => (
          <CampoDePrazo
            key={servico.referencia}
            icone={CalendarClock}
            titulo={rotuloDaReferencia(servico.referencia)}
            ajuda={
              servico.dias === null
                ? `Sem prazo próprio — usa o padrão de ${padrao.dias} dia(s).`
                : 'Prazo próprio, definido pela Gestão.'
            }
            valorInicial={servico.dias === null ? '' : String(servico.dias)}
            placeholder={String(padrao.dias)}
            onSalvar={(dias) =>
              definirPrazoDoServico({ referencia: servico.referencia, dias })
            }
          />
        ))}
      </section>
    </div>
  )
}
