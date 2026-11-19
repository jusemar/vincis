'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { alterarVisibilidadeVitrine } from '../../actions/visibilidade-vitrine'
import { ehFotoPublicaValida } from '../../lib/vitrine-publica'

/**
 * Visibilidade na vitrine pública, na tela do usuário da Gestão: mostra por que
 * o perfil está fora (sem foto, ocultado) e permite ocultar/recuperar.
 */
export function VisibilidadeVitrineGestao({
  usuarioId,
  ocultoEm,
  motivo,
  avatarUrl,
  fotoDestaqueUrl,
  slugPublico,
  identidadeEquipe = false,
}: {
  usuarioId: string
  ocultoEm: Date | string | null
  motivo: string | null
  avatarUrl: string | null
  fotoDestaqueUrl: string | null
  slugPublico: string | null
  /** Identidade pública "equipe Vincis": fora da vitrine por regra, sem perder permissões. */
  identidadeEquipe?: boolean
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [novoMotivo, setNovoMotivo] = useState('')
  const semFoto = !ehFotoPublicaValida(avatarUrl) && !ehFotoPublicaValida(fotoDestaqueUrl)

  function alterar(ocultar: boolean) {
    iniciar(async () => {
      const resposta = await alterarVisibilidadeVitrine(ocultar ? { usuarioId, ocultar, motivo: novoMotivo } : { usuarioId, ocultar })
      if (!resposta.sucesso) toast.error(resposta.mensagem)
      else {
        toast.success(resposta.mensagem)
        setNovoMotivo('')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Vitrine pública</h2>
          <p className="text-sm text-muted-foreground">
            Busca de profissionais, Home, sitemap e buscadores. O perfil continua abrindo por link direto.
          </p>
        </div>
        <ul className="space-y-1 text-sm">
          <li>Endereço: {slugPublico ? <code>/profissionais/{slugPublico}</code> : 'ainda sem endereço amigável'}</li>
          {identidadeEquipe ? (
            <li>
              Identidade: <strong>equipe Vincis</strong> — fora da busca de profissionais e do sitemap por regra.
            </li>
          ) : null}
          <li>Foto pública: {semFoto ? 'ausente — fora da vitrine até o profissional enviar' : 'ok'}</li>
          <li>
            Situação:{' '}
            {ocultoEm ? (
              <strong>ocultado pela Gestão{motivo ? ` — ${motivo}` : ''}</strong>
            ) : (
              'não ocultado'
            )}
          </li>
        </ul>
        {ocultoEm ? (
          <Button type="button" variant="outline" className="gap-2" disabled={pendente} onClick={() => alterar(false)}>
            <Eye className="size-4" aria-hidden /> Devolver à vitrine
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="motivo-ocultacao">Motivo (interno)</Label>
              <Input id="motivo-ocultacao" value={novoMotivo} maxLength={255} onChange={(e) => setNovoMotivo(e.target.value)} placeholder="Ex.: perfil de teste" />
            </div>
            <Button type="button" variant="outline" className="gap-2" disabled={pendente || novoMotivo.trim().length < 5} onClick={() => alterar(true)}>
              <EyeOff className="size-4" aria-hidden /> Ocultar da vitrine
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
