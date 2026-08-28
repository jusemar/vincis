import { useState, useRef, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Mail, Lock, ArrowRight, ArrowLeft } from 'lucide-react'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { useAuth } from '../hooks/useAuth'

interface ModalEntrarProps {
  aberto: boolean
  onFechar: () => void
  onAbrirCadastro: () => void
}

type View = 'login' | 'esqueci-senha'

/** Mesmo motivo do cadastro: a ação vive na barra inferior, fora da rolagem. */
const ID_FORM_LOGIN = 'form-login-vincis'
const ID_FORM_RECUPERACAO = 'form-recuperacao-vincis'

/** `text-base` no celular evita o zoom automático do iOS ao focar o campo. */
const CLASSES_CAMPO =
  'w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]'

export function ModalEntrar({ aberto, onFechar, onAbrirCadastro }: ModalEntrarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [view, setView] = useState<View>('login')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const senhaRef = useRef<HTMLInputElement>(null)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    const emailOuWhatsapp = emailRef.current?.value ?? ''
    const senha = senhaRef.current?.value ?? ''

    const resultado = await login({ emailOuWhatsapp, senha })

    if (resultado.sucesso) {
      onFechar()
      const destino = resultado.destino ?? '/'
      // O Cliente que entrou a partir de uma página pública continua onde
      // estava: ele costuma estar no meio de uma busca por profissionais, e
      // arrastá-lo para `/cliente` interromperia justamente o que o trouxe até
      // aqui. A área dele fica a um clique, no menu do cabeçalho. Prestador e
      // Gestor seguem indo direto para os próprios painéis, como sempre.
      if (destino === '/cliente' && !pathname.startsWith('/cliente')) {
        // `replace` no próprio caminho tira o `?entrar=1` da barra de endereço
        // (senão um F5 reabriria o login para quem já entrou); o `refresh`
        // recarrega os componentes de servidor com a sessão nova.
        //
        // O resto da query **fica**. Antes só o caminho era preservado, e quem
        // entrava a partir de `/perfil-profissional?prestador=<id>` voltava
        // para um perfil sem dono: o parâmetro que dizia de quem era a página
        // ia embora junto com o `entrar=1`. Preservar a query é o que faz
        // "continuar onde estava" ser verdade também para páginas públicas que
        // dependem dela.
        const restante = new URLSearchParams(searchParams.toString())
        restante.delete('entrar')
        const query = restante.toString()
        router.replace(query ? `${pathname}?${query}` : pathname)
        router.refresh()
      } else {
        router.replace(destino)
      }
    } else {
      setErro(resultado.mensagem)
    }

    setCarregando(false)
  }

  function handleEsqueciSenha(e: FormEvent) {
    e.preventDefault()
    setView('login')
  }

  const ehLogin = view === 'login'

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={onFechar}
      largura="md"
      titulo={ehLogin ? 'Bem-vindo de volta' : 'Recuperar acesso'}
      descricao={
        ehLogin
          ? 'Acesse sua conta para continuar'
          : 'Informe seu e-mail ou WhatsApp e enviaremos um link'
      }
      acaoCabecalho={
        ehLogin ? undefined : (
          <button
            type="button"
            onClick={() => setView('login')}
            className="-ml-2 inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para login
          </button>
        )
      }
      rodape={
        ehLogin ? (
          <div className="space-y-3">
            <button
              type="submit"
              form={ID_FORM_LOGIN}
              disabled={carregando}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {carregando ? 'Entrando...' : <>Entrar <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Não tem conta?{' '}
              <button type="button" onClick={onAbrirCadastro} className="font-medium text-primary hover:underline">
                Criar conta
              </button>
            </p>
          </div>
        ) : (
          <button
            type="submit"
            form={ID_FORM_RECUPERACAO}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
          >
            Enviar link de recuperação
          </button>
        )
      }
    >
      {ehLogin ? (
        <form id={ID_FORM_LOGIN} onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-identificador" className="flex items-center gap-2 text-sm text-foreground/80">
              <Mail className="h-4 w-4 text-primary" />
              E-mail ou WhatsApp
            </label>
            <input
              id="login-identificador"
              ref={emailRef}
              name="emailOuWhatsapp"
              type="text"
              required
              autoComplete="username"
              placeholder="seu@email.com ou (00) 00000-0000"
              className={CLASSES_CAMPO}
            />
          </div>

          <div className="space-y-2">
            {/* `flex-wrap` mantém rótulo e atalho legíveis a partir de 320px. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <label htmlFor="login-senha" className="flex items-center gap-2 text-sm text-foreground/80">
                <Lock className="h-4 w-4 text-primary" />
                Senha
              </label>
              <button
                type="button"
                onClick={() => setView('esqueci-senha')}
                className="text-xs font-medium text-primary hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
            <CampoSenha
              id="login-senha"
              ref={senhaRef}
              name="senha"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={CLASSES_CAMPO}
            />
          </div>

          {erro && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">
              {erro}
            </p>
          )}

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 tracking-wider text-muted-foreground">ou</span>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-border bg-background text-sm font-medium text-foreground opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuar com Google
          </button>
        </form>
      ) : (
        <form id={ID_FORM_RECUPERACAO} onSubmit={handleEsqueciSenha} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="recuperacao-identificador" className="flex items-center gap-2 text-sm text-foreground/80">
              <Mail className="h-4 w-4 text-primary" />
              E-mail ou WhatsApp
            </label>
            <input
              id="recuperacao-identificador"
              type="text"
              required
              autoComplete="username"
              placeholder="seu@email.com ou (00) 00000-0000"
              className={CLASSES_CAMPO}
            />
          </div>
        </form>
      )}
    </ModalResponsivo>
  )
}
