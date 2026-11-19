'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { alterarIdentidadePublica } from '../../actions/identidade-publica'
import {
  APRESENTACAO_EQUIPE_VINCIS,
  ROTULO_IDENTIDADE,
  type IdentidadePublica,
} from '../../constants/identidade-publica'

/**
 * Identidade pública na tela do usuário (Gestão). Só aparece para contas de
 * Gestor. Deixa explícito que muda apresentação, não permissão.
 */
export function IdentidadePublicaGestao({ usuarioId, atual }: { usuarioId: string; atual: IdentidadePublica }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const proxima: IdentidadePublica = atual === 'equipe_vincis' ? 'pessoal' : 'equipe_vincis'

  function alternar() {
    iniciar(async () => {
      const resposta = await alterarIdentidadePublica({ usuarioId, identidade: proxima })
      if (!resposta.sucesso) toast.error(resposta.mensagem)
      else {
        toast.success(resposta.mensagem)
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BadgeCheck className="size-5 text-primary" aria-hidden /> Identidade pública
          </h2>
          <p className="text-sm text-muted-foreground">
            Como esta conta assina artigos e aparece em público. <strong>Não altera permissões</strong>: perfis, acesso à
            Gestão e fluxos de teste continuam iguais.
          </p>
        </div>
        <p className="text-sm">
          Atual: <strong>{ROTULO_IDENTIDADE[atual]}</strong>
        </p>
        {atual === 'equipe_vincis' ? (
          <p className="text-sm text-muted-foreground">
            Assina como “{APRESENTACAO_EQUIPE_VINCIS.funcao}” · “{APRESENTACAO_EQUIPE_VINCIS.identificacao}”, com contato do
            Suporte; fica fora da busca de profissionais e do sitemap.
          </p>
        ) : null}
        <Button type="button" variant="outline" disabled={pendente} onClick={alternar}>
          {proxima === 'equipe_vincis' ? 'Apresentar como equipe Vincis' : 'Voltar a apresentar pelo cadastro profissional'}
        </Button>
      </CardContent>
    </Card>
  )
}
