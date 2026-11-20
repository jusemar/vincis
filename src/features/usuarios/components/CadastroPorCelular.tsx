'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, KeyRound, Lock, MessageSquareText, RotateCcw, ShieldCheck, Smartphone, TimerReset, User } from 'lucide-react'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { cn } from '@/lib/utils'
import { concluirCadastroPorCelular, solicitarCodigoCadastroSms, verificarCodigoCadastroSms } from '../actions/cadastro-celular'
import { formatarCelularDigitado } from '../lib/telefone'
import { CampoCodigoOtp, TAMANHO_CODIGO } from './CampoCodigoOtp'

/**
 * Cadastro com celular: número → código de 6 dígitos por SMS → nome e senha.
 * Sem e-mail (pode ser adicionado depois, com confirmação própria). A tela só
 * repete o que o servidor respondeu — igual para qualquer número — e nunca
 * afirma que o SMS foi entregue.
 */

type Papel = 'cliente' | 'profissional' | 'colaborador'
type Etapa = 'celular' | 'codigo' | 'dados'

const CLASSES_CAMPO =
  'w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]'
const CLASSES_BOTAO =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50'
const SENHA_MINIMA = 8

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

function Aviso({ erro, children }: { erro?: boolean; children: ReactNode }) {
  return (
    <p
      role={erro ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'flex gap-3 rounded-xl border p-3 text-sm leading-relaxed',
        erro ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-foreground',
      )}
    >
      {children}
    </p>
  )
}

export function CadastroPorCelular({
  papel,
  onConcluido,
}: {
  papel: Papel
  /** Conta criada: a tela de cadastro faz o login com o celular e a senha. */
  onConcluido: (credenciais: { celular: string; senha: string }) => Promise<void>
}) {
  const [etapa, setEtapa] = useState<Etapa>('celular')
  const [celular, setCelular] = useState('')
  const [solicitacaoId, setSolicitacaoId] = useState<string | null>(null)
  const [tokenCadastro, setTokenCadastro] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [reenvio, setReenvio] = useContagem()
  const [validade, setValidade] = useContagem()
  const nomeRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)
  const confirmacaoRef = useRef<HTMLInputElement>(null)

  async function pedirCodigo() {
    if (reenvio > 0 || ocupado) return
    setOcupado(true)
    setErro(null)
    const r = await solicitarCodigoCadastroSms({ celular })
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
    const r = await verificarCodigoCadastroSms({ solicitacaoId, codigo: codigoDigitado })
    setOcupado(false)
    if (!r.sucesso) {
      setErro(r.mensagem)
      setCodigo('')
      if (r.bloqueado) setValidade(0)
      return
    }
    setTokenCadastro(r.tokenCadastro)
    setEtapa('dados')
    setTimeout(() => nomeRef.current?.focus(), 50)
  }

  async function concluir(e: FormEvent) {
    e.preventDefault()
    const nome = nomeRef.current?.value.trim() ?? ''
    const senha = senhaRef.current?.value ?? ''
    if (nome.length < 3) return setErro('Informe seu nome completo.')
    if (senha.length < SENHA_MINIMA) return setErro(`A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`)
    if (senha !== (confirmacaoRef.current?.value ?? '')) return setErro('As senhas não conferem.')
    if (!tokenCadastro) return
    setOcupado(true)
    setErro(null)
    const r = await concluirCadastroPorCelular({ tokenCadastro, nome, senha, perfilTipo: papel })
    if (!r.sucesso) {
      setOcupado(false)
      setErro(r.mensagem)
      if (r.recomecar) {
        setTokenCadastro(null)
        setEtapa('celular')
      }
      return
    }
    await onConcluido({ celular: r.celular, senha })
    setOcupado(false)
  }

  const passos = ['Celular', 'Código', 'Seus dados'] as const
  const indice = etapa === 'celular' ? 0 : etapa === 'codigo' ? 1 : 2

  return (
    <div className="space-y-4">
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

      {etapa === 'celular' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void pedirCodigo()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="cadastro-celular" className="flex items-center gap-2 text-sm text-foreground/80">
              <Smartphone className="h-4 w-4 text-primary" aria-hidden /> Celular com DDD
            </label>
            <input
              id="cadastro-celular"
              type="tel"
              required
              autoComplete="tel-national"
              inputMode="tel"
              value={celular}
              onChange={(e) => setCelular(formatarCelularDigitado(e.target.value))}
              placeholder="(00) 00000-0000"
              className={CLASSES_CAMPO}
            />
            <p className="text-xs text-muted-foreground">Enviaremos um código de 6 números por SMS para confirmar que o celular é seu. Não é preciso e-mail.</p>
          </div>
          {erro ? <Aviso erro>{erro}</Aviso> : null}
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
          {erro ? <Aviso erro>{erro}</Aviso> : null}
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

      {etapa === 'dados' ? (
        <form onSubmit={concluir} className="space-y-4">
          <Aviso>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Celular {celular} confirmado. Agora complete seus dados.</span>
          </Aviso>
          <div className="space-y-2">
            <label htmlFor="cadastro-celular-nome" className="flex items-center gap-2 text-sm text-foreground/80">
              <User className="h-4 w-4 text-primary" aria-hidden /> Nome completo
            </label>
            <input id="cadastro-celular-nome" ref={nomeRef} required autoComplete="name" placeholder="Seu nome completo" className={CLASSES_CAMPO} />
          </div>
          <div className="space-y-2">
            <label htmlFor="cadastro-celular-senha" className="flex items-center gap-2 text-sm text-foreground/80">
              <Lock className="h-4 w-4 text-primary" aria-hidden /> Senha
            </label>
            <CampoSenha id="cadastro-celular-senha" ref={senhaRef} required minLength={SENHA_MINIMA} autoComplete="new-password" placeholder={`Mínimo ${SENHA_MINIMA} caracteres`} className={CLASSES_CAMPO} />
          </div>
          <div className="space-y-2">
            <label htmlFor="cadastro-celular-confirmar" className="flex items-center gap-2 text-sm text-foreground/80">
              <Lock className="h-4 w-4 text-primary" aria-hidden /> Confirmar senha
            </label>
            <CampoSenha id="cadastro-celular-confirmar" ref={confirmacaoRef} required minLength={SENHA_MINIMA} autoComplete="new-password" placeholder="Repita a senha" className={CLASSES_CAMPO} />
          </div>
          <p className="text-xs text-muted-foreground">Você entra com o celular e a senha. Um e-mail pode ser adicionado depois, na sua conta.</p>
          {erro ? <Aviso erro>{erro}</Aviso> : null}
          <button type="submit" disabled={ocupado} className={CLASSES_BOTAO}>
            {ocupado ? 'Criando sua conta...' : 'Criar minha conta'}
          </button>
        </form>
      ) : null}
    </div>
  )
}
