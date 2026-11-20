'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, KeyRound, MessageSquareText, RotateCcw, ShieldAlert, Smartphone, TimerReset } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  confirmarCodigoVerificacaoCelular,
  obterCelularDaConta,
  solicitarCodigoVerificacaoCelular,
  type EstadoCelularConta,
} from '../actions/verificacao-celular'
import { CampoCodigoOtp, TAMANHO_CODIGO } from './CampoCodigoOtp'

/**
 * Celular da conta com o status e, se ainda não verificado, "Verificar
 * celular": código de 6 dígitos por SMS enviado ao número JÁ cadastrado na
 * conta (a tela não envia número nenhum). Mesmo campo de código do cadastro e
 * da recuperação de senha.
 *
 * Sem `<form>`: o cartão fica dentro de outros formulários (perfil
 * profissional) e formulário aninhado é HTML inválido. O código completo já
 * confirma sozinho; o botão "Confirmar código" cobre o resto.
 */

function useContagem() {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (segundos <= 0) return
    const relogio = setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => clearTimeout(relogio)
  }, [segundos])
  return [segundos, setSegundos] as const
}

const mmss = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`

export function VerificarCelularConta() {
  const [estado, setEstado] = useState<EstadoCelularConta | null | undefined>(undefined)
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [reenvio, setReenvio] = useContagem()
  const [validade, setValidade] = useContagem()

  useEffect(() => {
    let ativo = true
    obterCelularDaConta().then((r) => ativo && setEstado(r))
    return () => {
      ativo = false
    }
  }, [])

  async function pedirCodigo() {
    if (ocupado || reenvio > 0) return
    setOcupado(true)
    setErro(null)
    const r = await solicitarCodigoVerificacaoCelular()
    setOcupado(false)
    if (!r.sucesso) return setErro(r.mensagem)
    setSolicitacaoId(r.solicitacaoId)
    setAviso(r.mensagem)
    setReenvio(r.aguardarSegundos)
    setValidade(r.validadeSegundos)
    setCodigo('')
  }

  async function validar(codigoDigitado: string) {
    if (!solicitacaoId || ocupado) return
    setOcupado(true)
    setErro(null)
    const r = await confirmarCodigoVerificacaoCelular({ solicitacaoId, codigo: codigoDigitado })
    setOcupado(false)
    if (!r.sucesso) {
      setErro(r.mensagem)
      setCodigo('')
      if (r.bloqueado) setValidade(0)
      return
    }
    setSucesso(r.mensagem)
    setSolicitacaoId(null)
    setEstado((atual) => (atual ? { ...atual, verificado: true } : atual))
  }

  if (estado === undefined) return <div className="h-16 animate-pulse rounded-xl bg-muted/60" aria-hidden />
  if (estado === null || !estado.celular) return null

  return (
    <section aria-labelledby="titulo-celular-conta" className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p id="titulo-celular-conta" className="text-sm font-semibold text-foreground">Celular</p>
            <p className="text-sm text-muted-foreground">{estado.celular}</p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            estado.verificado ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {estado.verificado ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden />}
          {estado.verificado ? 'Verificado' : 'Não verificado'}
        </span>
      </div>

      {sucesso ? (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {sucesso}
        </p>
      ) : null}

      {!estado.verificado && !solicitacaoId ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Confirme que este número é seu para usá-lo na recuperação de senha por SMS. Enviaremos um código de 6 números.
          </p>
          <button
            type="button"
            onClick={() => void pedirCodigo()}
            disabled={ocupado || reenvio > 0}
            className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {ocupado ? 'Enviando...' : reenvio > 0 ? `Aguarde ${reenvio} s` : 'Verificar celular'}
          </button>
        </div>
      ) : null}

      {!estado.verificado && solicitacaoId ? (
        <div className="space-y-3">
          {aviso ? (
            <p role="status" aria-live="polite" className="flex gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm leading-relaxed text-foreground">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{aviso}</span>
            </p>
          ) : null}
          <CampoCodigoOtp
            valor={codigo}
            onAlterar={setCodigo}
            onCompleto={(c) => void validar(c)}
            desabilitado={ocupado || validade === 0}
            legenda={
              <>
                <KeyRound className="h-4 w-4 text-primary" aria-hidden /> Código enviado para {estado.celularMascarado}
              </>
            }
          />
          <p className={cn('inline-flex items-center gap-1.5 text-xs', validade === 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
            <TimerReset className="h-3.5 w-3.5" aria-hidden />
            {validade > 0 ? `Código válido por ${mmss(validade)}` : 'Código expirado — peça um novo'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => codigo.length === TAMANHO_CODIGO && void validar(codigo)}
              disabled={ocupado || codigo.length !== TAMANHO_CODIGO || validade === 0}
              className="h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ocupado ? 'Validando...' : 'Confirmar código'}
            </button>
            <button
              type="button"
              onClick={() => void pedirCodigo()}
              disabled={ocupado || reenvio > 0}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {reenvio > 0 ? `Reenviar código em ${reenvio} s` : 'Reenviar código'}
            </button>
          </div>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </section>
  )
}
