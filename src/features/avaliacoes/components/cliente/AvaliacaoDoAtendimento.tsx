'use client'

import { useState, useTransition } from 'react'
import { Pencil, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { avaliarAtendimento } from '../../actions/avaliar'
import {
  NOTAS_POSSIVEIS,
  TAMANHO_MAXIMO_COMENTARIO,
} from '../../constants/avaliacao'
import type { MinhaAvaliacaoDTO } from '../../types/avaliacao'

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))

/**
 * Uma fileira de cinco estrelas.
 *
 * Botões de verdade quando dá para escolher, e um `<span>` quando é só leitura
 * — teclado e leitor de tela não devem encontrar cinco controles onde não há
 * nada a controlar. O preenchimento acompanha o passar do mouse, para que a
 * nota que será enviada seja a que a pessoa está vendo.
 */
function Estrelas({
  valor,
  onSelecionar,
  desabilitado = false,
}: {
  valor: number
  onSelecionar?: (nota: number) => void
  desabilitado?: boolean
}) {
  const [emFoco, setEmFoco] = useState<number | null>(null)
  const exibido = emFoco ?? valor
  const editavel = Boolean(onSelecionar)

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setEmFoco(null)}
      role={editavel ? 'radiogroup' : undefined}
      aria-label={editavel ? 'Nota do atendimento' : undefined}
    >
      {NOTAS_POSSIVEIS.map((nota) => {
        const preenchida = nota <= exibido
        const icone = (
          <Star
            className={
              preenchida
                ? 'size-6 fill-amber-400 text-amber-400'
                : 'size-6 text-muted-foreground/40'
            }
          />
        )
        if (!editavel) return <span key={nota}>{icone}</span>
        return (
          <button
            key={nota}
            type="button"
            role="radio"
            aria-checked={valor === nota}
            aria-label={nota === 1 ? '1 estrela' : `${nota} estrelas`}
            disabled={desabilitado}
            onMouseEnter={() => setEmFoco(nota)}
            onFocus={() => setEmFoco(nota)}
            onBlur={() => setEmFoco(null)}
            onClick={() => onSelecionar?.(nota)}
            className="rounded-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {icone}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Avaliação do Atendimento, na área do Cliente.
 *
 * Mora dentro do cartão de conclusão que o portal já desenha, com os mesmos
 * Button, tipografia e cantos arredondados do resto da tela — avaliar é o
 * último passo do serviço entregue, não uma tela nova.
 *
 * Três estados, um componente:
 *
 * - ainda não avaliou: estrelas clicáveis e um comentário opcional;
 * - já avaliou: a própria avaliação em leitura, com a data — é assim que a
 *   interface diz "este atendimento já foi avaliado" sem precisar de aviso;
 * - editando: o mesmo formulário, preenchido com o que já existe.
 *
 * Não há botão de excluir, de propósito: nesta etapa a avaliação se corrige,
 * não se apaga.
 */
export function AvaliacaoDoAtendimento({
  atendimentoId,
  protocolo,
  prestadorNome,
  avaliacao,
  onAtualizar,
}: {
  atendimentoId: string
  protocolo: string
  prestadorNome: string
  /** A avaliação que já existe. Nula enquanto o Cliente não avaliou. */
  avaliacao: MinhaAvaliacaoDTO | null
  onAtualizar: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [nota, setNota] = useState(avaliacao?.nota ?? 0)
  const [comentario, setComentario] = useState(avaliacao?.comentario ?? '')
  const [enviando, iniciarTransicao] = useTransition()

  const emFormulario = !avaliacao || editando

  function enviar() {
    // Guarda dupla: o botão já está desabilitado sem nota e durante o envio.
    // Esta linha é o que impede o clique duplo rápido de disparar duas vezes
    // antes de o React desabilitar o botão — o índice único do banco é a
    // terceira e última barreira.
    if (!nota || enviando) return
    iniciarTransicao(async () => {
      const resultado = await avaliarAtendimento({
        atendimentoId,
        nota,
        comentario: comentario.trim() || null,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setEditando(false)
      onAtualizar()
    })
  }

  function cancelar() {
    setNota(avaliacao?.nota ?? 0)
    setComentario(avaliacao?.comentario ?? '')
    setEditando(false)
  }

  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {avaliacao ? 'Sua avaliação' : 'Avalie este atendimento'}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {avaliacao
              ? `Enviada em ${formatarData(avaliacao.criadoEm)}${
                  avaliacao.atualizadoEm !== avaliacao.criadoEm
                    ? ` · editada em ${formatarData(avaliacao.atualizadoEm)}`
                    : ''
                }`
              : `Conte como foi o serviço de ${prestadorNome} no ${protocolo}.`}
          </p>
        </div>
        {avaliacao && !editando && (
          <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        )}
      </div>

      <div className="mt-3">
        <Estrelas
          valor={nota}
          desabilitado={enviando}
          onSelecionar={emFormulario ? setNota : undefined}
        />
      </div>

      {emFormulario ? (
        <div className="mt-3 rounded-xl border">
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={TAMANHO_MAXIMO_COMENTARIO}
            placeholder="Comentário (opcional)…"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <span className="px-1.5 text-[11px] text-muted-foreground">
              {/* O comentário é público: dizer isso antes é mais honesto do que
                  descobrir depois no perfil do prestador. */}
              O comentário aparece no perfil público do profissional.
            </span>
            <div className="flex items-center gap-2">
              {avaliacao && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelar}
                  disabled={enviando}
                >
                  Cancelar
                </Button>
              )}
              <Button size="sm" onClick={enviar} disabled={enviando || !nota}>
                <Star className="size-3.5" />
                {enviando
                  ? 'Enviando…'
                  : avaliacao
                    ? 'Salvar avaliação'
                    : 'Enviar avaliação'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        avaliacao?.comentario && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
            {avaliacao.comentario}
          </p>
        )
      )}
    </div>
  )
}
