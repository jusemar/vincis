'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2, Clock, LogIn, Receipt } from 'lucide-react'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { anexarArquivoAoAtendimento } from '@/features/atendimentos/actions/anexar-arquivo'
import { rotaDoAtendimento } from '@/features/consultorias/constants/contratacao'
import { PainelPix } from '@/features/pagamentos/components/PainelPix'
import { useAcompanharCobranca } from '@/features/pagamentos/hooks/useAcompanharCobranca'
import type { CobrancaPixDTO } from '@/features/pagamentos/types/cobranca'
import { Trilha } from '@/features/portal-cliente/components/ui/primitivos'
import {
  acompanharPagamentoDoServico,
  iniciarPagamentoDoServico,
  prepararContratacaoDoServico,
} from '../../actions/contratar'
import {
  PASSOS_CONTRATACAO_SERVICO,
  PASSO_SERVICO_DETALHES as PASSO_DETALHES,
  PASSO_SERVICO_FINALIZADO,
  PASSO_SERVICO_PAGAMENTO as PASSO_PAGAMENTO,
} from '../../constants/contratacao'
import type {
  ResultadoContratacaoServico,
  ResumoContratacaoServicoDTO,
} from '../../types/contratacao'

function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** O que a tela mostra antes de o servidor responder — vem do card. */
export type ServicoSelecionado = {
  id: string
  nome: string
  descricao: string
  precoRotulo: string
}

/**
 * Contratação de um serviço de preço fixo — `Detalhes → Pagamento`, e o cartão
 * "Serviço contratado!" como confirmação final.
 *
 * ## Onde cada coisa é decidida
 *
 * - **Detalhes**: o resumo exibido depois de abrir é o que o servidor releu do
 *   banco (`prepararContratacaoDoServico`). Sem sessão, a etapa diz isso com
 *   todas as letras e oferece entrar ou criar conta — por cima desta página.
 * - **Pagamento**: o Pix é emitido pelo servidor; a tela só mostra e pergunta,
 *   de tempos em tempos, como ele está. Gerar QR Code não é pagar.
 * - **Concluído**: só quando o servidor diz que a Efí confirmou e a contratação
 *   existe — com protocolo. Nada aqui marca algo como pago.
 *
 * Os anexos escolhidos no card viajam **depois** da confirmação, para o
 * Atendimento recém-criado, pelo caminho autorizado de sempre. Antes disso não
 * há Atendimento onde guardá-los.
 */
export function ModalContratacaoServico({
  aberto,
  onFechar,
  nomeExibido,
  servico,
  autenticado,
  mensagemInicial,
  anexos,
  onPrecisaEntrar,
  onConcluida,
}: {
  aberto: boolean
  onFechar: () => void
  nomeExibido: string
  servico: ServicoSelecionado
  /** Sessão vista pelo `AuthProvider`. Quem decide de verdade é o servidor. */
  autenticado: boolean
  mensagemInicial: string
  anexos: File[]
  /** O modal não faz login: devolve o recado e quem autentica é a Vincis. */
  onPrecisaEntrar: (mensagem: string) => void
  onConcluida: () => void
}) {
  const [mensagem, setMensagem] = useState(mensagemInicial)
  const [resumo, setResumo] = useState<ResumoContratacaoServicoDTO | null>(null)
  const [cobranca, setCobranca] = useState<CobrancaPixDTO | null>(null)
  const [aviso, setAviso] = useState<Exclude<ResultadoContratacaoServico, { situacao: 'pronto' | 'cobranca' }> | null>(null)
  const [emPagamento, setEmPagamento] = useState(false)
  const [enviando, iniciarEnvio] = useTransition()
  const anexosEnviados = useRef(false)

  const concluida = cobranca?.status === 'paga' && cobranca.efeito === 'aplicado'
  const pagoSemEfeito = cobranca?.status === 'paga' && cobranca.efeito === 'conflito'
  const confirmando = cobranca?.status === 'paga' && !cobranca.efeito

  function aplicar(resposta: ResultadoContratacaoServico) {
    if (resposta.situacao === 'pronto') {
      setResumo(resposta.resumo)
      setAviso(null)
      return
    }
    if (resposta.situacao === 'cobranca') {
      if (resposta.resumo.descricao) setResumo(resposta.resumo)
      setCobranca(resposta.cobranca)
      setAviso(null)
      return
    }
    if (resposta.situacao === 'gerando') {
      // Outra aba/requisição está emitindo: pergunta de novo em instantes.
      setTimeout(() => gerarPix(), 2000)
      return
    }
    if (resposta.situacao === 'precisa_entrar') {
      onPrecisaEntrar(mensagem)
      return
    }
    setAviso(resposta)
  }

  // Ao abrir com sessão, o resumo vem do servidor. Sem sessão, a tela mostra
  // o que o card sabia e pede o login antes de qualquer coisa.
  useEffect(() => {
    if (!aberto || !autenticado || resumo) return
    let vivo = true
    prepararContratacaoDoServico({ servicoId: servico.id }).then((resposta) => {
      if (vivo) aplicar(resposta)
    })
    return () => {
      vivo = false
    }
    // `aplicar` muda a cada render; o que importa é abrir/autenticar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, autenticado, servico.id, resumo])

  function gerarPix() {
    setEmPagamento(true)
    iniciarEnvio(async () => {
      // Só o id e o recado atravessam: o preço é relido no servidor.
      aplicar(await iniciarPagamentoDoServico({ servicoId: servico.id, mensagem }))
    })
  }

  useAcompanharCobranca({
    ativo: aberto && Boolean(cobranca) && (cobranca?.status === 'aguardando_pagamento' || confirmando),
    consultar: () => acompanharPagamentoDoServico({ cobrancaId: cobranca!.id }),
    aoResponder: aplicar,
  })

  // Concluída: os anexos seguem para o Atendimento, uma vez só.
  useEffect(() => {
    if (!concluida || anexosEnviados.current || !cobranca?.atendimentoId) return
    anexosEnviados.current = true
    const atendimentoId = cobranca.atendimentoId
    void (async () => {
      for (const arquivo of anexos) {
        const dados = new FormData()
        dados.set('atendimentoId', atendimentoId)
        dados.set('arquivo', arquivo)
        await anexarArquivoAoAtendimento(dados)
      }
      onConcluida()
    })()
  }, [concluida, cobranca, anexos, onConcluida])

  const passo = concluida ? PASSO_SERVICO_FINALIZADO : emPagamento || cobranca ? PASSO_PAGAMENTO : PASSO_DETALHES
  const valor = resumo?.valorCentavos ?? null

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={onFechar}
      largura="lg"
      titulo="Contratar serviço"
      descricao={`${servico.nome} com ${nomeExibido}`}
      rodape={
        concluida && cobranca?.protocolo ? (
          <div className="space-y-2">
            <a
              href={rotaDoAtendimento(cobranca.protocolo)}
              className="block w-full rounded-xl bg-primary py-3.5 text-center font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
            >
              Ver meu atendimento
            </a>
            <button type="button" onClick={onFechar} className="w-full rounded-xl py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              Fechar
            </button>
          </div>
        ) : !autenticado ? (
          <button
            type="button"
            onClick={() => onPrecisaEntrar(mensagem)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <LogIn className="size-4" aria-hidden />
            Entrar ou criar conta para continuar
          </button>
        ) : passo === PASSO_DETALHES ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={gerarPix}
              disabled={!resumo || enviando || Boolean(aviso)}
              className="w-full rounded-xl bg-primary py-3.5 font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? 'Gerando Pix…' : 'Continuar para pagamento'}
            </button>
            <p className="text-center text-xs text-muted-foreground">Você ainda não será cobrado.</p>
          </div>
        ) : (
          <button type="button" onClick={onFechar} className="w-full rounded-xl py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Fechar
          </button>
        )
      }
    >
      <div className="space-y-6">
        <Trilha passos={PASSOS_CONTRATACAO_SERVICO} atual={passo} />

        {/* Com o Pix na tela, o painel dele já mostra o total: o resumo sai para
            o QR Code caber sem rolagem no celular. */}
        {concluida || cobranca ? null : (
          <dl className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Receipt aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">Serviço</dt>
                <dd className="text-sm font-semibold text-foreground">{resumo?.nome ?? servico.nome}</dd>
                <dd className="text-xs text-muted-foreground">{resumo?.descricao || servico.descricao}</dd>
              </div>
            </div>
            {resumo?.prazoEstimadoDias ? (
              <div className="flex items-start gap-3">
                <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Prazo estimado</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {resumo.prazoEstimadoDias} {resumo.prazoEstimadoDias === 1 ? 'dia' : 'dias'}
                  </dd>
                </div>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm font-medium text-muted-foreground">Valor do serviço</span>
              <span className="text-xl font-bold text-foreground">{valor !== null ? reais(valor) : servico.precoRotulo}</span>
            </div>
          </dl>
        )}

        {!autenticado ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <LogIn aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-foreground">
              Para contratar, entre na sua conta ou crie uma. Você continua nesta página e o serviço
              escolhido — com a sua mensagem — fica guardado para seguir daqui.
            </p>
          </div>
        ) : null}

        {passo === PASSO_DETALHES ? (
          <div className="space-y-2">
            <Label htmlFor="mensagem-contratacao" className="text-sm font-semibold text-foreground">
              Mensagem para o profissional <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="mensagem-contratacao"
              value={mensagem}
              onChange={(evento) => setMensagem(evento.target.value)}
              maxLength={4000}
              className="min-h-24 resize-y"
              placeholder="Explique sua necessidade. Ela chega ao profissional quando o pagamento for confirmado."
            />
            {anexos.length ? (
              <p className="text-xs text-muted-foreground">
                {anexos.length} arquivo(s) seguirão para o atendimento após a confirmação do pagamento.
              </p>
            ) : null}
          </div>
        ) : null}

        {aviso ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">{aviso.mensagem}</p>
              {aviso.situacao === 'indisponivel' && passo === PASSO_PAGAMENTO ? (
                <button
                  type="button"
                  onClick={() => {
                    setAviso(null)
                    gerarPix()
                  }}
                  className="text-xs font-semibold text-foreground underline underline-offset-2"
                >
                  Tentar novamente
                </button>
              ) : null}
              {aviso.situacao === 'ja_contratado' && aviso.protocolo ? (
                <a href={rotaDoAtendimento(aviso.protocolo)} className="text-xs font-semibold text-foreground underline underline-offset-2">
                  Abrir o atendimento {aviso.protocolo}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {passo === PASSO_PAGAMENTO && !aviso ? (
          <PainelPix
            cobranca={cobranca}
            gerando={enviando && !cobranca}
            onGerarNovamente={gerarPix}
          />
        ) : null}

        {confirmando ? (
          <p role="status" className="text-center text-sm text-muted-foreground">Pagamento recebido. Abrindo seu atendimento…</p>
        ) : null}

        {pagoSemEfeito ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
            Recebemos seu Pix, mas este serviço deixou de estar disponível. A equipe Vincis fará o estorno integral.
          </div>
        ) : null}

        {concluida && cobranca ? (
          <div className="space-y-3 rounded-xl border border-success/30 bg-success/10 p-5 text-center">
            <CheckCircle2 aria-hidden className="mx-auto size-10 text-success" />
            <p className="text-lg font-bold text-foreground">Serviço contratado!</p>
            <p className="text-sm text-muted-foreground">
              Pagamento de {reais(cobranca.valorCentavos)} confirmado. {nomeExibido} já recebeu o aviso.
            </p>
            {cobranca.protocolo ? (
              <p className="text-sm">
                Protocolo <span className="font-mono font-bold text-foreground">{cobranca.protocolo}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalResponsivo>
  )
}
