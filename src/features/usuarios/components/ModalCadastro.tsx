import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UserPlus, Briefcase, HandHeart, ArrowRight, ArrowLeft, User, Mail, Phone, Lock, RefreshCw, Pencil, MailCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { reenviarConfirmacaoEmail } from '../actions/reenviar-confirmacao-email'
import { CadastroUsuarioSchema, type CadastroUsuarioDTO } from '../schemas/cadastro'

interface ModalCadastroProps {
  aberto: boolean
  onFechar: () => void
  onAbrirEntrar: () => void
}

type Step = 'papel' | 'formulario' | 'confirmacao'

/**
 * Tipo da pessoa escolhido na criação da conta. Profissional e Colaborador são
 * tipos diferentes de prestador — não são "níveis" do mesmo tipo, e nenhum dos
 * dois se transforma no outro por aqui.
 */
type Papel = 'cliente' | 'profissional' | 'colaborador'

export function ModalCadastro({ aberto, onFechar, onAbrirEntrar }: ModalCadastroProps) {
  const [step, setStep] = useState<Step>('papel')
  const [papel, setPapel] = useState<Papel | null>(null)
  const [emailConfirmado, setEmailConfirmado] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [reenviando, setReenviando] = useState(false)

  function handleSelecionarPapel(role: Papel) {
    setPapel(role)
    setStep('formulario')
    setErro(null)
  }

  function handleVoltarPapel() {
    setPapel(null)
    setStep('papel')
    setErro(null)
  }

  async function handleCadastro(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setMensagemSucesso(null)

    const form = e.target as HTMLFormElement
    const dados = new FormData(form)
    const senha = dados.get('senha') as string
    const confirmar = dados.get('confirmar') as string

    if (senha !== confirmar) {
      setErro('Senhas não conferem')
      return
    }

    if (!papel) {
      setErro('Selecione o tipo de conta')
      return
    }

    const dadosCadastro: CadastroUsuarioDTO = {
      nome: dados.get('nome') as string,
      email: dados.get('email') as string,
      whatsapp: dados.get('telefone') as string,
      senha,
      perfilTipo: papel as CadastroUsuarioDTO['perfilTipo'],
    }

    const validated = CadastroUsuarioSchema.safeParse(dadosCadastro)
    if (!validated.success) {
      const erros = validated.error.flatten().fieldErrors
      const primeiraMensagem = Object.values(erros).flat()[0]
      setErro(primeiraMensagem || 'Dados inválidos')
      return
    }

    setCarregando(true)

    try {
      const response = await fetch('/api/auth/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated.data),
      })

      const resultado = await response.json()

      if (!resultado.sucesso) {
        if (resultado.dados?.contaCriada) {
          setEmailConfirmado(validated.data.email)
          setErro(resultado.mensagem)
          setCarregando(false)
          setStep('confirmacao')
          return
        }

        setErro(resultado.mensagem)
        setCarregando(false)
        return
      }

      setMensagemSucesso(resultado.mensagem)
      setEmailConfirmado(validated.data.email)
      setCarregando(false)
      setStep('confirmacao')
    } catch {
      setErro('Erro ao realizar cadastro. Tente novamente.')
      setCarregando(false)
    }
  }

  function handleAlterarEmail() {
    setStep('formulario')
    setErro(null)
    setMensagemSucesso(null)
  }

  async function handleReenviarConfirmacao() {
    if (reenviando) return

    setReenviando(true)
    setErro(null)
    setMensagemSucesso(null)

    try {
      const resultado = await reenviarConfirmacaoEmail({ email: emailConfirmado })

      if (!resultado.sucesso) {
        setErro(resultado.mensagem)
        return
      }

      setMensagemSucesso(resultado.mensagem)
    } catch {
      setErro('Não foi possível gerar um novo link. Tente novamente.')
    } finally {
      setReenviando(false)
    }
  }

  function handleFechar() {
    onFechar()
    setTimeout(() => {
      setStep('papel')
      setPapel(null)
      setEmailConfirmado('')
      setErro(null)
      setMensagemSucesso(null)
      setReenviando(false)
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
              {step === 'confirmacao' && 'Verifique seu e-mail'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'papel' && 'Selecione o tipo de conta que deseja criar'}
              {step === 'formulario' && (papel === 'cliente' ? 'Preencha seus dados para começar' : papel === 'colaborador' ? 'Cadastre-se como colaborador na Vincis' : 'Cadastre-se como profissional na Vincis')}
              {step === 'confirmacao' && 'Abra sua caixa de entrada para ativar sua conta'}
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

                <button
                  onClick={() => handleSelecionarPapel('colaborador')}
                  className="group flex items-center gap-5 p-6 rounded-2xl border border-border/40 hover:border-primary/50 transition-all text-left glass"
                >
                  <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <HandHeart className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-semibold text-foreground text-base block mb-1">Sou Colaborador</span>
                    <span className="text-muted-foreground text-sm leading-relaxed">
                      Tenho conhecimento técnico e presto serviços compatíveis, sem registro em CRC ou OAB
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

                {erro && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}

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
                    <CampoSenha
                      name="senha"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock className="h-4 w-4 text-primary" />
                      Confirmar senha
                    </label>
                    <CampoSenha
                      name="confirmar"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={carregando}
                  className="btn-primary w-full h-12 rounded-xl flex items-center justify-center gap-2 text-base font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {carregando ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Cadastrando...
                    </>
                  ) : (
                    'Criar minha conta'
                  )}
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
                {mensagemSucesso && (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{mensagemSucesso}</span>
                  </div>
                )}

                {erro && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}

                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  <MailCheck className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-2">
                  <p className="text-foreground text-sm">
                    {mensagemSucesso ? 'Enviamos a confirmação para' : 'Conta cadastrada para'}
                  </p>
                  <p className="font-semibold text-foreground text-base break-all">{emailConfirmado}</p>
                  <p className="text-muted-foreground text-xs pt-2">
                    {mensagemSucesso
                      ? 'Abra sua caixa de entrada e clique no botão de confirmação. Verifique também o spam.'
                      : 'Use o botão abaixo para tentar enviar novamente a confirmação.'}
                  </p>
                </div>

                <div className="grid gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleReenviarConfirmacao}
                    disabled={reenviando}
                    className="btn-primary w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${reenviando ? 'animate-spin' : ''}`} />
                    {reenviando ? 'Enviando novamente...' : 'Reenviar e-mail de confirmação'}
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
