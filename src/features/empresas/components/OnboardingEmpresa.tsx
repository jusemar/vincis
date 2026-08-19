'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { motion } from 'framer-motion'
import { ArrowRight, Building2, Calculator, Check, Scale, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/usuarios'
import { criarEmpresaOnboarding } from '../actions/criar-empresa-onboarding'
import { OnboardingEmpresaSchema, type OnboardingEmpresaDTO } from '../schemas/onboarding-empresa'
import type { ContextoEmpresa } from '../types'

type OnboardingEmpresaProps = {
  onConcluido: (contexto: ContextoEmpresa) => void
}

const segmentos = [
  {
    valor: 'advocacia' as const,
    titulo: 'Advocacia',
    descricao: 'Organize seu escritório e sua operação jurídica.',
    icone: Scale,
  },
  {
    valor: 'contabilidade' as const,
    titulo: 'Contabilidade',
    descricao: 'Centralize a rotina do seu escritório contábil.',
    icone: Calculator,
  },
]

export function OnboardingEmpresa({ onConcluido }: OnboardingEmpresaProps) {
  const { tokenSessao, usuario } = useAuth()
  const [erroServidor, setErroServidor] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingEmpresaDTO>({
    resolver: zodResolver(OnboardingEmpresaSchema),
    defaultValues: {
      nome: '',
      segmento: undefined,
    },
  })

  const segmentoSelecionado = useWatch({ control, name: 'segmento' })

  async function onSubmit(dados: OnboardingEmpresaDTO) {
    setErroServidor(null)

    if (!tokenSessao) {
      setErroServidor('Sua sessão expirou. Entre novamente para continuar.')
      return
    }

    const resultado = await criarEmpresaOnboarding(tokenSessao, dados)

    if (!resultado.sucesso || !resultado.contexto) {
      if (resultado.erros) {
        for (const [campo, mensagens] of Object.entries(resultado.erros)) {
          const mensagem = mensagens?.[0]
          if (mensagem) {
            setError(campo as keyof OnboardingEmpresaDTO, { message: mensagem })
          }
        }
      }
      setErroServidor(resultado.mensagem)
      return
    }

    onConcluido(resultado.contexto)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.38)_1px,transparent_0)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
      >
        <section className="px-2 text-center lg:px-0 lg:text-left">
          <div className="mb-7 inline-flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary font-serif text-xl font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
              V
            </div>
            <span className="font-serif text-2xl font-semibold tracking-tight">Vincis</span>
          </div>

          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Seu espaço de trabalho
          </p>
          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Vamos preparar seu escritório.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground lg:mx-0 lg:text-lg">
            Olá, {usuario?.nome.split(' ')[0]}. Crie o ambiente seguro onde sua equipe e seus
            clientes serão organizados.
          </p>

          <div className="mt-8 hidden space-y-4 text-sm text-muted-foreground lg:block">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
              Dados isolados e protegidos por empresa
            </div>
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-4" />
              </span>
              Configuração inicial rápida e sem burocracia
            </div>
          </div>
        </section>

        <Card className="border-border/70 bg-card/95 py-0 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <CardContent className="p-5 sm:p-8">
            <div className="mb-7 flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-semibold">Dados do escritório</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Você poderá completar as informações depois.
                </p>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do escritório ou empresa</Label>
                <Input
                  id="nome"
                  autoComplete="organization"
                  placeholder="Ex.: Almeida Advocacia"
                  aria-invalid={Boolean(errors.nome)}
                  className="h-12 rounded-xl bg-background/70 px-4"
                  {...register('nome')}
                />
                {errors.nome?.message && (
                  <p className="text-sm text-destructive">{errors.nome.message}</p>
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Área de atuação</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {segmentos.map((segmento) => {
                    const Icone = segmento.icone
                    const selecionado = segmentoSelecionado === segmento.valor

                    return (
                      <button
                        key={segmento.valor}
                        type="button"
                        aria-pressed={selecionado}
                        onClick={() => {
                          setValue('segmento', segmento.valor, { shouldValidate: true })
                          setErroServidor(null)
                        }}
                        className={`relative rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          selecionado
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border bg-background/45 hover:border-primary/45 hover:bg-accent/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${selecionado ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground'}`}>
                            <Icone className="size-5" />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{segmento.titulo}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                              {segmento.descricao}
                            </span>
                          </span>
                        </div>
                        {selecionado && (
                          <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {errors.segmento?.message && (
                  <p className="text-sm text-destructive">{errors.segmento.message}</p>
                )}
              </fieldset>

              {erroServidor && (
                <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {erroServidor}
                </div>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting} className="h-12 w-full rounded-xl text-sm font-semibold shadow-[var(--shadow-glow)]">
                {isSubmitting ? 'Criando seu espaço...' : 'Criar escritório e continuar'}
                {!isSubmitting && <ArrowRight className="size-4" />}
              </Button>

              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Ao continuar, você será o primeiro membro deste espaço de trabalho.
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
