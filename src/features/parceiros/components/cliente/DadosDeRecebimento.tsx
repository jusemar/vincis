'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Info, KeyRound, Pencil, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import { salvarRecebimento } from '../../actions/salvar-recebimento'
import {
  ROTULO_CHAVE_PIX,
  TIPOS_CHAVE_PIX,
  type TipoChavePix,
} from '../../constants/recebimento'
import type { RecebimentoDoParceiro } from '../../queries/obter-recebimento'

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const EXEMPLO: Record<TipoChavePix, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'voce@exemplo.com',
  telefone: '(11) 90000-0000',
  aleatoria: '00000000-0000-4000-8000-000000000000',
}

/**
 * Para onde o parceiro recebe.
 *
 * ## Por que a chave aparece mascarada
 *
 * Quem abre esta tela precisa **reconhecer** a própria chave, não relê-la
 * inteira. Mostrar o valor completo por padrão o entregaria a qualquer pessoa
 * que passasse pela mesa, sem nenhum ganho: para trocar a chave se digita a
 * nova, nunca a antiga.
 *
 * ## O aviso é parte do produto
 *
 * A Vincis não consulta o arranjo de pagamentos e não tem como afirmar que a
 * chave existe nem que pertence ao titular informado. Quem confere é o
 * parceiro — e o texto diz isso, porque um formulário que aceita em silêncio
 * sugere uma validação que não houve.
 *
 * ## O que a tela não faz
 *
 * Não paga, não gera QR Code e não fala com banco. O pagamento é manual, feito
 * pelo Gestor por fora, e este bloco é só o endereço.
 */
export function DadosDeRecebimento({
  recebimento,
}: {
  recebimento: RecebimentoDoParceiro | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(recebimento === null)
  const [tipoChave, setTipoChave] = useState<TipoChavePix>(
    recebimento?.tipoChave ?? 'cpf',
  )
  const [chave, setChave] = useState('')
  const [titular, setTitular] = useState(recebimento?.titular ?? '')
  const [salvando, iniciarTransicao] = useTransition()

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await salvarRecebimento({ tipoChave, chave, titular })
      if (resultado.sucesso) {
        toast.success(resultado.mensagem)
        setChave('')
        setEditando(false)
        router.refresh()
      } else {
        toast.error(resultado.mensagem)
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Dados para recebimento</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A chave Pix para onde a Vincis envia os seus saques.
              </p>
            </div>
          </div>
          <Pilula
            rotulo={recebimento ? 'Cadastrado' : 'Não cadastrado'}
            tom={recebimento ? 'sucesso' : 'atencao'}
          />
        </div>

        {recebimento && !editando ? (
          <div className="mt-5 space-y-3">
            <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Tipo</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {ROTULO_CHAVE_PIX[recebimento.tipoChave]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Chave</dt>
                <dd className="mt-0.5 truncate font-mono text-sm">
                  {recebimento.chaveMascarada}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Titular</dt>
                <dd className="mt-0.5 truncate text-sm">{recebimento.titular}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs tabular-nums text-muted-foreground">
                Atualizado em {QUANDO.format(recebimento.atualizadoEm)}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setChave('')
                  setEditando(true)
                }}
              >
                <Pencil className="size-4" aria-hidden />
                Alterar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={salvar} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tipo-chave">Tipo da chave</Label>
                <Select
                  value={tipoChave}
                  onValueChange={(valor) => {
                    setTipoChave(valor as TipoChavePix)
                    setChave('')
                  }}
                >
                  <SelectTrigger id="tipo-chave">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CHAVE_PIX.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {ROTULO_CHAVE_PIX[tipo]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chave-pix">Chave Pix</Label>
                <Input
                  id="chave-pix"
                  value={chave}
                  onChange={(evento) => setChave(evento.target.value)}
                  placeholder={EXEMPLO[tipoChave]}
                  autoComplete="off"
                  maxLength={140}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="titular-chave">Nome do titular da chave</Label>
              <Input
                id="titular-chave"
                value={titular}
                onChange={(evento) => setTitular(evento.target.value)}
                placeholder="Como consta na sua conta bancária"
                autoComplete="off"
                maxLength={120}
              />
            </div>

            <p className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Conferimos o formato da chave, não a titularidade: a Vincis não
              consulta o seu banco. Confira os dados — o pagamento é enviado
              exatamente para a chave informada aqui.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar dados'}
              </Button>
              {recebimento ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={salvando}
                  onClick={() => {
                    setEditando(false)
                    setChave('')
                    setTitular(recebimento.titular)
                    setTipoChave(recebimento.tipoChave)
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        )}

        <p className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
          Só você e a Gestão da Vincis enxergam estes dados, e a Gestão os usa
          apenas para transferir o valor dos seus saques.
        </p>
      </CardContent>
    </Card>
  )
}
