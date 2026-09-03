import { formatarCentavos } from '@/features/precificacao/lib/formato'
import type { SimulacaoDaOportunidade } from '../../types/oportunidade'

function formatarQuando(iso: string) {
  const data = new Date(iso)
  return Number.isNaN(data.getTime())
    ? iso
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(data)
}

/**
 * O que o cliente viu na simulação, como as duas pontas leem.
 *
 * Um componente só para os dois painéis, e não dois parecidos: o retrato é o
 * mesmo fato, e a única forma de garantir que o Profissional e o Cliente estão
 * olhando exatamente o mesmo cenário é ser a mesma tela. Ele é de **servidor** —
 * não há interação aqui, só leitura.
 *
 * Tudo vem congelado do banco: nenhum número é recalculado aqui, e nenhuma
 * consulta à tabela de preços atual acontece. Se o Profissional republicou o
 * preço depois, este bloco continua contando o que aconteceu.
 *
 * A última linha é obrigatória e não é decoração: a tela mostra um valor em
 * reais, e quem lê precisa saber que ele não é proposta, cobrança nem acordo.
 */
export function RetratoDaSimulacao({
  simulacao,
  titulo = 'Simulação do cliente',
}: {
  simulacao: SimulacaoDaOportunidade
  titulo?: string
}) {
  return (
    <section className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-primary">
          {titulo}
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {formatarQuando(simulacao.simuladaEm)}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {simulacao.itens.map((item) => (
          <div
            key={item.codigo}
            className="flex items-baseline justify-between gap-3 text-xs"
          >
            <dt className="text-muted-foreground">{item.rotulo}</dt>
            <dd className="shrink-0 font-medium text-foreground">
              {item.valor}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-primary/20 pt-2 text-xs font-semibold text-foreground">
        <span>Valor mensal exibido</span>
        <span className="tabular-nums">
          {formatarCentavos(simulacao.precoMensalCentavos)}
        </span>
      </p>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Valor apresentado na simulação — não é proposta, cobrança nem
        contratação.
      </p>
    </section>
  )
}
