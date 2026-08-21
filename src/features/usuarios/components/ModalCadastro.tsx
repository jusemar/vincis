import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Briefcase, HandHeart, ArrowRight, ArrowLeft, User, Mail, Phone, Lock, RefreshCw, Pencil, MailCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
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

/**
 * `id` do formulário: o botão de envio mora na barra inferior do modal, fora do
 * `<form>`, para nunca sair da tela junto com a rolagem dos campos. O atributo
 * `form` é o vínculo padrão do HTML entre os dois — mantém submit por Enter,
 * validação nativa e o comportamento de teclado intactos.
 */
const ID_FORM_CADASTRO = 'form-cadastro-vincis'

const OPCOES_PAPEL: Array<{
  papel: Papel
  titulo: string
  descricao: string
  Icone: typeof UserPlus
  classesIcone: string
}> = [
  {
    papel: 'cliente',
    titulo: 'Sou Cliente',
    descricao: 'Busco serviços jurídicos ou contábeis com profissionais qualificados',
    Icone: UserPlus,
    classesIcone: 'bg-primary/10 text-primary group-hover:bg-primary/20',
  },
  {
    papel: 'profissional',
    titulo: 'Sou Profissional',
    descricao: 'Advogado ou contador que deseja atender clientes pela Vincis',
    Icone: Briefcase,
    classesIcone: 'bg-accent/50 text-accent-foreground group-hover:bg-accent',
  },
  {
    papel: 'colaborador',
    titulo: 'Sou Colaborador',
    descricao: 'Tenho conhecimento técnico e presto serviços compatíveis, sem registro em CRC ou OAB',
    Icone: HandHeart,
    classesIcone: 'bg-primary/10 text-primary group-hover:bg-primary/20',
  },
]

/**
 * Campos de texto do cadastro. `h-11` garante alvo de toque confortável e, em
 * conjunto com `text-base` no celular, evita o zoom automático que o iOS aplica
 * quando o campo tem fonte menor que 16px — zoom que desalinhava o modal.
 */
const CLASSES_CAMPO =
  'w-full h-11 rounded-xl border border-input bg-background px-3 text-base sm:text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]'

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

  const titulo = step === 'confirmacao' ? 'Verifique seu e-mail' : 'Criar conta'

  const descricao =
    step === 'papel'
      ? 'Selecione o tipo de conta que deseja criar'
      : step === 'formulario'
        ? papel === 'cliente'
          ? 'Preencha seus dados para começar'
          : papel === 'colaborador'
            ? 'Cadastre-se como colaborador na Vincis'
            : 'Cadastre-se como profissional na Vincis'
        : 'Abra sua caixa de entrada para ativar sua conta'

  /**
   * Cada etapa entrega sua própria barra inferior. Só a etapa de escolha de
   * papel fica sem rodapé — ali as próprias opções são a ação, e um rodapé
   * roubaria altura útil da lista.
   */
  const rodape =
    step === 'formulario' ? (
      <button
        type="submit"
        form={ID_FORM_CADASTRO}
        disabled={carregando}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
    ) : step === 'confirmacao' ? (
      <div className="grid gap-3">
        <button
          type="button"
          onClick={handleReenviarConfirmacao}
          disabled={reenviando}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${reenviando ? 'animate-spin' : ''}`} />
          {reenviando ? 'Enviando novamente...' : 'Reenviar e-mail de confirmação'}
        </button>
        <button
          type="button"
          onClick={handleAlterarEmail}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
        >
          <Pencil className="h-4 w-4" /> Alterar e-mail
        </button>
      </div>
    ) : undefined

  return (
    <ModalResponsivo
      aberto={aberto}
      onFechar={handleFechar}
      titulo={titulo}
      descricao={descricao}
      rodape={rodape}
      acaoCabecalho={
        step === 'formulario' ? (
          <button
            type="button"
            onClick={handleVoltarPapel}
            className="-ml-2 inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait">
        {step === 'papel' && (
          <motion.div
            key="papel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid gap-3"
          >
            {OPCOES_PAPEL.map(({ papel: opcao, titulo: rotulo, descricao: texto, Icone, classesIcone }) => (
              <button
                key={opcao}
                onClick={() => handleSelecionarPapel(opcao)}
                className="glass group flex items-center gap-4 rounded-2xl border border-border/40 p-4 text-left transition-all hover:border-primary/50 sm:gap-5 sm:p-5"
              >
                <div
                  className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-colors sm:h-14 sm:w-14 ${classesIcone}`}
                >
                  <Icone className="h-6 w-6" />
                </div>
                {/* `min-w-0` impede que a descrição longa force largura e crie rolagem lateral. */}
                <div className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-base font-semibold text-foreground">{rotulo}</span>
                  <span className="block text-sm leading-relaxed text-muted-foreground">{texto}</span>
                </div>
                <ArrowRight className="h-5 w-5 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </button>
            ))}

            <p className="pt-1 text-center text-xs text-muted-foreground">
              Já tem conta?{' '}
              <button
                type="button"
                onClick={onAbrirEntrar}
                className="font-medium text-primary hover:underline"
              >
                Entrar
              </button>
            </p>
          </motion.div>
        )}

        {step === 'formulario' && (
          <motion.form
            key="formulario"
            id={ID_FORM_CADASTRO}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleCadastro}
            className="space-y-4"
          >
            {erro && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{erro}</span>
              </div>
            )}

            <div className="glass space-y-4 rounded-2xl border border-border/40 p-4 sm:p-5">
              <div className="space-y-2">
                <label htmlFor="cadastro-nome" className="flex items-center gap-2 text-sm text-foreground/80">
                  <User className="h-4 w-4 text-primary" />
                  Nome completo
                </label>
                <input
                  id="cadastro-nome"
                  name="nome"
                  required
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  className={CLASSES_CAMPO}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="cadastro-email" className="flex items-center gap-2 text-sm text-foreground/80">
                  <Mail className="h-4 w-4 text-primary" />
                  E-mail
                </label>
                <input
                  id="cadastro-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  className={CLASSES_CAMPO}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="cadastro-telefone" className="flex items-center gap-2 text-sm text-foreground/80">
                  <Phone className="h-4 w-4 text-primary" />
                  WhatsApp
                </label>
                <input
                  id="cadastro-telefone"
                  name="telefone"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  className={CLASSES_CAMPO}
                />
              </div>

              <div className="border-t border-border/30 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Segurança</p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="cadastro-senha" className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock className="h-4 w-4 text-primary" />
                      Senha
                    </label>
                    <CampoSenha
                      id="cadastro-senha"
                      name="senha"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                      className={CLASSES_CAMPO}
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="cadastro-confirmar" className="flex items-center gap-2 text-sm text-foreground/80">
                      <Lock className="h-4 w-4 text-primary" />
                      Confirmar senha
                    </label>
                    <CampoSenha
                      id="cadastro-confirmar"
                      name="confirmar"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      className={CLASSES_CAMPO}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.form>
        )}

        {step === 'confirmacao' && (
          <motion.div
            key="confirmacao"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="glass space-y-5 rounded-2xl border border-border/40 p-5 text-center sm:p-6"
          >
            {mensagemSucesso && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{mensagemSucesso}</span>
              </div>
            )}

            {erro && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-left text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 break-words">{erro}</span>
              </div>
            )}

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 sm:h-20 sm:w-20">
              <MailCheck className="h-8 w-8 text-primary sm:h-10 sm:w-10" />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-foreground">
                {mensagemSucesso ? 'Enviamos a confirmação para' : 'Conta cadastrada para'}
              </p>
              <p className="break-all text-base font-semibold text-foreground">{emailConfirmado}</p>
              <p className="pt-1 text-xs text-muted-foreground">
                {mensagemSucesso
                  ? 'Abra sua caixa de entrada e clique no botão de confirmação. Verifique também o spam.'
                  : 'Use o botão abaixo para tentar enviar novamente a confirmação.'}
              </p>
            </div>

            <div className="border-t border-border/30 pt-4">
              <p className="text-xs text-muted-foreground">
                Sua conta ficará ativa somente após a confirmação do e-mail.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalResponsivo>
  )
}
