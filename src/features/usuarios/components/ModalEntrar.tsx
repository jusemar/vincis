import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, Lock, ArrowRight, ArrowLeft } from 'lucide-react'

interface ModalEntrarProps {
  aberto: boolean
  onFechar: () => void
  onAbrirCadastro: () => void
}

type View = 'login' | 'esqueci-senha'

export function ModalEntrar({ aberto, onFechar, onAbrirCadastro }: ModalEntrarProps) {
  const [view, setView] = useState<View>('login')

  function handleLogin(e: FormEvent) {
    e.preventDefault()
    onFechar()
  }

  function handleEsqueciSenha(e: FormEvent) {
    e.preventDefault()
    setView('login')
  }

  if (!aberto) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden border border-border/40 bg-card p-8 relative">
        <button
          onClick={onFechar}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {view === 'login' ? (
          <div>
            <div className="text-center mb-6">
              <h2 className="font-serif text-2xl font-bold text-foreground">Bem-vindo de volta</h2>
              <p className="text-sm text-muted-foreground mt-1">Acesse sua conta para continuar</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-foreground/80">
                  <Mail className="h-4 w-4 text-primary" />
                  E-mail ou WhatsApp
                </label>
                <input type="text" required placeholder="seu@email.com ou (00) 00000-0000" className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-foreground/80">
                    <Lock className="h-4 w-4 text-primary" />
                    Senha
                  </label>
                  <button type="button" onClick={() => setView('esqueci-senha')} className="text-xs text-primary hover:underline font-medium">Esqueci minha senha</button>
                </div>
                <input type="password" required placeholder="••••••••" className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]" />
              </div>

              <button type="submit" className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold bg-primary text-primary-foreground">
                Entrar <ArrowRight className="h-4 w-4" />
              </button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="px-3 text-muted-foreground tracking-wider bg-card">ou</span>
                </div>
              </div>

              <button type="button" className="w-full h-11 rounded-xl border border-border bg-background text-foreground font-medium text-sm flex items-center justify-center gap-3 hover:bg-accent/50 transition-colors">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar com Google
              </button>

              <p className="text-center text-xs text-muted-foreground pt-2">
                Não tem conta?{' '}
                <button type="button" onClick={onAbrirCadastro} className="text-primary hover:underline font-medium">Criar conta</button>
              </p>
            </form>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <h2 className="font-serif text-2xl font-bold text-foreground">Recuperar acesso</h2>
              <p className="text-sm text-muted-foreground mt-1">Informe seu e-mail ou WhatsApp e enviaremos um link</p>
            </div>

            <form onSubmit={handleEsqueciSenha} className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-foreground/80">
                  <Mail className="h-4 w-4 text-primary" />
                  E-mail ou WhatsApp
                </label>
                <input type="text" required placeholder="seu@email.com ou (00) 00000-0000" className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]" />
              </div>

              <button type="submit" className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold bg-primary text-primary-foreground">
                Enviar link de recuperação
              </button>

              <button type="button" onClick={() => setView('login')} className="w-full text-center text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Voltar para login
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
