'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Award, Crown, Gem, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { salvarConfiguracaoDeNiveis } from '../../actions/configurar-niveis'
import { percentualEmTextoDeCampo } from '../../constants/programa'
import type { ConfiguracaoDeNiveis, NivelEstrutural } from '../../lib/niveis'

const ICONE_DO_NIVEL: Record<string, typeof Award> = {
  bronze: Award,
  prata: Gem,
  ouro: Crown,
}

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

type Campos = Record<string, { minimo: string; percentual: string }>

/**
 * Configuração dos níveis, na Gestão Vincis.
 *
 * Os números que a tela mostra são os da versão publicada — nenhum vem do
 * código. Salvar publica uma versão nova; a action confere de novo que quem
 * salva é Gestor e valida tudo antes de gravar. O nível de entrada não tem
 * campo de mínimo: ele é a base e não exige clientes.
 */
export function NiveisDeParceiroPage({
  configuracao,
  estruturais,
  erro,
}: {
  configuracao: ConfiguracaoDeNiveis | null
  estruturais: NivelEstrutural[]
  erro: string | null
}) {
  const router = useRouter()
  const [salvando, iniciarTransicao] = useTransition()
  const niveis = [...estruturais].sort((a, b) => a.ordem - b.ordem)

  const [campos, setCampos] = useState<Campos>(() =>
    Object.fromEntries(
      niveis.map((nivel) => {
        const regra = configuracao?.niveis.find((r) => r.codigo === nivel.codigo)
        return [
          nivel.codigo,
          {
            minimo: regra ? String(regra.minimoClientes) : '',
            percentual: regra ? percentualEmTextoDeCampo(regra.percentualCentesimos) : '',
          },
        ]
      }),
    ),
  )
  const [protecao, setProtecao] = useState(
    configuracao ? String(configuracao.protecaoDias) : '',
  )

  function alterar(codigo: string, campo: 'minimo' | 'percentual', valor: string) {
    setCampos((atual) => ({ ...atual, [codigo]: { ...atual[codigo], [campo]: valor } }))
  }

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await salvarConfiguracaoDeNiveis({
        protecaoDias: protecao,
        niveis: niveis.map((nivel, indice) => ({
          codigo: nivel.codigo,
          minimoClientes: indice === 0 ? '0' : campos[nivel.codigo]?.minimo ?? '',
          percentual: campos[nivel.codigo]?.percentual ?? '',
        })),
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Programa de Parceiros
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold">Configuração de níveis</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Percentual da comissão recorrente e mínimo de clientes recorrentes ativos de
          cada nível, e a proteção contra queda depois de uma subida.
        </p>
        {configuracao ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Versão {configuracao.versao} · vigente desde{' '}
            {QUANDO.format(configuracao.vigenteDesde)}
          </p>
        ) : null}
      </header>

      {erro ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>
            {erro} Enquanto não houver uma configuração válida, nenhuma comissão
            recorrente é gerada.
          </p>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={salvar}>
        <div className="grid gap-4 md:grid-cols-3">
          {niveis.map((nivel, indice) => {
            const Icone = ICONE_DO_NIVEL[nivel.codigo] ?? Award
            const base = indice === 0
            return (
              <Card key={nivel.codigo} className="border-border/70 bg-card/90 backdrop-blur">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icone className="size-5" aria-hidden />
                    </div>
                    <div>
                      <h2 className="font-semibold">{nivel.nome}</h2>
                      <p className="text-xs text-muted-foreground">
                        {base ? 'Nível de entrada' : `Nível ${indice + 1}`}
                      </p>
                    </div>
                  </div>

                  {base ? (
                    <p className="text-xs text-muted-foreground">
                      Não exige clientes: todo parceiro começa aqui.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor={`minimo-${nivel.codigo}`} className="text-xs">
                        Mínimo de clientes recorrentes ativos
                      </Label>
                      <Input
                        id={`minimo-${nivel.codigo}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={campos[nivel.codigo]?.minimo ?? ''}
                        onChange={(e) => alterar(nivel.codigo, 'minimo', e.target.value)}
                        className="w-32 tabular-nums"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor={`percentual-${nivel.codigo}`} className="text-xs">
                      Percentual da comissão recorrente (%)
                    </Label>
                    <Input
                      id={`percentual-${nivel.codigo}`}
                      inputMode="decimal"
                      value={campos[nivel.codigo]?.percentual ?? ''}
                      onChange={(e) => alterar(nivel.codigo, 'percentual', e.target.value)}
                      placeholder="0,00"
                      className="w-32 tabular-nums"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="border-border/70 bg-card/90 backdrop-blur">
          <CardContent className="flex flex-wrap items-end gap-4 p-6">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold">Proteção contra queda</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dias em que o parceiro não cai de nível depois de subir. A proteção já
                  concedida mantém a data com que nasceu.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="protecao-dias" className="text-xs">
                Dias
              </Label>
              <Input
                id="protecao-dias"
                type="number"
                inputMode="numeric"
                min={0}
                value={protecao}
                onChange={(e) => setProtecao(e.target.value)}
                className="w-32 tabular-nums"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs text-muted-foreground">
            As alterações afetam apenas o cálculo de novas comissões e futuras mudanças de
            nível. Comissões já geradas permanecem com o percentual congelado.
          </p>
          <Button type="submit" disabled={salvando || niveis.length === 0}>
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </Button>
        </div>
      </form>
    </section>
  )
}
