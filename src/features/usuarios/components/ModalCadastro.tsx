import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UserPlus, Briefcase, ArrowRight, ArrowLeft, User, Mail, Phone, Lock, RefreshCw, Pencil, MailCheck } from 'lucide-react'

interface ModalCadastroProps {
  aberto: boolean
  onFechar: () => void
  onAbrirEntrar: () => void
}

type Step = 'papel' | 'formulario' | 'confirmacao'

export function ModalCadastro({ aberto, onFechar, onAbrirEntrar }: ModalCadastroProps) {
  const [step, setStep] = useState<Step>('papel')
  const [papel, setPapel] = useState<'cliente' | 'profissional' | null>(null)
  const [emailConfirmado, setEmailConfirmado] = useState('')

  function handleSelecionarPapel(role: 'cliente' | 'profissional') {
    setPapel(role)
    setStep('formulario')
  }

  function handleVoltarPapel() {
    setPapel(null)
    setStep('papel')
  }

  function handleCadastro(e: FormEvent) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const dados = new FormData(form)
    const senha = dados.get('senha') as string
    const confirmar = dados.get('confirmar') as string

    if (senha !== confirmar) return

    setEmailConfirmado(dados.get('email') as string)
    setStep('confirmacao')
  }

  function handleAlterarEmail() {
    setStep('formulario')
  }

  function handleFechar() {
    onFechar()
    setTimeout(() => {
      setStep('papel')
      setPapel(null)
      setEmailConfirmado('')
    }, 300)
  }

  if (!aberto) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'hsl(0 0% 0% / 0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-lg rounded-2xl overflow-hidden border border-border/40"
        style={{
          background: 'hsl(var(--card) / 0.95)',
          backdropFilter: 'blur(20px) saturate(1.8)',
        }}
      >
        <div className="relative p-8">
          <button
            onClick={handleFechar}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="text-center mb-8">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {step === 'papel' && 'Criar conta'}
              {step === 'formulario' && 'Criar conta'}
              {step === 'confirmacao' && 'Confirme seu e-mail'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'papel' && 'Selecione o tipo de conta que deseja criar'}
              {step === 'formulario' && (papel === 'cliente' ? 'Preencha seus dados para começar' : 'Cadastre-se como profissional na Vincis')}
              {step === 'confirmacao' && 'Enviamos um link de ativação'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === 'papel' && (
              <motion.div
                key="papel"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid gap-4"
              >
                <button
                  onClick={() => handleSelecionarPapel('cliente')}
                  className="group flex items-center gap-5 p-6 rounded-2xl border border-border/40 hover:border-primary/50 transition-all text-left glass"
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <UserPlus className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-foreground text-base block mb-1">Sou Cliente</span>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      Busco serviços jurídicos ou contábeis com profissionais qualificados
                    </span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </button>

                <button
                  onClick={() => handleSelecionarPapel('profissional')}
                  className="group flex items-center gap-5 p-6 rounded-2xl border border-border/40 hover:border-primary/50 transition-all text-left glass"
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-accent/50 flex items-center justify-center group-hover:bg-accent transition-colors">
                    <Briefcase className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-foreground text-base block mb-1">Sou Profissional</span>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      Advogado ou contador que deseja atender clientes pela Vincis
                    </span>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </button>

                <p className="text-center text-xs text-muted-foreground pt-2">
                  Já tem conta?{' '}
                  <button
                    type="button"
                    onClick={onAbrirEntrar}
                    className="text-primary hover:underline font-medium"
                  >
                    Entrar
                  </button>
                </p>
              </motion.div>
            )}

            {step === 'formulario' && (
              <motion.form
                key="formulario"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleCadastro}
                className="space-y-5"
              >
                <button
                  type="button"
                  onClick={handleVoltarPapel}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>

                <div className="rounded-2xl border border-border/40 p-6 space-y-5 glass">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <User className="h-4 w-4 text-primary" />
                      Nome completo
                    </label>
                    <input
                      name="nome"
                      required
                      placeholder="Seu nome completo"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <Mail className="h-4 w-4 text-primary" />
                      E-mail
                    </label>
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="seu@email.com"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <Phone className="h-4 w-4 text-primary" />
                      WhatsApp
                    </label>
                    <input
                      name="telefone"
                      required
                      placeholder="(00) 00000-0000"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>

                  <div className="border-t border-border/30 pt-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-4">Segurança</p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock className="h-4 w-4 text-primary" />
                      Senha
                    </label>
                    <input
                      name="senha"
                      type="password"
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock className="h-4 w-4 text-primary" />
                      Confirmar senha
                    </label>
                    <input
                      name="confirmar"
                      type="password"
                      required
                      placeholder="Repita a senha"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full h-12 rounded-xl flex items-center justify-center gap-2 text-base font-semibold"
                >
                  Criar minha conta
                </button>
              </motion.form>
            )}

            {step === 'confirmacao' && (
              <motion.div
                key="confirmacao"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-border/40 p-8 text-center space-y-6 glass"
              >
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <MailCheck className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-2">
                  <p className="text-foreground text-sm">Enviamos um link de ativação para</p>
                  <p className="font-semibold text-foreground text-base break-all">{emailConfirmado}</p>
                  <p className="text-muted-foreground text-xs pt-2">
                    Após a confirmação, você poderá acessar sua conta. Verifique também sua caixa de spam.
                  </p>
                </div>

                <div className="grid gap-3 pt-2">
                  <button className="btn-primary w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold">
                    <RefreshCw className="h-4 w-4" /> Reenviar e-mail
                  </button>
                  <button
                    type="button"
                    onClick={handleAlterarEmail}
                    className="w-full h-11 rounded-xl border border-border bg-background text-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-accent/50 transition-colors"
                  >
                    <Pencil className="h-4 w-4" /> Alterar e-mail
                  </button>
                </div>

                <div className="border-t border-border/30 pt-4">
                  <p className="text-xs text-muted-foreground">
                    Sua conta ficará ativa somente após a confirmação do e-mail.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
