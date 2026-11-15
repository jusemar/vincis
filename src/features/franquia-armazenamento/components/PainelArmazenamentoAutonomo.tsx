'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { FileText, HardDrive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PagamentoPixDoPlano } from '@/features/assinaturas/components/cliente/PagamentoPixDoPlano'
import { cn } from '@/lib/utils'
import { contratarBlocoDeArmazenamento, obterMinhaFranquia } from '../actions/franquia'
import { ROTULO_BLOCO_EXTRA } from '../constants/franquia'

type Dados = NonNullable<Awaited<ReturnType<typeof obterMinhaFranquia>>['dados']>

function tamanho(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/**
 * Armazenamento do contador Autônomo, no painel dele.
 *
 * Mostra a franquia gratuita, os blocos de +5 GB vigentes e o uso somado de
 * todas as fontes. Ao atingir o limite, oferece "Adicionar +5 GB — R$ 9,90/mês";
 * o Pix só é gerado depois do clique. Nenhum recurso é bloqueado aqui — só
 * novos uploads, no servidor, quando o espaço acaba.
 *
 * Todo botão é `type="button"`: a aba vive dentro do formulário do perfil.
 */
export function PainelArmazenamentoAutonomo() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [assinaturaId, setAssinaturaId] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const aplicar = useCallback((resposta: Awaited<ReturnType<typeof obterMinhaFranquia>>) => {
    if (resposta.dados) setDados(resposta.dados)
  }, [])

  useEffect(() => {
    obterMinhaFranquia().then(aplicar)
  }, [aplicar])

  function contratar() {
    iniciar(async () => {
      const resposta = await contratarBlocoDeArmazenamento()
      if (!resposta.sucesso) {
        toast.error(resposta.mensagem)
        return
      }
      setAssinaturaId(resposta.dados.assinaturaId)
    })
  }

  function pago() {
    setAssinaturaId(null)
    setEscolhendo(false)
    void obterMinhaFranquia().then(aplicar)
  }

  if (!dados) return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="size-5 text-muted-foreground" aria-hidden />
          Armazenamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dados.limiteBytes ? (
          <>
            <p>
              <strong>{tamanho(dados.usadoBytes)}</strong> de <strong>{tamanho(dados.limiteBytes)}</strong> utilizados
            </p>
            <Progress
              value={dados.percentual ?? 0}
              aria-label="Armazenamento utilizado"
              className={cn(dados.esgotado && '[&>div]:bg-destructive')}
            />
          </>
        ) : (
          <p>
            <strong>{tamanho(dados.usadoBytes)}</strong> utilizados.{' '}
            <span className="text-muted-foreground">Franquia não configurada.</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {dados.franquiaBytes ? `${tamanho(dados.franquiaBytes)} gratuitos` : 'Franquia gratuita'}
          {dados.blocosExtras > 0
            ? ` + ${dados.blocosExtras} bloco${dados.blocosExtras > 1 ? 's' : ''} de +5 GB vigente${dados.blocosExtras > 1 ? 's' : ''}`
            : ''}
          .
        </p>
        {dados.esgotado ? (
          <p role="alert" className="font-medium text-destructive">
            Seu espaço acabou. Novos arquivos não podem ser enviados nem recebidos pela Vincis. Seus arquivos atuais
            continuam guardados e acessíveis.
          </p>
        ) : dados.proximoDoLimite ? (
          <p role="status" className="font-medium text-amber-700 dark:text-amber-300">
            Seu armazenamento está quase no limite.
          </p>
        ) : null}

        {dados.esgotado ? (
          escolhendo ? (
            <div className="space-y-3 rounded-xl border p-3">
              <p className="font-semibold text-foreground">{ROTULO_BLOCO_EXTRA}</p>
              <p className="text-xs text-muted-foreground">
                Pagamento à Vincis pelo espaço. Vale por um mês a partir da confirmação, sem renovação automática. Ao
                vencer, os arquivos não são apagados — só novos envios ficam bloqueados se faltar espaço.
              </p>
              {assinaturaId ? (
                <PagamentoPixDoPlano assinaturaId={assinaturaId} iniciarAutomaticamente onPago={pago} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={contratar} disabled={enviando}>
                    {enviando ? 'Iniciando…' : 'Confirmar e pagar com Pix'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEscolhendo(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEscolhendo(true)}>
              {ROTULO_BLOCO_EXTRA}
            </Button>
          )
        ) : null}

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Conta os arquivos dos seus atendimentos, os anexos de pedidos de orçamento enviados a você e os XMLs da
          Central de Documentos Fiscais do seu escritório.
        </p>
      </CardContent>
    </Card>
  )
}
