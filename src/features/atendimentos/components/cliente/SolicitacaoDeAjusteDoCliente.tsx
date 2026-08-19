'use client'

import { useRef, useState, useTransition } from 'react'
import { FileText, Paperclip, Send, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { solicitarAjuste } from '../../actions/ajustes'
import {
  ROTULO_STATUS_AJUSTE,
  TAMANHO_MAXIMO_MOTIVO_AJUSTE,
  type StatusAtendimento,
} from '../../constants/atendimento'
import type { SolicitacaoDeAjusteDTO } from '../../types/atendimento'

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))

/**
 * Solicitação de ajuste, na área do Cliente.
 *
 * Fica logo abaixo do cartão de entrega, com os mesmos Button, borda e
 * tipografia do resto do portal: pedir um ajuste é o passo seguinte de quem
 * acabou de receber o serviço, não uma tela nova.
 *
 * Mora **fora** do cartão de conclusão de propósito. Quem decide se cabe pedir
 * é o status do Atendimento, e não a existência de dados de entrega: um
 * Atendimento concluído sem observação e sem arquivo — o que existe de verdade
 * no histórico da plataforma — continua sendo um serviço entregue, e o Cliente
 * dele tem o mesmo direito de apontar um problema.
 *
 * Três estados, um componente:
 *
 * - **sem pedido** (e Atendimento concluído): o botão que abre o formulário;
 * - **pedido em análise**: o que foi pedido, quando, e o aviso de que o
 *   Atendimento continua concluído até a análise — porque continua mesmo;
 * - **pedido analisado**: a resposta que ele recebeu, aceita ou recusada.
 *
 * O botão só existe em Atendimento concluído, e some enquanto houver pedido
 * pendente. As duas regras são conferidas de novo no servidor: esconder botão
 * nunca foi proteção.
 */
export function SolicitacaoDeAjusteDoCliente({
  atendimentoId,
  protocolo,
  status,
  ajuste,
  onAtualizar,
}: {
  atendimentoId: string
  protocolo: string
  /** Status atual do Atendimento. Só `concluido` aceita um pedido novo. */
  status: StatusAtendimento
  /** A solicitação mais recente. Nula quando o Cliente nunca pediu. */
  ajuste: SolicitacaoDeAjusteDTO | null
  onAtualizar: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, iniciarTransicao] = useTransition()
  const entradaArquivo = useRef<HTMLInputElement>(null)

  const pendente = ajuste?.status === 'pendente'
  const podePedir = status === 'concluido' && !pendente

  function enviar() {
    // Guarda dupla: o botão já fica desabilitado sem texto e durante o envio.
    // Esta linha é o que impede o clique duplo rápido de disparar duas vezes
    // antes de o React desabilitar o botão — o índice parcial do banco é a
    // terceira e última barreira.
    if (!motivo.trim() || enviando) return
    const dados = new FormData()
    dados.set('atendimentoId', atendimentoId)
    dados.set('motivo', motivo)
    if (arquivo) dados.set('arquivo', arquivo)

    iniciarTransicao(async () => {
      const resultado = await solicitarAjuste(dados)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setMotivo('')
      setArquivo(null)
      setAbrindo(false)
      onAtualizar()
    })
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {ajuste ? 'Solicitação de ajuste' : 'Precisa de algum ajuste?'}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ajuste
              ? `Enviada em ${formatarData(ajuste.criadoEm)}`
              : `Se algo na entrega do ${protocolo} não ficou como esperado, peça um ajuste ao profissional.`}
          </p>
        </div>
        {ajuste && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {ROTULO_STATUS_AJUSTE[ajuste.status]}
          </span>
        )}
      </div>

      {ajuste && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {ajuste.motivo}
          </p>
          {ajuste.arquivo && (
            <a
              href={`/api/atendimentos/${atendimentoId}/arquivos/${ajuste.arquivo.id}`}
              className="inline-flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
            >
              <FileText className="size-3.5 text-primary" />
              {ajuste.arquivo.nome}
            </a>
          )}
          {/* Enquanto ninguém analisou, o Atendimento segue concluído. Dizer
              isso aqui é mais honesto do que deixar o Cliente supor que o
              simples pedido já colocou o serviço de volta na fila. */}
          {pendente && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              O profissional vai analisar. Até lá, o atendimento permanece
              concluído.
            </p>
          )}
          {ajuste.resposta && (
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Resposta
                {ajuste.analisadoPorNome ? ` de ${ajuste.analisadoPorNome}` : ''}
                {ajuste.analisadoEm
                  ? ` · ${formatarData(ajuste.analisadoEm)}`
                  : ''}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {ajuste.resposta}
              </p>
            </div>
          )}
          {ajuste.status === 'aceita' && (
            <p className="text-xs text-muted-foreground">
              O atendimento foi reaberto e voltou a ser trabalhado.
            </p>
          )}
        </div>
      )}

      {podePedir && !abrindo && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => setAbrindo(true)}>
            <Wrench className="size-3.5" />
            {ajuste ? 'Solicitar outro ajuste' : 'Solicitar ajuste'}
          </Button>
        </div>
      )}

      {podePedir && abrindo && (
        <div className="mt-3 rounded-xl border">
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={TAMANHO_MAXIMO_MOTIVO_AJUSTE}
            placeholder="Descreva o que precisa ser ajustado…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          {arquivo && (
            <div className="flex items-center gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              <FileText className="size-3.5 text-primary" />
              <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
              <button
                type="button"
                onClick={() => setArquivo(null)}
                aria-label="Remover anexo"
                className="rounded-md p-0.5 transition-colors hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={enviando}
              onClick={() => entradaArquivo.current?.click()}
            >
              <Paperclip className="size-3.5" /> Anexar
            </Button>
            {/* Mesmo formato aceito pela anexação de sempre: o arquivo entra
                pelo sistema de Arquivos privados já existente. */}
            <input
              ref={entradaArquivo}
              type="file"
              className="hidden"
              accept=".txt,.pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={enviando}
                onClick={() => {
                  setAbrindo(false)
                  setMotivo('')
                  setArquivo(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={enviar}
                disabled={enviando || !motivo.trim()}
              >
                <Send className="size-3.5" />
                {enviando ? 'Enviando…' : 'Enviar solicitação'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
