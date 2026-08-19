'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { confirmarEmail } from '../actions/confirmar-email'
import { reenviarConfirmacaoEmail } from '../actions/reenviar-confirmacao-email'
import {
  ReenvioConfirmacaoSchema,
  type ReenvioConfirmacaoDTO,
} from '../schemas/confirmacao-email'

type EstadoConfirmacao = 'formulario' | 'confirmando' | 'confirmado' | 'invalido'

type ConfirmarEmailPageProps = {
  token?: string
}

export function ConfirmarEmailPage({ token }: ConfirmarEmailPageProps) {
  const tokenEmConfirmacao = useRef<string | null>(null)
  const [estado, setEstado] = useState<EstadoConfirmacao>(token ? 'confirmando' : 'formulario')
  const [mensagem, setMensagem] = useState('')
  const [reenvioFalhou, setReenvioFalhou] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReenvioConfirmacaoDTO>({
    resolver: zodResolver(ReenvioConfirmacaoSchema),
    defaultValues: { email: '' },
  })

  useEffect(() => {
    if (!token || tokenEmConfirmacao.current === token) return

    tokenEmConfirmacao.current = token

    let cancelado = false

    confirmarEmail({ token }).then((resultado) => {
      if (cancelado) return
      setMensagem(resultado.mensagem)
      setEstado(resultado.sucesso ? 'confirmado' : 'invalido')
    })

    return () => {
      cancelado = true
    }
  }, [token])

  async function solicitarNovoLink(dados: ReenvioConfirmacaoDTO) {
    setMensagem('')
    setReenvioFalhou(false)

    const resultado = await reenviarConfirmacaoEmail(dados)
    setMensagem(resultado.mensagem)
    setReenvioFalhou(!resultado.sucesso)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-96 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.4)_1px,transparent_0)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative mx-auto w-full max-w-xl"
      >
        {estado !== 'confirmado' && (
          <div className="mb-7 text-center">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[var(--shadow-glow)]">
              <MailCheck className="size-7" />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Segurança da conta
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Confirme seu e-mail
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Uma etapa rápida para proteger seu acesso antes de criar o espaço do seu escritório.
            </p>
          </div>
        )}

        <Card className="border-border/70 bg-card/95 py-0 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <CardContent className="p-6 sm:p-8">
            {estado === 'confirmando' && (
              <div className="py-10 text-center">
                <LoaderCircle className="mx-auto size-9 animate-spin text-primary" />
                <h2 className="mt-5 font-serif text-2xl font-semibold">Validando seu link...</h2>
                <p className="mt-2 text-sm text-muted-foreground">Isso leva apenas alguns segundos.</p>
              </div>
            )}

            {estado === 'confirmado' && (
              <div className="py-5 text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-8" />
                </div>
                <h1 className="mt-5 font-serif text-3xl font-semibold">E-mail confirmado</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Sua conta foi confirmada com sucesso. Agora você já pode entrar e preparar seu escritório.
                </p>
                <Button asChild size="lg" className="mt-7 h-11 w-full rounded-xl">
                  <Link href="/?entrar=1">
                    Entrar na plataforma
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}

            {estado === 'invalido' && (
              <div className="mb-7">
                <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-destructive/5">
                  <TriangleAlert />
                  <AlertTitle>Este link não está mais disponível</AlertTitle>
                  <AlertDescription>{mensagem}</AlertDescription>
                </Alert>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full rounded-xl"
                  onClick={() => {
                    setEstado('formulario')
                    setMensagem('')
                  }}
                >
                  <RefreshCw className="size-4" />
                  Solicitar novo link
                </Button>
              </div>
            )}

            {estado === 'formulario' && (
              <form className="space-y-5" onSubmit={handleSubmit(solicitarNovoLink)} noValidate>
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Enviaremos um novo link para o e-mail cadastrado, caso a conta ainda esteja pendente.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail cadastrado</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="voce@escritorio.com.br"
                    aria-invalid={Boolean(errors.email)}
                    className="h-12 rounded-xl bg-background/70 px-4"
                    {...register('email')}
                  />
                  {errors.email?.message && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <Button type="submit" size="lg" disabled={isSubmitting} className="h-12 w-full rounded-xl">
                  {isSubmitting ? 'Enviando e-mail...' : 'Reenviar e-mail de confirmação'}
                  {!isSubmitting && <KeyRound className="size-4" />}
                </Button>

                {mensagem && (
                  <Alert variant={reenvioFalhou ? 'destructive' : 'default'} className="rounded-xl">
                    <MailCheck />
                    <AlertTitle>Solicitação processada</AlertTitle>
                    <AlertDescription>{mensagem}</AlertDescription>
                  </Alert>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
