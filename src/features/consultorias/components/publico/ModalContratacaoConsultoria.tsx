'use client'

import { useEffect, useId, useState, useTransition } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, Clock, TimerReset, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trilha } from '@/features/portal-cliente/components/ui/primitivos'
import { pagarConsultoriaSimulado } from '../../actions/pagamento'
import { reservarHorarioDaConsultoria } from '../../actions/reserva'
import { ROTULO_MODALIDADE } from '../../constants/consultoria'
import {
  ACAO_CONTINUAR,
  ACAO_VER_ATENDIMENTO,
  LIMITE_DESCRICAO_CONSULTORIA,
  PASSOS_CONTRATACAO,
  PASSO_CONCLUIDO,
  PASSO_DETALHES,
  PASSO_PAGAMENTO,
  rotaDoAtendimento,
} from '../../constants/contratacao'
import {
  DETALHE_RESERVA_ATIVA,
  MENSAGEM_RESERVA_EXPIRADA,
  TITULO_RESERVA_ATIVA,
} from '../../constants/reserva'
import {
  contarCaracteres,
  descricaoValida,
  erroDaDescricao,
  excedeuLimite,
} from '../../lib/descricao'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '../../lib/formato'
import { restanteEmSegundos } from '../../lib/reserva'
import type { SelecaoDeConsultoria } from '../../types/consultoria'
import type {
  ResultadoPagamentoConsultoria,
  ResultadoReserva,
} from '../../types/contratacao'
import { PainelConsultoriaConfirmada } from './PainelConsultoriaConfirmada'
import { PainelPagamentoSimulado } from './PainelPagamentoSimulado'

/**
 * O modal de contratação da Consultoria Agendada — etapa "Detalhes".
 *
 * ## O que ele faz, e onde ele para
 *
 * Confere o que foi escolhido, pergunta o assunto e pede ao servidor que prenda
 * o horário para este Cliente. Ele **para** exatamente antes do pagamento: não
 * cobra, não confirma contratação, não abre Atendimento e não gera protocolo.
 * Conseguindo a reserva, a trilha avança para Pagamento e o modal mostra quanto
 * tempo resta — a próxima etapa conecta a cobrança.
 *
 * ## O contador não decide nada
 *
 * Ele desenha `expira_em`, e só. Quem recusa uma reserva vencida é o servidor,
 * que reconfere o prazo a cada tentativa; zerar na tela não libera horário nem
 * renova coisa alguma. Atualizar a página tampouco: o servidor devolve a mesma
 * reserva, com o relógio original.
 *
 * ## A trilha tem três passos — sempre
 *
 * `Detalhes → Pagamento → Concluído`. Entrar ou criar conta acontece *dentro*
 * de Detalhes: quem está autenticando não voltou uma casa nem avançou uma, ele
 * continua no mesmo passo. Um quarto item "Login" faria a barra crescer e
 * encolher conforme a pessoa já estivesse logada — a mesma contratação
 * pareceria dois processos diferentes.
 *
 * ## Data e horário não se editam aqui
 *
 * De propósito. O calendário é quem sabe quais horários existem, e repetir a
 * escolha dentro do modal criaria uma segunda fonte de verdade que envelhece
 * assim que o Profissional bloqueia um período. Para trocar: fecha e volta ao
 * calendário, que continua exatamente onde estava.
 *
 * ## O servidor manda no resumo
 *
 * O que aparece na tela antes de continuar é o que o card selecionou; o que
 * aparece **depois** de continuar é o que o servidor releu do banco. Se o
 * preço mudou no meio do caminho, é o valor do servidor que fica.
 */

export type ModalContratacaoConsultoriaProps = {
  aberto: boolean
  onFechar: () => void
  /** Identidade pública do Profissional, a mesma exibida no perfil. */
  nomeExibido: string
  selecao: SelecaoDeConsultoria
  /** Rascunho recuperado depois de um login no meio do caminho. */
  descricaoInicial?: string
  /**
   * O Cliente precisa entrar.
   *
   * O modal não faz login: ele devolve o que a pessoa escreveu e quem cuida da
   * autenticação é a infraestrutura central da Vincis.
   */
  onPrecisaEntrar: (descricao: string) => void
}

/** Uma linha do resumo: rótulo apagado, valor em destaque. */
function LinhaResumo({
  icone: Icone,
  rotulo,
  children,
}: {
  icone: typeof Clock
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
        <dd className="text-sm font-semibold text-foreground">{children}</dd>
      </div>
    </div>
  )
}

export function ModalContratacaoConsultoria({
  aberto,
  onFechar,
  nomeExibido,
  selecao,
  descricaoInicial = '',
  onPrecisaEntrar,
}: ModalContratacaoConsultoriaProps) {
  const idCampo = useId()
  const idAjuda = `${idCampo}-ajuda`
  const idContador = `${idCampo}-contador`
  const idErro = `${idCampo}-erro`

  const [descricao, setDescricao] = useState(descricaoInicial)
  const [tocado, setTocado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoReserva | null>(null)
  const [enviando, iniciarEnvio] = useTransition()

  /**
   * O relógio do contador regressivo.
   *
   * Vive aqui só para redesenhar o número. Ele **não** é autoridade nenhuma:
   * quem decide se a reserva venceu é o servidor, que reconfere `expira_em` a
   * cada tentativa. Zerar na tela não libera horário e não renova nada — apenas
   * para de convidar a pessoa a continuar um caminho que o servidor já
   * recusaria.
   */
  const [instante, setInstante] = useState(() => Date.now())

  /** A resposta do servidor à etapa de pagamento. */
  const [pagamento, setPagamento] = useState<ResultadoPagamentoConsultoria | null>(
    null,
  )

  /*
   * Não existe efeito de limpeza aqui de propósito: quem abre o modal o remonta
   * (`key` de abertura, em `ConsultoriaPublica`), então cada abertura já nasce
   * com rascunho novo e sem resposta antiga do servidor na tela.
   */

  const reservado = resultado?.situacao === 'reservado' ? resultado : null
  const reserva = reservado?.reserva ?? null
  const confirmado = pagamento?.situacao === 'confirmado' ? pagamento : null

  // Um `setInterval` é a assinatura de um sistema externo — o relógio. O
  // `setState` acontece no retorno de chamada dele, e não no corpo do efeito.
  useEffect(() => {
    // Depois de confirmada não há mais prazo correndo: o compromisso é
    // definitivo e o relógio perde a função.
    if (!reserva || confirmado) return
    const timer = setInterval(() => setInstante(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [reserva, confirmado])

  const segundosRestantes = reserva
    ? restanteEmSegundos(reserva.expiraEm, new Date(instante))
    : 0
  const reservaExpirou =
    reserva !== null && !confirmado && segundosRestantes === 0

  const erroCampo = erroDaDescricao(descricao, tocado)
  const podeContinuar = descricaoValida(descricao) && !enviando

  function alterar(texto: string) {
    setDescricao(texto)
    // Uma resposta do servidor descreve o texto que foi enviado. Editar o texto
    // invalida a resposta.
    if (resultado) setResultado(null)
  }

  function continuar() {
    setTocado(true)
    if (!descricaoValida(descricao)) return

    iniciarEnvio(async () => {
      // Só o essencial atravessa: quem, quando e o assunto. Preço, duração,
      // título e fuso são relidos no servidor.
      const resposta = await reservarHorarioDaConsultoria({
        prestadorId: selecao.prestadorId,
        data: selecao.data,
        inicio: selecao.inicio,
        descricao,
      })
      setResultado(resposta)
      // O contador nasce do instante da resposta, e não de um relógio parado
      // desde a abertura do modal.
      setInstante(Date.now())
      if (resposta.situacao === 'precisa_entrar') {
        onPrecisaEntrar(descricao)
      }
    })
  }

  function pagar(desfecho?: 'recusado') {
    if (!reserva) return
    iniciarEnvio(async () => {
      // O navegador manda o id da reserva e nada mais: preço, horário, duração,
      // descrição e as partes são lidos do servidor.
      const resposta = await pagarConsultoriaSimulado({
        reservaId: reserva.id,
        desfecho,
      })
      setPagamento(resposta)
      setInstante(Date.now())
    })
  }

  const erroDoPagamento =
    pagamento &&
    pagamento.situacao !== 'confirmado' &&
    pagamento.situacao !== 'reserva_expirada'
      ? pagamento.mensagem
      : null

  // A reserva pode ter vencido no servidor mesmo com o contador ainda andando
  // na tela — quem manda é a resposta dele.
  const expirouParaOServidor = pagamento?.situacao === 'reserva_expirada'
  const mostrarExpirada = (reservaExpirou || expirouParaOServidor) && !confirmado

  /** Horário preso, nada pago ainda: é a etapa 2. */
  const emPagamento = Boolean(reserva) && !mostrarExpirada && !confirmado

  const passoAtual = confirmado
    ? PASSO_CONCLUIDO
    : emPagamento
      ? PASSO_PAGAMENTO
      : PASSO_DETALHES

  // Antes de continuar, o resumo é a escolha do card; depois, é o que o
  // servidor confirmou.
  const resumo = reservado?.resumo ?? null
  const titulo = resumo?.titulo ?? selecao.titulo
  const data = resumo?.data ?? selecao.data
  const inicio = resumo?.inicio ?? selecao.inicio
  const fim = resumo?.fim ?? selecao.fim
  const duracaoMinutos = resumo?.duracaoMinutos ?? selecao.duracaoMinutos
  const valorCentavos = resumo?.valorCentavos ?? selecao.valorCentavos
  const modalidade = resumo?.modalidade ?? selecao.modalidade

  const avisoDeRecusa =
    resultado && resultado.situacao !== 'reservado' ? resultado : null

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={onFechar}
      largura="lg"
      titulo="Agendar consultoria"
      descricao={`Consultoria ${ROTULO_MODALIDADE[modalidade].toLowerCase()} com ${nomeExibido}`}
      rodape={
        confirmado ? (
          <div className="space-y-2">
            <a
              href={rotaDoAtendimento(confirmado.protocolo)}
              className="block w-full rounded-xl bg-primary py-3.5 text-center font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              {ACAO_VER_ATENDIMENTO}
            </a>
            <button
              type="button"
              onClick={onFechar}
              className="w-full rounded-xl py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={emPagamento ? () => pagar() : continuar}
              disabled={emPagamento ? enviando : !podeContinuar}
              className="w-full rounded-xl bg-primary py-3.5 font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary disabled:active:scale-100"
            >
              {enviando
                ? emPagamento
                  ? 'Processando…'
                  : 'Verificando…'
                : emPagamento
                  ? 'Simular pagamento aprovado'
                  : ACAO_CONTINUAR}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              {emPagamento
                ? 'Pagamento simulado — nenhuma cobrança real será feita.'
                : 'Você ainda não será cobrado.'}
            </p>
          </div>
        )
      }
    >
      <div className="space-y-6">
        {/*
          Com o horário preso, o Cliente está de fato no segundo passo — falta
          pagar. Reserva vencida volta para Detalhes: não há mais nada reservado
          para pagar, e a pessoa precisa escolher outro horário.
        */}
        <Trilha passos={PASSOS_CONTRATACAO} atual={passoAtual} />

        {/*
          O resumo acompanha Detalhes e Pagamento. Na etapa Concluído ele sai:
          o painel de sucesso repete os mesmos dados com o protocolo junto, e
          duas listas iguais na mesma tela só fariam a pessoa procurar a
          diferença entre elas.
        */}
        {confirmado ? null : (
        <dl className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
          <LinhaResumo icone={Video} rotulo="Profissional">
            {resumo?.prestadorNome ?? nomeExibido}
          </LinhaResumo>
          <LinhaResumo icone={CheckCircle2} rotulo="Consultoria">
            {titulo}
            <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {ROTULO_MODALIDADE[modalidade]}
            </span>
          </LinhaResumo>
          <LinhaResumo icone={CalendarDays} rotulo="Data">
            {dataPorExtensoComDiaDaSemana(data)}
          </LinhaResumo>
          <LinhaResumo icone={Clock} rotulo="Horário">
            {inicio} às {fim}{' '}
            <span className="font-normal text-muted-foreground">
              · {duracaoPorExtenso(duracaoMinutos)}
            </span>
          </LinhaResumo>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 sm:col-span-2">
            <span className="text-sm font-medium text-muted-foreground">
              Valor da consultoria
            </span>
            <span className="text-xl font-bold text-foreground">
              {formatarPreco(valorCentavos)}
            </span>
          </div>
        </dl>
        )}

        {/*
          Para trocar de horário a pessoa volta ao calendário. Dizer isso aqui
          evita a busca por um seletor que não existe dentro do modal. Some
          depois que o horário está preso: aí trocar já não é só fechar.
        */}
        {emPagamento || confirmado ? null : (
          <p className="text-xs text-muted-foreground">
            Para escolher outra data ou horário, feche esta janela e volte ao
            calendário.
          </p>
        )}

        {confirmado ? null : (
        <div className="space-y-2">
          <Label htmlFor={idCampo} className="text-sm font-semibold text-foreground">
            O que você deseja tratar na consultoria?
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </Label>
          <p id={idAjuda} className="text-xs leading-relaxed text-muted-foreground">
            Conte brevemente ao profissional o que você precisa para que ele
            possa se preparar para o atendimento.
          </p>
          <Textarea
            id={idCampo}
            value={descricao}
            onChange={(evento) => alterar(evento.target.value)}
            onBlur={() => setTocado(true)}
            // Com o horário preso, o assunto já foi gravado junto da reserva.
            // Deixar editar aqui daria a impressão de que o texto novo seguiu
            // para o Profissional — e não seguiria.
            disabled={emPagamento || Boolean(confirmado)}
            required
            aria-required="true"
            aria-invalid={erroCampo ? true : undefined}
            aria-describedby={cn(idAjuda, idContador, erroCampo && idErro)}
            className="min-h-32 max-h-56 resize-y"
            placeholder="Ex.: preciso de orientação sobre a rescisão do meu contrato de trabalho."
          />
          <div className="flex items-start justify-between gap-3">
            <p
              id={idErro}
              role="alert"
              className={cn(
                'text-xs font-medium text-destructive',
                !erroCampo && 'sr-only',
              )}
            >
              {erroCampo ?? ''}
            </p>
            <p
              id={idContador}
              className={cn(
                'shrink-0 text-xs tabular-nums text-muted-foreground',
                excedeuLimite(descricao) && 'font-bold text-destructive',
              )}
            >
              {contarCaracteres(descricao)} / {LIMITE_DESCRICAO_CONSULTORIA}
              <span className="sr-only"> caracteres usados</span>
            </p>
          </div>
        </div>
        )}

        {avisoDeRecusa ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              {avisoDeRecusa.mensagem}
            </p>
          </div>
        ) : null}

        {emPagamento ? (
          <>
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-3"
            >
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {TITULO_RESERVA_ATIVA}
                </p>
                <p className="text-xs text-muted-foreground">{DETALHE_RESERVA_ATIVA}</p>
              </div>
            </div>
            <PainelPagamentoSimulado
              valorFormatado={formatarPreco(valorCentavos)}
              segundosRestantes={segundosRestantes}
              processando={enviando}
              erro={erroDoPagamento}
              onRecusar={() => pagar('recusado')}
            />
          </>
        ) : null}

        {mostrarExpirada ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3"
          >
            <TimerReset aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">
                {MENSAGEM_RESERVA_EXPIRADA}
              </p>
              <p className="text-xs text-muted-foreground">
                Feche esta janela e volte ao calendário para escolher outro
                horário. Nada foi cobrado.
              </p>
            </div>
          </div>
        ) : null}

        {confirmado ? (
          <PainelConsultoriaConfirmada
            nomeExibido={resumo?.prestadorNome ?? nomeExibido}
            data={confirmado.data}
            inicio={confirmado.inicio}
            fim={confirmado.fim}
            duracaoMinutos={confirmado.duracaoMinutos}
            valorCentavos={confirmado.valorCentavos}
            protocolo={confirmado.protocolo}
          />
        ) : null}
      </div>
    </ModalResponsivo>
  )
}
