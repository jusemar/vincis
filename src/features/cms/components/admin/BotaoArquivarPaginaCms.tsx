'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { arquivarPaginaCms } from '../../actions/paginas'
import { chamarAcaoCms } from '../../lib/chamar-acao'

/**
 * Arquivar é a "exclusão" do CMS, e por isso é um gesto deliberado: pede
 * confirmação e explica o efeito. O registro continua no banco e o endereço
 * fica reservado; a página sai do site e da navegação.
 */
export function BotaoArquivarPaginaCms({
  paginaId,
  titulo,
  aoArquivar,
  desabilitado = false,
  tamanho = 'default',
}: {
  paginaId: string
  titulo: string
  aoArquivar?: () => void
  desabilitado?: boolean
  tamanho?: 'default' | 'sm'
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pendente, iniciar] = useTransition()

  function confirmar() {
    iniciar(async () => {
      const resultado = await chamarAcaoCms(() => arquivarPaginaCms({ paginaId }))
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setAberto(false)
      aoArquivar?.()
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={tamanho}
        disabled={desabilitado}
        onClick={() => setAberto(true)}
      >
        <Archive className="size-4" />
        Arquivar
      </Button>
      <ModalResponsivo
        aberto={aberto}
        onFechar={() => !pendente && setAberto(false)}
        titulo="Arquivar página?"
        descricao={titulo}
        largura="md"
        rodape={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={pendente} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={pendente} onClick={confirmar}>
              {pendente ? 'Arquivando…' : 'Arquivar página'}
            </Button>
          </div>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>A página sai do site e dos links do rodapé.</li>
          <li>O conteúdo fica guardado, mas não pode mais ser editado nem publicado.</li>
          <li>O endereço continua reservado e não poderá ser usado por outra página.</li>
        </ul>
      </ModalResponsivo>
    </>
  )
}
