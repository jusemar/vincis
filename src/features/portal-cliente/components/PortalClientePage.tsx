'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeCheck,
  ClipboardList,
  Headphones,
  LogOut,
  Mail,
  Phone,
  ShieldAlert,
  User,
  UserRound,
} from 'lucide-react'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/usuarios'
import { atualizarDadosConta } from '@/features/usuarios/actions/atualizar-dados-conta'
import { rotuloVerificacao } from '@/features/usuarios/lib/verificacao-conta'
import type { AtendimentoDoClienteDTO } from '@/features/atendimentos/types/atendimento'
import { AtendimentosDoCliente } from './AtendimentosDoCliente'

export type ContratacaoCliente = {
  id: string
  nomeServico: string
  modeloPreco: string
  valorCentavos: number | null
  status: string
  criadoEm: string
  prestadorNome: string
}

export type DadosPortalCliente = {
  nome: string
  email: string
  whatsapp: string | null
  emailVerificado: boolean
  whatsappVerificado: boolean
  criadoEm: string
}

type Aba = 'visao' | 'atendimentos' | 'conta'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return `${partes[0]?.[0] ?? 'C'}${partes.at(-1)?.[0] ?? ''}`.toUpperCase()
}

/**
 * Área autenticada do Cliente.
 *
 * Shell próprio, separado do `/admin`: o painel do prestador não é reaproveitado
 * com botões escondidos. Aqui só existe o que é do Cliente — visão geral da
 * conta e edição dos próprios dados.
 */
/** Rótulos dos status, alinhados aos da área do prestador. */
const STATUS_CONTRATACAO: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  aguardando_orcamento: 'Aguardando orçamento',
}

function valorContratacao(modeloPreco: string, valorCentavos: number | null) {
  if (modeloPreco === 'sob_orcamento' || valorCentavos === null) {
    return 'Sob orçamento'
  }
  const valor = (valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return modeloPreco === 'por_hora' ? `${valor}/h` : valor
}

export function PortalClientePage({
  dados,
  contratacoes = [],
  atendimentos = [],
}: {
  dados: DadosPortalCliente
  contratacoes?: ContratacaoCliente[]
  /** Já chegam filtrados: só os do próprio Cliente, sem nada interno. */
  atendimentos?: AtendimentoDoClienteDTO[]
}) {
  const router = useRouter()
  const { logout } = useAuth()
  const [aba, setAba] = useState<Aba>('visao')
  const [saindo, setSaindo] = useState(false)
  const [nome, setNome] = useState(dados.nome)
  const [whatsapp, setWhatsapp] = useState(dados.whatsapp ?? '')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  const [salvando, iniciarTransicao] = useTransition()

  async function sair() {
    if (saindo) return
    setSaindo(true)
    await logout()
    router.replace('/')
    router.refresh()
  }

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await atualizarDadosConta({ nome, whatsapp })
      setErro(!resultado.sucesso)
      setMensagem(resultado.mensagem)
      if (resultado.sucesso) router.refresh()
    })
  }

  const verificada = dados.emailVerificado || dados.whatsappVerificado

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_34%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.35))]">
      <header className="border-b border-border/70 bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-serif text-lg font-semibold leading-none">
                Minha área
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {dados.email}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={sair}
              disabled={saindo}
              // No mobile só o ícone aparece; sem isto o botão ficaria sem
              // nome acessível para leitores de tela e para navegação assistida.
              aria-label={saindo ? 'Saindo da conta' : 'Sair da conta'}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">
                {saindo ? 'Saindo...' : 'Sair'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={aba === 'visao' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAba('visao')}
          >
            <ClipboardList className="size-4" /> Visão geral
          </Button>
          <Button
            variant={aba === 'atendimentos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAba('atendimentos')}
          >
            <Headphones className="size-4" /> Atendimentos
          </Button>
          <Button
            variant={aba === 'conta' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAba('conta')}
          >
            <User className="size-4" /> Minha conta
          </Button>
        </div>

        {aba === 'visao' && (
          <div className="space-y-6">
            <Card>
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-lg font-bold text-on-gradient">
                  {iniciais(dados.nome)}
                </div>
                <div className="min-w-0">
                  <h1 className="font-serif text-2xl font-semibold">
                    Olá, {dados.nome.split(/\s+/)[0]}.
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cliente desde{' '}
                    {new Intl.DateTimeFormat('pt-BR').format(
                      new Date(dados.criadoEm),
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">Situação da conta</h2>
                <div className="flex items-center gap-2 text-sm">
                  {verificada ? (
                    <BadgeCheck className="size-5 text-primary" />
                  ) : (
                    <ShieldAlert className="size-5 text-amber-500" />
                  )}
                  <span className="font-medium">
                    {rotuloVerificacao(dados)}
                  </span>
                </div>
                {!dados.emailVerificado && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    Seu e-mail ainda não foi confirmado. Você já pode usar a
                    plataforma, mas confirme-o para garantir o recebimento das
                    notificações.
                  </p>
                )}
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="size-3.5" /> E-mail
                    </dt>
                    <dd className="mt-1 break-all text-sm font-medium">
                      {dados.email}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="size-3.5" /> WhatsApp
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {dados.whatsapp ?? 'não informado'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold">Meus serviços</h2>
                {/* O estado vazio some assim que existe contratação real; nada é
                    inventado antes disso. */}
                {contratacoes.length === 0 ? (
                  <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                    <ClipboardList className="size-9 text-muted-foreground" />
                    <p className="mt-3 font-medium">
                      Você ainda não possui serviços contratados.
                    </p>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Quando você contratar um profissional pela Vincis, os
                      serviços e o andamento aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 divide-y rounded-xl border">
                    {contratacoes.map((contratacao) => (
                      <li
                        key={contratacao.id}
                        className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{contratacao.nomeServico}</p>
                          <p className="text-sm text-muted-foreground">
                            {contratacao.prestadorNome} ·{' '}
                            {new Intl.DateTimeFormat('pt-BR').format(
                              new Date(contratacao.criadoEm),
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 sm:shrink-0">
                          <span className="text-sm font-semibold text-primary">
                            {valorContratacao(
                              contratacao.modeloPreco,
                              contratacao.valorCentavos,
                            )}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            {STATUS_CONTRATACAO[contratacao.status] ??
                              contratacao.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {aba === 'atendimentos' && (
          <AtendimentosDoCliente atendimentos={atendimentos} />
        )}

        {aba === 'conta' && (
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold">Meus dados</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Atualize seus dados de contato.
              </p>

              {mensagem && (
                <p
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    erro
                      ? 'border-destructive/30 bg-destructive/10 text-destructive'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {mensagem}
                </p>
              )}

              <form className="mt-5 space-y-5" onSubmit={salvar}>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" value={dados.email} disabled readOnly />
                  {/* O e-mail identifica o login e, quando confirmado, é um
                      fato verificado. Trocá-lo exige fluxo próprio. */}
                  <p className="text-xs text-muted-foreground">
                    Para alterar seu e-mail, fale com a Vincis.
                  </p>
                </div>
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar alterações'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
