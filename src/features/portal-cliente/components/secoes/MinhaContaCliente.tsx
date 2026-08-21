'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Mail, Phone, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { atualizarDadosConta } from '@/features/usuarios/actions/atualizar-dados-conta'
import { rotuloVerificacao } from '@/features/usuarios/lib/verificacao-conta'
import type { DadosPortalCliente } from '../../types/portal'
import { CabecalhoSecao, Dado, Pilula, Superficie } from '../ui/primitivos'

/**
 * Dados da conta do Cliente.
 *
 * Mesma ação de servidor e as mesmas regras de antes — inclusive o e-mail
 * imutável pela tela, porque ele identifica o login e, quando confirmado, é um
 * fato verificado. O que mudou é a organização: situação da conta em uma linha
 * de leitura rápida, e o formulário com um campo por vez em vez de um bloco
 * denso.
 */
export function MinhaContaCliente({ dados }: { dados: DadosPortalCliente }) {
  const router = useRouter()
  const [nome, setNome] = useState(dados.nome)
  const [whatsapp, setWhatsapp] = useState(dados.whatsapp ?? '')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  const [salvando, iniciarTransicao] = useTransition()

  const verificada = dados.emailVerificado || dados.whatsappVerificado

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await atualizarDadosConta({ nome, whatsapp })
      setErro(!resultado.sucesso)
      setMensagem(resultado.mensagem)
      if (resultado.sucesso) router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        contexto="Conta"
        titulo="Minha conta"
        descricao="Seus dados de contato e a situação da sua conta na Vincis."
      />

      <Superficie className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {verificada ? (
              <BadgeCheck className="size-5 text-success" aria-hidden />
            ) : (
              <ShieldAlert className="size-5 text-warning" aria-hidden />
            )}
            <p className="text-sm font-medium">{rotuloVerificacao(dados)}</p>
          </div>
          <Pilula
            rotulo={verificada ? 'Conta ativa' : 'Confirmação pendente'}
            tom={verificada ? 'sucesso' : 'atencao'}
          />
        </div>

        {!dados.emailVerificado ? (
          <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            Seu e-mail ainda não foi confirmado. Você já pode usar a plataforma,
            mas confirme-o para garantir o recebimento das notificações.
          </p>
        ) : null}

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Dado
            rotulo="E-mail"
            valor={
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="truncate">{dados.email}</span>
              </span>
            }
          />
          <Dado
            rotulo="WhatsApp"
            valor={
              <span className="flex items-center gap-1.5 tabular-nums">
                <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                {dados.whatsapp ?? 'não informado'}
              </span>
            }
          />
          <Dado
            rotulo="Cliente desde"
            valor={new Intl.DateTimeFormat('pt-BR').format(
              new Date(dados.criadoEm),
            )}
          />
        </dl>
      </Superficie>

      <Superficie className="p-5">
        <h2 className="text-sm font-semibold">Atualizar meus dados</h2>

        {mensagem ? (
          <p
            role="status"
            className={`mt-4 rounded-lg border p-3 text-sm ${
              erro
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/30 bg-success/10 text-success'
            }`}
          >
            {mensagem}
          </p>
        ) : null}

        <form className="mt-4 grid gap-4 sm:max-w-lg" onSubmit={salvar}>
          <div className="space-y-1.5">
            <Label htmlFor="conta-nome" className="text-xs">
              Nome completo
            </Label>
            <Input
              id="conta-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conta-whatsapp" className="text-xs">
              WhatsApp
            </Label>
            <Input
              id="conta-whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conta-email" className="text-xs">
              E-mail
            </Label>
            <Input id="conta-email" value={dados.email} disabled readOnly />
            <p className="text-[11px] text-muted-foreground">
              Para alterar seu e-mail, fale com a Vincis.
            </p>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </Superficie>
    </div>
  )
}
