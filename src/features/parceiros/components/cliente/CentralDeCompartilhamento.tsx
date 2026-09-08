'use client'

import { useMemo, useState } from 'react'
import { MessageCircle, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { montarLinkDeIndicacao } from '../../constants/destino'
import type { DestinoProfissional } from '../../queries/listar-destinos-profissionais'
import type { LinkDoParceiro } from '../../lib/link-de-indicacao'
import { BotaoCopiar } from './BotaoCopiar'
import { BotaoCompartilhar } from './BotaoCompartilhar'
import { AtivarParceiro } from './AtivarParceiro'

/**
 * Onde o parceiro monta o link que vai compartilhar.
 *
 * ## Um código, vários destinos
 *
 * O código não muda: o que muda é a página em que a pessoa cai depois que o
 * acesso foi registrado. Por isso não há "link de perfil" nem "link da home" —
 * há **o** link do parceiro, com um destino escolhido na hora. Um link de
 * afiliado por funcionalidade multiplicaria códigos e regras de captação, e a
 * primeira divergência entre eles seria uma indicação perdida.
 *
 * ## O código público na lista
 *
 * Cada profissional aparece com o `PRO-XXXXXX` ao lado do nome. Dois
 * profissionais podem se chamar igual, e mandar tráfego para a pessoa errada é
 * um erro que só aparece semanas depois, quando a comissão não veio.
 *
 * O caminho é montado pela mesma função que a rota `/p/` usa para validar o
 * destino: o que não estiver na lista fechada de destinos vira a home, aqui e
 * lá, sem dois entendimentos possíveis.
 */
export function CentralDeCompartilhamento({
  link,
  base,
  profissionais,
}: {
  link: LinkDoParceiro | null
  /** Base pública do site, resolvida no servidor. */
  base: string
  profissionais: DestinoProfissional[]
}) {
  const [destino, setDestino] = useState<'home' | 'perfil'>('home')
  const [prestador, setPrestador] = useState<string>('')

  const escolhido = profissionais.find((p) => p.prestadorId === prestador)

  const url = useMemo(() => {
    if (!link) return ''
    const caminho =
      destino === 'perfil' && escolhido
        ? `/perfil-profissional?prestador=${encodeURIComponent(escolhido.prestadorId)}`
        : null
    return montarLinkDeIndicacao(base, link.codigo, caminho)
  }, [base, link, destino, escolhido])

  if (!link) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <AtivarParceiro />
      </section>
    )
  }

  const mensagem = escolhido
    ? `Conheça ${escolhido.nome} na Vincis: ${url}`
    : `Conheça a Vincis: ${url}`

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Seu link de indicação
        </p>
        <Share2 className="size-4 text-primary" aria-hidden />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">
            Destino
          </span>
          <Select
            value={destino}
            onValueChange={(valor) => setDestino(valor as 'home' | 'perfil')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">Página inicial</SelectItem>
              <SelectItem value="perfil">Perfil de profissional</SelectItem>
            </SelectContent>
          </Select>
        </label>

        {destino === 'perfil' ? (
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">
              Profissional
            </span>
            <Select value={prestador} onValueChange={setPrestador}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar profissional" />
              </SelectTrigger>
              <SelectContent>
                {profissionais.map((profissional) => (
                  <SelectItem
                    key={profissional.prestadorId}
                    value={profissional.prestadorId}
                  >
                    {profissional.nome} · {profissional.codigoPublico}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>

      {/*
        Sem profissional escolhido o link continua válido — ele só aponta para a
        home. Melhor um link que funciona do que um botão desabilitado sem
        explicação.
      */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">
          {url.replace(/^https?:\/\//, '')}
        </span>
        <BotaoCopiar texto={url} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <BotaoCompartilhar
          url={url}
          titulo="Vincis"
          texto={escolhido ? `Conheça ${escolhido.nome} na Vincis` : undefined}
          variant="default"
        />
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        </Button>
      </div>

      {destino === 'perfil' && !escolhido ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Escolha um profissional para o link levar ao perfil dele. Sem escolha,
          ele leva à página inicial.
        </p>
      ) : null}
    </section>
  )
}
