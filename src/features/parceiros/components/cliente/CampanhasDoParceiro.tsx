import { CheckCircle2, Flag, Sparkles, Trophy } from 'lucide-react'
import { Pilula, type Tom } from '@/features/portal-cliente/components/ui/primitivos'
import {
  ROTULO_SITUACAO_CAMPANHA,
  ROTULO_TIPO_META,
  descreverRecompensa,
  formatarProgresso,
  reaisDeCentavos,
  textoDoQueFalta,
  type SituacaoCampanha,
} from '../../constants/campanha'
import type { CampanhaDoParceiro, ExtratoDePontos } from '../../lib/campanhas'

/**
 * Campanhas do parceiro, com dados reais.
 *
 * Progresso, recompensa e pontos vêm do servidor, reconciliados com os fatos de
 * negócio no momento da leitura. A linguagem acompanha o estado real do
 * dinheiro: "disponível para saque" só quando está, "reservado" quando está
 * num saque pedido, "pago" quando saiu. Nada aqui promete o que ainda depende
 * de condição.
 */

const TOM_DA_SITUACAO: Record<SituacaoCampanha, Tom> = {
  ativa: 'sucesso',
  agendada: 'info',
  encerrada: 'neutro',
  rascunho: 'neutro',
  cancelada: 'neutro',
}

const DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sem passar por fuso. */
function data(dataLocal: string) {
  const [ano, mes, dia] = dataLocal.split('-')
  return `${dia}/${mes}/${ano}`
}

function estadoDaRecompensa(campanha: CampanhaDoParceiro): string[] {
  const recompensa = campanha.recompensa
  if (!recompensa) return []
  if (recompensa.status === 'revertida') {
    return ['Recompensa revertida: a meta deixou de estar sustentada por negócios válidos.']
  }
  const linhas: string[] = []
  if (recompensa.bonusCentavos > 0) {
    const valor = reaisDeCentavos(recompensa.bonusCentavos)
    if (recompensa.compensacaoPendente) linhas.push(`Bônus de ${valor} pago — em revisão pela Vincis.`)
    else if (recompensa.bonusStatus === 'paga') linhas.push(`Bônus de ${valor} pago.`)
    else if (recompensa.bonusReservadoEmSaque) linhas.push(`Bônus de ${valor} reservado em saque solicitado.`)
    else if (recompensa.bonusStatus === 'disponivel') linhas.push(`Bônus de ${valor} disponível para saque.`)
  }
  if (recompensa.pontos > 0) {
    linhas.push(`${recompensa.pontos.toLocaleString('pt-BR')} pontos creditados.`)
  }
  return linhas
}

function CartaoDaCampanha({ campanha }: { campanha: CampanhaDoParceiro }) {
  const percentual = Math.min(100, Math.round((campanha.progresso / campanha.alvo) * 100))
  const falta = textoDoQueFalta(campanha.tipoMeta, campanha.progresso, campanha.alvo)
  const concluida = campanha.recompensa?.status === 'concedida'
  const estado = estadoDaRecompensa(campanha)

  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-lg font-semibold leading-snug">{campanha.titulo}</p>
          {campanha.descricao ? (
            <p className="mt-1 text-sm text-muted-foreground">{campanha.descricao}</p>
          ) : null}
        </div>
        <Pilula
          rotulo={concluida ? 'Meta concluída' : ROTULO_SITUACAO_CAMPANHA[campanha.situacao]}
          tom={concluida ? 'destaque' : TOM_DA_SITUACAO[campanha.situacao]}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {data(campanha.inicio)} a {data(campanha.fim)} · {ROTULO_TIPO_META[campanha.tipoMeta]}
      </p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums">
            {formatarProgresso(campanha.tipoMeta, campanha.progresso, campanha.alvo)}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{percentual}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percentual}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso da campanha ${campanha.titulo}`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
        </div>
        {!concluida && falta && campanha.situacao !== 'encerrada' ? (
          <p className="mt-2 text-xs text-muted-foreground">{falta}</p>
        ) : null}
      </div>

      <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
        <p className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" aria-hidden />
          <span className="text-muted-foreground">Recompensa:</span>
          <span className="font-medium">
            {descreverRecompensa(campanha.bonusCentavos, campanha.pontos)}
          </span>
        </p>
        {estado.map((linha) => (
          <p key={linha} className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden />
            {linha}
          </p>
        ))}
      </div>
    </article>
  )
}

export function CampanhasDoParceiro({
  campanhas,
  pontos,
  parceiroAtivo,
}: {
  campanhas: CampanhaDoParceiro[]
  pontos: ExtratoDePontos
  parceiroAtivo: boolean
}) {
  const grupos: { titulo: string; itens: CampanhaDoParceiro[] }[] = [
    { titulo: 'Ativas', itens: campanhas.filter((c) => c.situacao === 'ativa') },
    { titulo: 'Agendadas', itens: campanhas.filter((c) => c.situacao === 'agendada') },
    { titulo: 'Encerradas', itens: campanhas.filter((c) => c.situacao === 'encerrada') },
  ]

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {!parceiroAtivo ? (
          <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Ative seu link de parceiro para participar das campanhas.
          </p>
        ) : null}
        {campanhas.length === 0 ? (
          <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Flag className="size-4 text-primary" aria-hidden />
              Nenhuma campanha no ar agora
            </p>
            <p className="mt-1">Quando a Vincis publicar uma campanha, ela aparece aqui com a sua meta e o seu progresso.</p>
          </section>
        ) : (
          grupos
            .filter((grupo) => grupo.itens.length)
            .map((grupo) => (
              <section key={grupo.titulo} className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {grupo.titulo}
                </h2>
                {grupo.itens.map((campanha) => (
                  <CartaoDaCampanha key={campanha.id} campanha={campanha} />
                ))}
              </section>
            ))
        )}
      </div>

      <section className="rounded-xl border bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Pontos
        </p>
        <p className="mt-1 flex items-center gap-2 font-serif text-3xl font-semibold tabular-nums">
          <Sparkles className="size-5 text-primary" aria-hidden />
          {pontos.saldo.toLocaleString('pt-BR')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pontos reconhecem suas metas. Não são dinheiro nem entram no saque.
        </p>
        <h3 className="mt-5 text-xs font-medium text-muted-foreground">Extrato</h3>
        {pontos.lancamentos.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum ponto ainda.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {pontos.lancamentos.map((lancamento) => (
              <li key={lancamento.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{lancamento.descricao}</p>
                  <p className="text-[11px] text-muted-foreground">{DIA.format(lancamento.criadoEm)}</p>
                </div>
                <span
                  className={`shrink-0 font-medium tabular-nums ${lancamento.pontos < 0 ? 'text-muted-foreground' : 'text-success'}`}
                >
                  {lancamento.pontos > 0 ? '+' : ''}
                  {lancamento.pontos.toLocaleString('pt-BR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** O bloco do Dashboard: pontos e a campanha ativa mais próxima do fim. */
export function CampanhaEmDestaque({
  campanhas,
  pontos,
}: {
  campanhas: CampanhaDoParceiro[]
  pontos: ExtratoDePontos | null
}) {
  const destaque =
    campanhas.find((c) => c.situacao === 'ativa' && c.recompensa?.status !== 'concedida') ??
    campanhas.find((c) => c.situacao === 'ativa') ??
    null
  const percentual = destaque
    ? Math.min(100, Math.round((destaque.progresso / destaque.alvo) * 100))
    : 0

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Campanhas
          </p>
          <p className="mt-1 font-serif text-lg font-semibold">
            {destaque ? destaque.titulo : 'Nenhuma campanha ativa'}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-[11px] text-muted-foreground">Seus pontos</span>
          <span className="font-serif text-xl font-semibold tabular-nums">
            {(pontos?.saldo ?? 0).toLocaleString('pt-BR')}
          </span>
        </p>
      </div>
      {destaque ? (
        <>
          <p className="text-sm tabular-nums">
            {formatarProgresso(destaque.tipoMeta, destaque.progresso, destaque.alvo)}
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso da campanha ${destaque.titulo}`}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percentual}%` }} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {destaque.recompensa?.status === 'concedida'
              ? 'Meta concluída.'
              : textoDoQueFalta(destaque.tipoMeta, destaque.progresso, destaque.alvo)}{' '}
            Recompensa: {descreverRecompensa(destaque.bonusCentavos, destaque.pontos)}.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Quando houver uma campanha no ar, o seu progresso aparece aqui.
        </p>
      )}
    </section>
  )
}
