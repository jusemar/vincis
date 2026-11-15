import { Info } from 'lucide-react'
import { Pilula, Trilha } from '@/features/portal-cliente/components/ui/primitivos'
import type { AtendimentoDoClienteDTO } from '../../types/atendimento'

/**
 * O topo do Atendimento na área do Cliente, na hierarquia aprovada:
 *
 * 1. **Jornada** — `Pagamento confirmado → Em atendimento → Concluído`;
 * 2. **Situação atual** — quem precisa agir (com o alerta, quando há);
 * 3. **O que acontece agora?** — o próximo passo em linguagem direta.
 *
 * Prazo e histórico continuam nos blocos de baixo. Tudo aqui vem pronto do
 * servidor (`lib/andamento.ts`): o componente não decide nada.
 *
 * Encerrado (recusado, cancelado ou encerrado sem conclusão) não mostra a
 * jornada — ela não terminou em "Concluído" e fingir progresso confundiria —,
 * só o aviso neutro, sem nenhuma promessa financeira.
 */
export function AndamentoDoAtendimento({
  atendimento,
}: {
  atendimento: AtendimentoDoClienteDTO
}) {
  const { andamento } = atendimento
  const { apresentacao } = andamento

  if (andamento.fase === 'encerrado') {
    return (
      <section aria-label="Situação do atendimento" className="rounded-xl border bg-muted/30 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {apresentacao.rotulo}
        </p>
        {apresentacao.oQueAcontece.map((paragrafo) => (
          <p key={paragrafo} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {paragrafo}
          </p>
        ))}
      </section>
    )
  }

  return (
    <section aria-label="Andamento do atendimento" className="space-y-4">
      <Trilha
        passos={andamento.jornada.passos.map((rotulo) => ({ rotulo }))}
        atual={andamento.jornada.atual}
      />

      {andamento.fase === 'em_atendimento' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Situação atual</span>
          <Pilula rotulo={apresentacao.rotulo} tom={apresentacao.tom} />
        </div>
      ) : null}

      <div className="rounded-xl border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold text-foreground">O que acontece agora?</h3>
        {apresentacao.oQueAcontece.map((paragrafo) => (
          <p key={paragrafo} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {paragrafo}
          </p>
        ))}
      </div>
    </section>
  )
}
