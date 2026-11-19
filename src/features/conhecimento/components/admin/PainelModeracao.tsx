'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Check, EyeOff, RotateCcw, Star, StarOff, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { decidirArtigo } from '../../actions/moderacao'
import { LIMITES_ARTIGO } from '../../constants/limites'

type Decisao =
  | 'aprovar'
  | 'devolver'
  | 'rejeitar'
  | 'despublicar'
  | 'republicar'
  | 'arquivar'
  | 'destacar'
  | 'remover_destaque'

/**
 * Botões de decisão da Gestão. Quais aparecem é calculado no servidor
 * (`disponiveis`); a action confere de novo — o botão é só conveniência.
 */
export function PainelModeracao({
  artigoId,
  disponiveis,
}: {
  artigoId: string
  disponiveis: Decisao[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [observacao, setObservacao] = useState('')

  function decidir(decisao: Decisao) {
    const exigeObservacao = decisao === 'devolver' || decisao === 'rejeitar'
    if (exigeObservacao && observacao.trim().length < 10) {
      toast.error('Escreva ao autor o motivo (mínimo de 10 caracteres).')
      return
    }
    if (decisao === 'rejeitar' && !window.confirm('Rejeitar em definitivo? O autor não poderá reenviar esta versão.')) return
    if (decisao === 'arquivar' && !window.confirm('Arquivar o artigo? Ele sai do ar e não pode mais ser editado.')) return
    iniciar(async () => {
      const resposta = await decidirArtigo({
        artigoId,
        decisao,
        ...(decisao === 'destacar' || decisao === 'remover_destaque' ? {} : { observacao: observacao.trim() || undefined }),
      })
      if (!resposta.sucesso) {
        toast.error(resposta.mensagem)
        return
      }
      toast.success(resposta.mensagem)
      setObservacao('')
      router.refresh()
    })
  }

  if (!disponiveis.length) return <p className="text-sm text-muted-foreground">Nenhuma decisão disponível neste estado.</p>

  const botoes: { decisao: Decisao; rotulo: string; Icone: typeof Check; variante: 'default' | 'outline' | 'destructive' | 'ghost' }[] = [
    { decisao: 'aprovar', rotulo: 'Aprovar e publicar', Icone: Check, variante: 'default' },
    { decisao: 'devolver', rotulo: 'Devolver para ajustes', Icone: Undo2, variante: 'outline' },
    { decisao: 'rejeitar', rotulo: 'Rejeitar', Icone: X, variante: 'destructive' },
    { decisao: 'republicar', rotulo: 'Publicar novamente', Icone: RotateCcw, variante: 'default' },
    { decisao: 'despublicar', rotulo: 'Despublicar', Icone: EyeOff, variante: 'outline' },
    { decisao: 'destacar', rotulo: 'Destacar na Central', Icone: Star, variante: 'outline' },
    { decisao: 'remover_destaque', rotulo: 'Remover destaque', Icone: StarOff, variante: 'outline' },
    { decisao: 'arquivar', rotulo: 'Arquivar', Icone: Archive, variante: 'ghost' },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="observacao-moderacao">Observação ao autor</Label>
        <Textarea
          id="observacao-moderacao"
          rows={4}
          maxLength={LIMITES_ARTIGO.observacao}
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
          placeholder="Obrigatória para devolver ou rejeitar. Ex.: confira a alíquota citada no 3º parágrafo."
        />
      </div>
      <div className="flex flex-col gap-2">
        {botoes
          .filter((botao) => disponiveis.includes(botao.decisao))
          .map(({ decisao, rotulo, Icone, variante }) => (
            <Button key={decisao} type="button" variant={variante} className="justify-start gap-2" disabled={pendente} onClick={() => decidir(decisao)}>
              <Icone className="size-4" aria-hidden /> {rotulo}
            </Button>
          ))}
      </div>
    </div>
  )
}
