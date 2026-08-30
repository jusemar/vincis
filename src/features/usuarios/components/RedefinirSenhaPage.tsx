'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, KeyRound, Lock, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { CampoSenha } from '@/components/shared/CampoSenha'
import { redefinirSenha } from '../actions/redefinir-senha'

type EstadoRedefinicao = 'formulario' | 'enviando' | 'concluido' | 'invalido'

type RedefinirSenhaPageProps = {
  token?: string
}

const CLASSES_CAMPO =
  'w-full h-12 rounded-xl border border-input bg-background/70 px-4 text-base sm:text-sm text-foreground transition-shadow focus:outline-none focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)]'

export function RedefinirSenhaPage({ token }: RedefinirSenhaPageProps) {
  const [estado, setEstado] = useState<EstadoRedefinicao>(token ? 'formulario' : 'invalido')
  const [mensagem, setMensagem] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMensagem('')

    if (!token) return

    if (novaSenha !== confirmarSenha) {
      setMensagem('As senhas não coincidem.')
      return
    }

    setEstado('enviando')
    const resultado = await redefinirSenha({ token, novaSenha })

    if (resultado.sucesso) {
      setEstado('concluido')
    } else {
      setMensagem(resultado.mensagem)
      setEstado('invalido')
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
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
        {estado !== 'concluido' && (
          <div className="mb-7 text-center">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[var(--shadow-glow)]">
              <KeyRound className="size-7" />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Segurança da conta
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Redefinir sua senha
            </h1>
          </div>
        )}

        <Card className="border-border/70 bg-card/95 py-0 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <CardContent className="p-6 sm:p-8">
            {estado === 'concluido' && (
              <div className="py-5 text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-8" />
                </div>
                <h1 className="mt-5 font-serif text-3xl font-semibold">Senha redefinida</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Sua senha foi alterada com sucesso. Agora você já pode entrar com a nova senha.
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
              <div className="mb-2">
                <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-destructive/5">
                  <TriangleAlert />
                  <AlertTitle>Este link não está mais disponível</AlertTitle>
                  <AlertDescription>
                    {mensagem || 'Link inválido ou expirado. Solicite uma nova recuperação de senha.'}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {(estado === 'formulario' || estado === 'enviando') && (
              <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <Label htmlFor="nova-senha" className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Nova senha
                  </Label>
                  <CampoSenha
                    id="nova-senha"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={CLASSES_CAMPO}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha" className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Confirmar nova senha
                  </Label>
                  <CampoSenha
                    id="confirmar-senha"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={CLASSES_CAMPO}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                  />
                </div>

                {mensagem && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center text-sm text-destructive">
                    {mensagem}
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={estado === 'enviando'}
                  className="h-12 w-full rounded-xl"
                >
                  {estado === 'enviando' ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
