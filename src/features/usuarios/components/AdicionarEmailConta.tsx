'use client'

import { useEffect, useState } from 'react'
import { Mail, MailPlus } from 'lucide-react'
import { solicitarAdicaoEmail } from '../actions/adicionar-email'

/**
 * Conta criada pelo celular adiciona um e-mail. O endereço só passa a valer
 * depois do link de confirmação enviado a ele — a tela diz isso, e nunca diz
 * se o endereço já pertence a outra conta.
 *
 * Sem `<form>` de propósito: o cartão aparece dentro de outros formulários
 * ("Atualizar meus dados", perfil profissional) e formulário dentro de
 * formulário é HTML inválido (quebra a hidratação). Enter continua enviando.
 */
export function AdicionarEmailConta({ emailPendente = null }: { emailPendente?: string | null }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null)
  const [aguardando, setAguardando] = useState<string | null>(emailPendente)
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const relogio = setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => clearTimeout(relogio)
  }, [espera])

  async function enviar() {
    if (enviando || espera > 0 || !email.trim()) return
    setEnviando(true)
    setMensagem(null)
    const r = await solicitarAdicaoEmail({ email })
    setEnviando(false)
    setMensagem({ texto: r.mensagem, erro: !r.sucesso })
    if (r.sucesso) {
      setAguardando(email.trim().toLowerCase())
      setEspera(r.aguardarSegundos ?? 60)
    }
  }

  return (
    <div role="group" aria-label="Adicionar e-mail à conta" className="space-y-3 rounded-xl border border-dashed border-border p-4">
      <div className="flex items-start gap-3">
        <MailPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Nenhum e-mail na conta</p>
          <p className="text-xs text-muted-foreground">
            Você entra com o celular. Se quiser, adicione um e-mail — ele só passa a valer depois que você confirmar pelo link que enviaremos.
          </p>
        </div>
      </div>
      {aguardando ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /> Aguardando confirmação de <strong className="break-all text-foreground">{aguardando}</strong>
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="adicionar-email" className="sr-only">
          E-mail
        </label>
        <input
          id="adicionar-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void enviar()
            }
          }}
          placeholder="seu@email.com"
          className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base text-foreground focus:border-ring focus:outline-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || espera > 0}
          className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? 'Enviando...' : espera > 0 ? `Aguarde ${espera} s` : 'Enviar confirmação'}
        </button>
      </div>
      {mensagem ? (
        <p role={mensagem.erro ? 'alert' : 'status'} className={mensagem.erro ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {mensagem.texto}
        </p>
      ) : null}
    </div>
  )
}
