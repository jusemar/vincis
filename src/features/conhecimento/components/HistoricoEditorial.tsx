import { ROTULO_ACAO_EDITORIAL, type AcaoEditorial } from '../constants/status'
import type { DecisaoHistorico } from '../types/artigo'

const FORMATO = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/** Linha do tempo editorial (autor e Gestão leem a mesma). */
export function HistoricoEditorial({ itens, mostrarExecutor = true }: { itens: DecisaoHistorico[]; mostrarExecutor?: boolean }) {
  if (!itens.length) return <p className="text-sm text-muted-foreground">Sem movimentações ainda.</p>
  return (
    <ol className="space-y-3">
      {itens.map((item) => (
        <li key={item.id} className="border-l-2 border-primary/30 pl-3 text-sm">
          <p className="font-semibold text-foreground">
            {ROTULO_ACAO_EDITORIAL[item.acao as AcaoEditorial] ?? item.acao}
          </p>
          <p className="text-xs text-muted-foreground">
            {FORMATO.format(item.criadoEm)}
            {mostrarExecutor && item.executorNome ? ` · ${item.executorNome}` : ''}
          </p>
          {item.observacao ? <p className="mt-1 whitespace-pre-line text-muted-foreground">{item.observacao}</p> : null}
        </li>
      ))}
    </ol>
  )
}
