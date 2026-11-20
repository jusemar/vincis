'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, KeyRound, Mail, MessageSquareText, RotateCcw, ShieldCheck, Smartphone, TimerReset } from 'lucide-react'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { cn } from '@/lib/utils'
import { solicitarCodigoRecuperacaoSms, verificarCodigoRecuperacaoSms } from '../actions/recuperacao-senha-sms'
import { redefinirSenha } from '../actions/redefinir-senha'
import { solicitarRedefinicaoSenha } from '../actions/solicitar-redefinicao-senha'
import { formatarCelularDigitado } from '../lib/telefone'
import { CampoCodigoOtp, TAMANHO_CODIGO } from './CampoCodigoOtp'

/**
 * Recuperar acesso: link por E-MAIL ou código por SMS.
 *
 * SMS em etapas: celular → código de 6 dígitos (colar de uma vez, teclado
 * numérico, preenchimento automático do celular) → nova senha → pronto.
 * A tela nunca afirma que a conta existe nem que o SMS foi entregue: só repete
 * o que o servidor respondeu, igual para qualquer número.
 */

type Canal = 'email' | 'sms'
type EtapaSms = 'celular' | 'codigo' | 'senha' | 'sucesso'

const CLASSES_CAMPO =
  'w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]'
const CLASSES_BOTAO =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50'

function useContagem(inicial = 0) {
  const [segundos, setSegundos] = useState(inicial)
  useEffect(() => {
    if (segundos <= 0) return
    const relogio = setTimeout(() => setSegundos((s) => s - 1), 1000)
    return () => clearTimeout(relogio)
  }, [segundos])
  return [segundos, setSegundos] as const
}

function mmss(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'erro'; children: React.ReactNode }) {
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'flex gap-3 rounded-xl border p-3 text-sm leading-relaxed',
        tipo === 'erro' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-foreground',
      )}
    >
      {children}
    </p>
  )
}

export function RecuperacaoSenha({ onVoltarAoLogin }: { onVoltarAoLogin: () => void }) {
  const [canal, setCanal] = useState<Canal>('sms')

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Como receber a recuperação" className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-1">
        {(
          [
            { valor: 'sms', rotulo: 'SMS', detalhe: 'Código no celular', Icone: Smartphone },
            { valor: 'email', rotulo: 'E-mail', detalhe: 'Link no e-mail', Icone: Mail },
          ] as const
        ).map(({ valor, rotulo, detalhe, Icone }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={canal === valor}
            onClick={() => setCanal(valor)}
            className={cn(
              'flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              canal === valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className={cn('h-5 w-5 shrink-0', canal === valor ? 'text-primary' : '')} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{rotulo}</span>
              <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>
            </span>
          </button>
        ))}
      </div>

      {canal === 'sms' ? <FluxoSms onVoltarAoLogin={onVoltarAoLogin} /> : <FluxoEmail />}
    </div>
  )
}

function FluxoEmail() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null)
  const [espera, setEspera] = useContagem()
  // Já houve um envio: o botão passa a "Enviar novo link" (o novo invalida o
  // anterior no servidor). A espera é o intervalo de reenvio, não a validade.
  const [enviouUmaVez, setEnviouUmaVez] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (espera > 0 || !email.trim()) return
    setEnviando(true)
    setAviso(null)
    const r = await solicitarRedefinicaoSenha({ emailOuWhatsapp: email })
    setEnviando(false)
    if (!r.sucesso) return setAviso({ texto: r.mensagem, erro: true })
    setAviso({ texto: r.mensagem, erro: false })
    setEspera(r.aguardarSegundos)
    setEnviouUmaVez(true)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="recuperacao-email" className="flex items-center gap-2 text-sm text-foreground/80">
          <Mail className="h-4 w-4 text-primary" aria-hidden /> E-mail cadastrado
        </label>
        <input
          id="recuperacao-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className={CLASSES_CAMPO}
        />
      </div>
      {aviso ? (
        <Aviso tipo={aviso.erro ? 'erro' : 'info'}>
          {!aviso.erro ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
          <span>{aviso.texto}</span>
        </Aviso>
      ) : null}
      <button type="submit" disabled={enviando || espera > 0} className={CLASSES_BOTAO}>
        {enviando ? 'Enviando...' : espera > 0 ? `Aguarde ${espera} s para um novo envio` : <>{enviouUmaVez ? 'Enviar novo link' : 'Enviar link de recuperação'} <ArrowRight className="h-4 w-4" aria-hidden /></>}
      </button>
    </form>
  )
}

function FluxoSms({ onVoltarAoLogin }: { onVoltarAoLogin: () => void }) {
  const [etapa, setEtapa] = useState<EtapaSms>('celular')
  const [celular, setCelular] = useState('')
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null)
  const [tokenRedefinicao, setTokenRedefinicao] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [reenvio, setReenvio] = useContagem()
  const [validade, setValidade] = useContagem()
  const senhaRef = useRef<HTMLInputElement>(null)
  const confirmacaoRef = useRef<HTMLInputElement>(null)

  async function pedirCodigo() {
    if (reenvio > 0 || ocupado) return
    setOcupado(true)
    setErro(null)
    const r = await solicitarCodigoRecuperacaoSms({ celular })
    setOcupado(false)
    if (!r.sucesso) return setErro(r.mensagem)
    setSolicitacaoId(r.solicitacaoId)
    setAviso(r.mensagem)
    setReenvio(r.aguardarSegundos)
    setValidade(r.validadeSegundos)
    setCodigo('')
    setEtapa('codigo')
  }

  async function validar(codigoDigitado: string) {
    if (!solicitacaoId || ocupado) return
    setOcupado(true)
    setErro(null)
    const r = await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo: codigoDigitado })
    setOcupado(false)
    if (!r.sucesso) {
      setErro(r.mensagem)
      setCodigo('')
      if (r.bloqueado) setValidade(0)
      return
    }
    setTokenRedefinicao(r.tokenRedefinicao)
    setEtapa('senha')
    setTimeout(() => senhaRef.current?.focus(), 50)
  }

  async function salvarSenha(e: FormEvent) {
    e.preventDefault()
    const novaSenha = senhaRef.current?.value ?? ''
    const confirmacao = confirmacaoRef.current?.value ?? ''
    if (novaSenha.length < 6) return setErro('A senha deve ter no mínimo 6 caracteres.')
    if (novaSenha !== confirmacao) return setErro('As senhas não conferem.')
    if (!tokenRedefinicao) return
    setOcupado(true)
    setErro(null)
    const r = await redefinirSenha({ token: tokenRedefinicao, novaSenha })
    setOcupado(false)
    if (!r.sucesso) return setErro(r.mensagem)
    setTokenRedefinicao(null)
    setEtapa('sucesso')
  }

  const passos = ['Celular', 'Código', 'Nova senha'] as const
  const indice = etapa === 'celular' ? 0 : etapa === 'codigo' ? 1 : 2

  return (
    <div className="space-y-4">
      {etapa !== 'sucesso' ? (
        <ol className="flex items-center gap-2 text-xs" aria-label="Etapas">
          {passos.map((passo, i) => (
            <li key={passo} className="flex flex-1 items-center gap-2" aria-current={i === indice ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  i < indice ? 'bg-primary text-primary-foreground' : i === indice ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground',
                )}
              >
                {i < indice ? '✓' : i + 1}
              </span>
              <span className={cn('truncate', i === indice ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{passo}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {etapa === 'celular' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void pedirCodigo()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="recuperacao-celular" className="flex items-center gap-2 text-sm text-foreground/80">
              <Smartphone className="h-4 w-4 text-primary" aria-hidden /> Celular cadastrado
            </label>
            <input
              id="recuperacao-celular"
              type="tel"
              required
              autoComplete="tel-national"
              inputMode="tel"
              value={celular}
              onChange={(e) => setCelular(formatarCelularDigitado(e.target.value))}
              placeholder="(00) 00000-0000"
              className={CLASSES_CAMPO}
            />
            <p className="text-xs text-muted-foreground">Enviaremos um código de 6 números. O celular precisa estar verificado na sua conta.</p>
          </div>
          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
          <button type="submit" disabled={ocupado || reenvio > 0} className={CLASSES_BOTAO}>
            {ocupado ? 'Enviando...' : reenvio > 0 ? `Aguarde ${reenvio} s para pedir outro código` : <>Enviar código por SMS <ArrowRight className="h-4 w-4" aria-hidden /></>}
          </button>
        </form>
      ) : null}

      {etapa === 'codigo' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (codigo.length === TAMANHO_CODIGO) void validar(codigo)
          }}
          className="space-y-4"
        >
          {aviso ? (
            <Aviso>
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{aviso}</span>
            </Aviso>
          ) : null}

          <CampoCodigoOtp
            valor={codigo}
            onAlterar={setCodigo}
            onCompleto={(c) => void validar(c)}
            desabilitado={ocupado || validade === 0}
            legenda={
              <>
                <KeyRound className="h-4 w-4 text-primary" aria-hidden /> Código enviado para {celular}
              </>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={cn('inline-flex items-center gap-1.5', validade === 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
              <TimerReset className="h-3.5 w-3.5" aria-hidden />
              {validade > 0 ? `Código válido por ${mmss(validade)}` : 'Código expirado — peça um novo'}
            </span>
            <button type="button" onClick={() => setEtapa('celular')} className="font-medium text-primary hover:underline">
              Alterar número
            </button>
          </div>

          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

          <button type="submit" disabled={ocupado || codigo.length !== TAMANHO_CODIGO || validade === 0} className={CLASSES_BOTAO}>
            {ocupado ? 'Validando...' : <>Validar código <ShieldCheck className="h-4 w-4" aria-hidden /></>}
          </button>
          <button
            type="button"
            onClick={() => void pedirCodigo()}
            disabled={ocupado || reenvio > 0}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {reenvio > 0 ? `Reenviar código em ${reenvio} s` : 'Reenviar código'}
          </button>
        </form>
      ) : null}

      {etapa === 'senha' ? (
        <form onSubmit={salvarSenha} className="space-y-4">
          <Aviso>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Código confirmado. Crie a nova senha da sua conta.</span>
          </Aviso>
          <div className="space-y-2">
            <label htmlFor="nova-senha" className="text-sm text-foreground/80">Nova senha</label>
            <CampoSenha id="nova-senha" ref={senhaRef} required minLength={6} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" className={CLASSES_CAMPO} />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmar-senha" className="text-sm text-foreground/80">Confirme a nova senha</label>
            <CampoSenha id="confirmar-senha" ref={confirmacaoRef} required minLength={6} autoComplete="new-password" placeholder="Repita a senha" className={CLASSES_CAMPO} />
          </div>
          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
          <button type="submit" disabled={ocupado} className={CLASSES_BOTAO}>
            {ocupado ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      ) : null}

      {etapa === 'sucesso' ? (
        <div className="space-y-4 text-center" role="status" aria-live="polite">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
          <div>
            <p className="text-lg font-semibold text-foreground">Senha redefinida</p>
            <p className="mt-1 text-sm text-muted-foreground">Por segurança, todas as sessões anteriores foram encerradas. Entre com a nova senha.</p>
          </div>
          <button type="button" onClick={onVoltarAoLogin} className={CLASSES_BOTAO}>
            Entrar com a nova senha <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}
