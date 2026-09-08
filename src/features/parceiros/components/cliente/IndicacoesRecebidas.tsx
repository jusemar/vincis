import {
  AtSign,
  Briefcase,
  LinkIcon,
  MessageCircle,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PainelVazio, Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import { detalheDoEvento, rotuloDoEvento } from '../../constants/indicacao'
import {
  ROTULO_SITUACAO,
  diasRestantes,
  rotuloDaReferencia,
  situacaoDaAtribuicao,
} from '../../constants/prazo'
import { percentualFormatado } from '../../constants/programa'
import { ROTULO_COMISSAO, TOM_COMISSAO } from '../../constants/comissao'
import type { IndicacaoDoParceiro } from '../../queries/listar-indicacoes'

/**
 * Quem chegou pelo link — dado real, vindo de `parceiro_indicacoes`.
 *
 * ## Anônimo enquanto for anônimo
 *
 * Sem cadastro não há nome, e inventar um ("Visitante #42") sugeriria uma
 * identificação que não aconteceu. Quando alguém se cadastra por aquele ciclo,
 * a mesma linha passa a mostrar a pessoa — nome, e-mail e WhatsApp, quando
 * existe. O cartão não muda de forma: é a mesma indicação, agora com dono.
 *
 * ## Três estados, e o cadastro vence os outros dois
 *
 * O ciclo é técnico: ele diz o que aquele navegador fez. Enquanto ninguém se
 * cadastrou, ele é o **atual** ou foi **substituído** — o mesmo navegador
 * chegou depois pelo link de outra pessoa, e o ciclo antigo continua na lista,
 * marcado, porque sumir com a linha reescreveria o passado do parceiro.
 *
 * Depois do cadastro ele é **associado**, e passa a ser só isso. Um clique
 * posterior em outro link fecha o ciclo no banco, mas não tira o cadastro de
 * quem o trouxe: quem já é da base Vincis não é indicado de novo. Mostrar
 * "substituída" num cartão que já tem nome diria ao parceiro que ele perdeu
 * um cliente que continua sendo dele.
 */
const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const ROTULO_TIPO = { avulso: 'Avulso', recorrente: 'Recorrente' } as const

/**
 * Os eventos que o negócio já conta melhor do que a linha genérica.
 *
 * Cada atribuição grava o seu evento, e é a atribuição que sabe o nome, o
 * valor e o prazo daquele negócio. Mostrar os dois seria contar o mesmo fato
 * duas vezes — uma delas pior. O evento continua no banco, intacto: quem sai
 * é a linha redundante da tela, não o registro.
 */
const EVENTOS_DO_NEGOCIO = new Set(['demonstrou_interesse', 'contratou_servico'])

type PassoDaJornada =
  | { chave: string; quando: Date; tipo: 'evento'; titulo: string; detalhe: string | null }
  | {
      chave: string
      quando: Date
      tipo: 'negocio'
      negocio: IndicacaoDoParceiro['negocios'][number]
    }

/**
 * Uma história só, na ordem em que aconteceu.
 *
 * Antes eram dois blocos: os negócios empilhados no topo e a linha do tempo
 * embaixo, sem nada ligando um clique a um contrato. Aqui os dois viram a
 * mesma régua, ordenada pelo relógio real — o parceiro lê de cima para baixo e
 * entende o caminho que a pessoa fez.
 */
function montarJornada(indicacao: IndicacaoDoParceiro): PassoDaJornada[] {
  const passos: PassoDaJornada[] = []

  for (const evento of indicacao.eventos) {
    if (EVENTOS_DO_NEGOCIO.has(evento.tipo)) continue
    passos.push({
      chave: `e-${evento.id}`,
      quando: evento.ocorridoEm,
      tipo: 'evento',
      titulo: rotuloDoEvento(evento.tipo),
      detalhe: detalheDoEvento(evento.tipo, evento.dados),
    })
  }

  for (const negocio of indicacao.negocios) {
    passos.push({
      chave: `n-${negocio.id}`,
      quando: negocio.iniciadaEm,
      tipo: 'negocio',
      negocio,
    })
  }

  return passos.sort((a, b) => a.quando.getTime() - b.quando.getTime())
}

/**
 * O negócio dentro do ponto da jornada a que ele pertence.
 *
 * Nome, valor e prazo são os **congelados** na linha, nunca o que o catálogo ou
 * a Gestão dizem hoje: o prestador pode renomear o serviço ou mudar o preço
 * amanhã, e o negócio que o parceiro trouxe continua sendo o que foi.
 *
 * ## Contratou, ou só demonstrou interesse
 *
 * Estados diferentes, e a tela não os mistura. Contratação efetiva mostra o
 * nome real; oportunidade e pedido de orçamento (`sob_orcamento`, que ainda
 * depende de proposta) ficam em "Demonstrou interesse", porque anunciar como
 * fechado um negócio que pode não acontecer é pior do que não anunciar.
 *
 * ## A comissão é real, e vem do banco
 *
 * O número não é multiplicação de tela: sai de `parceiro_comissoes`, com
 * valor-base, percentual e resultado congelados no instante em que o direito
 * nasceu. Mudar o percentual amanhã não reescreve o que já foi gerado.
 *
 * "Valor do serviço", e não "valor contratado": o profissional ainda pode
 * recusar ou cancelar, e a palavra não pode sugerir receita consolidada. O
 * estado da comissão diz o resto — `Gerada` enquanto o serviço não termina,
 * `Disponível` quando ele é concluído.
 */
function CartaoDoNegocio({
  negocio,
}: {
  negocio: IndicacaoDoParceiro['negocios'][number]
}) {
  const situacao = situacaoDaAtribuicao(negocio.expiraEm)
  const categoria = negocio.servico ? rotuloDaReferencia(negocio.servico) : null
  const titulo = negocio.nome ?? categoria ?? 'Serviço'
  const comissao = negocio.comissao

  return (
    <div className="mt-2 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-2">
          <Briefcase
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{titulo}</p>
            {categoria ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {categoria}
                {negocio.tipo ? ` · ${ROTULO_TIPO[negocio.tipo]}` : ''}
              </p>
            ) : null}
          </div>
        </div>
        <Pilula
          rotulo={ROTULO_SITUACAO[situacao]}
          tom={situacao === 'ativa' ? 'sucesso' : 'neutro'}
        />
      </div>

      {negocio.profissional ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span>Profissional</span>
          <span className="font-medium text-foreground">
            {negocio.profissional.nome}
          </span>
          {negocio.profissional.codigoPublico ? (
            <span className="tabular-nums">
              · {negocio.profissional.codigoPublico}
            </span>
          ) : null}
        </p>
      ) : null}

      {negocio.valorCentavos !== null ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t pt-3 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-xs text-muted-foreground">Valor do serviço</dt>
            <dd className="text-sm font-medium tabular-nums sm:mt-0.5">
              {MOEDA.format(negocio.valorCentavos / 100)}
            </dd>
          </div>
          {comissao ? (
            <div className="flex items-baseline justify-between gap-3 sm:block">
              <dt className="text-xs text-muted-foreground">Comissão gerada</dt>
              <dd className="flex items-baseline gap-2 sm:mt-0.5">
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {MOEDA.format(comissao.valorCentavos / 100)}
                </span>
                <Pilula
                  rotulo={ROTULO_COMISSAO[comissao.status]}
                  tom={TOM_COMISSAO[comissao.status]}
                />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {comissao ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Base avulso · {percentualFormatado(comissao.percentual)} · liberação
          após conclusão do serviço.
        </p>
      ) : null}

      {negocio.prazoDias || negocio.expiraEm ? (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
          {negocio.prazoDias ? <span>{negocio.prazoDias} dias de prazo</span> : null}
          {negocio.expiraEm ? (
            <span>
              {situacao === 'ativa'
                ? `vence em ${DIA.format(negocio.expiraEm)} · faltam ${diasRestantes(negocio.expiraEm)}`
                : `venceu em ${DIA.format(negocio.expiraEm)}`}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

function Jornada({ indicacao }: { indicacao: IndicacaoDoParceiro }) {
  const passos = montarJornada(indicacao)
  if (!passos.length) return null

  return (
    <ol className="relative space-y-5 border-l pl-6">
      {passos.map((passo) => {
        const contratou = passo.tipo === 'negocio' && passo.negocio.contratado
        return (
          <li key={passo.chave} className="relative">
            <span
              aria-hidden
              className={cn(
                'absolute -left-[1.72rem] top-1.5 size-2.5 rounded-full ring-4 ring-card',
                passo.tipo === 'evento'
                  ? 'bg-info'
                  : contratou
                    ? 'bg-success'
                    : 'bg-primary',
              )}
            />
            {passo.tipo === 'evento' ? (
              <>
                <p className="text-sm font-medium">{passo.titulo}</p>
                {passo.detalhe ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {passo.detalhe}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm font-medium">
                {contratou ? 'Contratou' : 'Demonstrou interesse'}
              </p>
            )}
            <time className="mt-1 block text-xs tabular-nums text-muted-foreground/80">
              {QUANDO.format(passo.quando)}
            </time>
            {passo.tipo === 'negocio' ? (
              <CartaoDoNegocio negocio={passo.negocio} />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export function IndicacoesRecebidas({
  indicacoes,
}: {
  indicacoes: IndicacaoDoParceiro[]
}) {
  if (!indicacoes.length) {
    return (
      <PainelVazio
        titulo="Nenhum acesso pelo seu link ainda"
        descricao="Assim que alguém abrir o seu link de indicação, o acesso aparece aqui com data, origem e histórico."
      />
    )
  }

  return (
    <div className="space-y-4">
      {indicacoes.map((indicacao) => {
        // Cadastro feito é definitivo; sem cadastro, vale o ciclo do navegador.
        const situacao = indicacao.lead
          ? 'Indicação associada ao cadastro'
          : indicacao.substituidaEm === null
            ? 'Indicação atual'
            : 'Substituída por indicação mais recente'
        const mantida = indicacao.lead !== null || indicacao.substituidaEm === null
        return (
          <section key={indicacao.id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl',
                    indicacao.lead
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <UserRound className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {indicacao.lead?.nome ?? 'Visitante não identificado'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <LinkIcon className="size-3" aria-hidden />
                      Link de indicação
                    </span>
                    {indicacao.lead ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <AtSign className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{indicacao.lead.email}</span>
                      </span>
                    ) : null}
                    {indicacao.lead?.whatsapp ? (
                      <span className="flex items-center gap-1.5">
                        <MessageCircle className="size-3 shrink-0" aria-hidden />
                        {indicacao.lead.whatsapp}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <Pilula rotulo={situacao} tom={mantida ? 'sucesso' : 'neutro'} />
            </div>

            <div className="mt-5 border-t pt-5">
              <Jornada indicacao={indicacao} />
            </div>
          </section>
        )
      })}
    </div>
  )
}
