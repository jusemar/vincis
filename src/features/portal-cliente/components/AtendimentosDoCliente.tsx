'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Download,
  FileText,
  Flag,
  History,
  Info,
  MessageSquare,
  Paperclip,
  Plus,
  ScrollText,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { anexarArquivoAoAtendimento } from '@/features/atendimentos/actions/anexar-arquivo'
import {
  enviarMensagemAtendimento,
  publicarManifestacao,
} from '@/features/atendimentos/actions/operacao'
import {
  ROTULO_STATUS_ATENDIMENTO,
  rotuloCategoria,
} from '@/features/atendimentos/constants/atendimento'
import { useRolagemDaConversa } from '@/features/atendimentos/hooks/useRolagemDaConversa'
import { SolicitacaoDeAjusteDoCliente } from '@/features/atendimentos/components/cliente/SolicitacaoDeAjusteDoCliente'
import { AvaliacaoDoAtendimento } from '@/features/avaliacoes/components/cliente/AvaliacaoDoAtendimento'
import { useTempoReal } from '@/features/tempo-real/components/TempoRealProvider'
import type { AtendimentoDoClienteDTO } from '@/features/atendimentos/types/atendimento'
import { rotuloPreco } from '@/features/servicos/lib/formatar-preco'
import type { ModeloPreco } from '@/features/servicos/schemas/servico'

type Aba = 'protocolo' | 'conversa' | 'arquivos' | 'historico' | 'informacoes'

/** Prioridade é informação para o Cliente — nunca controle. */
const ROTULO_PRIORIDADE: Record<string, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

const ROTULO_MODELO: Record<string, string> = {
  fixo: 'Preço fixo',
  a_partir_de: 'A partir de',
  por_hora: 'Por hora',
  sob_orcamento: 'Sob orçamento',
}

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))

const formatarTamanho = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Acompanhamento dos Atendimentos na área do Cliente.
 *
 * Não é uma cópia do Kanban do prestador: o Cliente não gerencia fila, ele
 * acompanha o próprio serviço. Por isso lista + detalhe, com os mesmos Card,
 * Button e tipografia que o resto do portal já usa.
 *
 * Tudo o que aparece aqui já veio filtrado do servidor — conversa interna e
 * eventos internos não chegam a existir neste componente.
 */
export function AtendimentosDoCliente({
  atendimentos,
}: {
  atendimentos: AtendimentoDoClienteDTO[]
}) {
  const router = useRouter()
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const aberto = useMemo(
    () => atendimentos.find((a) => a.id === abertoId) ?? null,
    [atendimentos, abertoId],
  )

  if (aberto) {
    return (
      <DetalheAtendimento
        atendimento={aberto}
        onVoltar={() => setAbertoId(null)}
        onAtualizar={() => router.refresh()}
      />
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-semibold">Meus atendimentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe o andamento dos serviços que você contratou.
        </p>

        {atendimentos.length === 0 ? (
          <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
            <MessageSquare className="size-9 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum atendimento em andamento.</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Ao contratar um serviço, o atendimento aparece aqui com protocolo,
              conversa e arquivos.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y rounded-xl border">
            {atendimentos.map((atendimento) => (
              <li key={atendimento.id}>
                <button
                  type="button"
                  onClick={() => setAbertoId(atendimento.id)}
                  className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {atendimento.protocolo}
                    </p>
                    <p className="font-medium">{atendimento.titulo}</p>
                    <p className="text-sm text-muted-foreground">
                      {atendimento.prestador.nome} ·{' '}
                      {new Intl.DateTimeFormat('pt-BR').format(
                        new Date(atendimento.criadoEm),
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {ROTULO_STATUS_ATENDIMENTO[atendimento.status]}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DetalheAtendimento({
  atendimento,
  onVoltar,
  onAtualizar,
}: {
  atendimento: AtendimentoDoClienteDTO
  onVoltar: () => void
  onAtualizar: () => void
}) {
  // O Protocolo é o registro formal do pedido: quando existe, é por ele que o
  // Cliente entra. Sem manifestação nenhuma, a Conversa continua sendo a
  // primeira coisa que ele vê.
  const [aba, setAba] = useState<Aba>(
    atendimento.manifestacoes.length > 0 ? 'protocolo' : 'conversa',
  )
  const [texto, setTexto] = useState('')
  const [manifestacao, setManifestacao] = useState('')
  const [enviando, iniciarTransicao] = useTransition()
  const entradaArquivo = useRef<HTMLInputElement>(null)

  /**
   * Rolagem da Conversa.
   *
   * Exatamente o mesmo hook do painel do prestador — o Cliente merece o mesmo
   * chat. Ele acompanha a mensagem nova quando o Cliente está no fim, não o
   * arranca do histórico quando ele subiu para reler, e sempre mostra o que
   * ele acabou de enviar.
   */
  const ultimaMensagem = atendimento.mensagens.at(-1) ?? null
  const { refLista, temNovaMensagem, irParaOFim } = useRolagemDaConversa({
    chave: `${atendimento.id}:cliente`,
    quantidade: atendimento.mensagens.length,
    idDaUltima: ultimaMensagem?.id ?? null,
    ultimaEhMinha: Boolean(ultimaMensagem?.autorEhCliente),
  })

  const { registrarContextoAtivo, assinarAtendimento } = useTempoReal()

  /**
   * Diz ao tempo real que este Atendimento está aberto na tela do Cliente.
   *
   * É o mesmo contrato do painel do prestador, e serve à mesma regra: quem já
   * está olhando o Atendimento vê a novidade aparecer sozinha e não recebe
   * toast por cima. Sem isto, o Cliente com a entrega aberta na frente receberia
   * um aviso sobre o que está lendo.
   *
   * Assinar o canal do Atendimento também garante a atualização quando o aviso
   * pessoal não chega — reconexão, aba que dormiu, fila perdida.
   */
  useEffect(() => {
    assinarAtendimento(atendimento.id)
    registrarContextoAtivo({
      atendimentoId: atendimento.id,
      aba: aba === 'informacoes' ? 'info' : aba,
      canalConversa: 'cliente',
    })
    return () => {
      assinarAtendimento(null)
      registrarContextoAtivo(null)
    }
  }, [atendimento.id, aba, assinarAtendimento, registrarContextoAtivo])

  function enviar() {
    if (!texto.trim() || enviando) return
    const conteudo = texto
    iniciarTransicao(async () => {
      const resultado = await enviarMensagemAtendimento({
        atendimentoId: atendimento.id,
        // O Cliente escreve sempre no canal compartilhado. O servidor recusaria
        // qualquer outra coisa, mas nem chega a ser oferecido aqui.
        escopo: 'cliente',
        conteudo,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      setTexto('')
      onAtualizar()
    })
  }

  function registrarManifestacao() {
    if (!manifestacao.trim() || enviando) return
    const conteudo = manifestacao
    iniciarTransicao(async () => {
      const resultado = await publicarManifestacao({
        atendimentoId: atendimento.id,
        conteudo,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      setManifestacao('')
      toast.success(resultado.mensagem)
      onAtualizar()
    })
  }

  function anexar(arquivo: File | undefined) {
    if (!arquivo) return
    const dados = new FormData()
    dados.set('atendimentoId', atendimento.id)
    dados.set('arquivo', arquivo)
    iniciarTransicao(async () => {
      const resultado = await anexarArquivoAoAtendimento(dados)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      onAtualizar()
    })
  }

  const contratacao = atendimento.contratacao
  const arquivosDeEntrega = atendimento.arquivos.filter(
    (arquivo) => arquivo.finalidade === 'entrega_final',
  )
  /**
   * A entrega existe, mas o Atendimento voltou a andar.
   *
   * Acontece quando um ajuste pedido pelo Cliente foi aceito: a conclusão
   * anterior é preservada de propósito — data, autor, observação, arquivos e
   * avaliação continuam ali —, mas chamá-la de "Atendimento concluído" enquanto
   * o status diz "Em andamento" seria contradizer o próprio cabeçalho. O bloco
   * é o mesmo; o que muda é o título e o tom, que passa ao neutro do tema.
   */
  const entregaAnterior =
    Boolean(atendimento.conclusao) && atendimento.status !== 'concluido'
  const concluidas = atendimento.checklist.filter((etapa) => etapa.concluido).length
  const progresso = atendimento.checklist.length
    ? Math.round((concluidas / atendimento.checklist.length) * 100)
    : 0

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onVoltar}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Voltar
            </button>
            <p className="font-mono text-xs text-muted-foreground">
              {atendimento.protocolo}
            </p>
            <h2 className="font-serif text-xl font-semibold">{atendimento.titulo}</h2>
            <p className="text-sm text-muted-foreground">
              {atendimento.prestador.nome}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {ROTULO_STATUS_ATENDIMENTO[atendimento.status]}
          </span>
        </div>

        {/*
          Entrega, no mesmo cartão do detalhe.
          Sem tela nova e sem modal: o Cliente já está olhando o Atendimento
          dele, e o que faltava era dizer com clareza que acabou, quando, por
          quem e onde está o resultado. As cores são as de "Concluído" que os
          status já usam.
        */}
        {atendimento.conclusao && (
          <div
            className={
              entregaAnterior
                ? 'rounded-xl border p-4'
                : 'rounded-xl border border-status-done/30 bg-status-done-bg p-4'
            }
          >
            <div
              className={`flex items-center gap-2 font-medium ${
                entregaAnterior ? 'text-foreground' : 'text-emerald-800'
              }`}
            >
              <CheckCircle2 className="size-5 shrink-0" />
              {entregaAnterior ? 'Entrega anterior' : 'Atendimento concluído'}
            </div>
            <p
              className={`mt-1 text-sm ${
                entregaAnterior ? 'text-muted-foreground' : 'text-emerald-900/80'
              }`}
            >
              {formatarData(atendimento.conclusao.em)}
              {atendimento.conclusao.porNome
                ? ` · por ${atendimento.conclusao.porNome}`
                : ''}
            </p>
            {atendimento.conclusao.observacaoFinal && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                {atendimento.conclusao.observacaoFinal}
              </p>
            )}
            {arquivosDeEntrega.length > 0 ? (
              <div className="mt-3">
                <p
                  className={`text-xs font-medium ${
                    entregaAnterior
                      ? 'text-muted-foreground'
                      : 'text-emerald-900/80'
                  }`}
                >
                  {arquivosDeEntrega.length === 1
                    ? 'Arquivo de entrega'
                    : `${arquivosDeEntrega.length} arquivos de entrega`}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {arquivosDeEntrega.map((arquivo) => (
                    <li key={arquivo.id}>
                      <a
                        href={`/api/atendimentos/${atendimento.id}/arquivos/${arquivo.id}`}
                        className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/50"
                      >
                        <FileText className="size-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {arquivo.nome}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatarTamanho(arquivo.tamanhoBytes)}
                        </span>
                        <Download className="size-4 shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p
                className={`mt-3 text-xs ${
                  entregaAnterior
                    ? 'text-muted-foreground'
                    : 'text-emerald-900/80'
                }`}
              >
                Este serviço foi concluído sem entrega de documentos.
              </p>
            )}

            {/*
              Avaliação, no fecho do mesmo cartão.
              Só aparece depois da conclusão porque só um Atendimento concluído
              aceita nota — e é aqui, logo abaixo da entrega, que o Cliente
              acabou de ver o resultado do serviço. Sem tela nova, sem modal e
              com os mesmos Button, borda e tipografia do resto do portal.
            */}
            <AvaliacaoDoAtendimento
              atendimentoId={atendimento.id}
              protocolo={atendimento.protocolo}
              prestadorNome={atendimento.prestador.nome}
              avaliacao={atendimento.avaliacao}
              onAtualizar={onAtualizar}
            />
          </div>
        )}

        {/*
          Solicitação de ajuste, logo abaixo da entrega.
          É o passo seguinte de quem acabou de receber o serviço: se algo não
          ficou certo, o pedido nasce aqui — no mesmo protocolo, sem tela nova e
          sem abrir outro atendimento.

          Fora do cartão de conclusão de propósito: quem decide se cabe pedir é
          o status, e não a existência de observação ou arquivo de entrega. O
          bloco só aparece com o serviço concluído — ou quando já existe um
          pedido para acompanhar.
        */}
        {(atendimento.status === 'concluido' || atendimento.ajuste) && (
          <SolicitacaoDeAjusteDoCliente
            atendimentoId={atendimento.id}
            protocolo={atendimento.protocolo}
            status={atendimento.status}
            ajuste={atendimento.ajuste}
            onAtualizar={onAtualizar}
          />
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'protocolo', label: 'Protocolo', Icone: ScrollText },
              { id: 'conversa', label: 'Conversa', Icone: MessageSquare },
              { id: 'arquivos', label: 'Arquivos', Icone: Paperclip },
              { id: 'historico', label: 'Histórico', Icone: History },
              { id: 'informacoes', label: 'Informações', Icone: Info },
            ] as const
          ).map(({ id, label, Icone }) => (
            <Button
              key={id}
              variant={aba === id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAba(id)}
            >
              <Icone className="size-4" /> {label}
            </Button>
          ))}
        </div>

        {aba === 'protocolo' && (
          <div className="space-y-4">
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Registro formal deste atendimento. Aqui ficam a sua solicitação e
              todas as respostas que ela recebeu.
            </p>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border p-4">
              {atendimento.manifestacoes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma manifestação registrada. Descreva abaixo o que você
                  precisa.
                </p>
              ) : (
                atendimento.manifestacoes.map((item) => (
                  <div
                    key={item.id}
                    className={`flex ${item.autoria ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        item.autoria
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md bg-muted text-foreground'
                      }`}
                    >
                      <p className="mb-1 text-[11px] opacity-80">
                        {item.autoria ? 'Você' : item.autorNome} ·{' '}
                        {item.papelAutor === 'cliente' ? 'Manifestação' : 'Resposta'}{' '}
                        · {formatarData(item.criadoEm)}
                      </p>
                      <p className="whitespace-pre-wrap">{item.conteudo}</p>
                      {item.arquivo && (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-card/60 px-2 py-1 text-[11px] text-foreground">
                          <FileText className="size-3.5" /> {item.arquivo.nome}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border">
              <textarea
                value={manifestacao}
                onChange={(e) => setManifestacao(e.target.value)}
                rows={3}
                placeholder="Descreva sua solicitação ou dúvida…"
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <div className="flex items-center justify-between border-t px-2 py-1.5">
                <span className="px-1.5 text-[11px] text-muted-foreground">
                  Fica registrado no protocolo {atendimento.protocolo}.
                </span>
                <Button
                  size="sm"
                  onClick={registrarManifestacao}
                  disabled={enviando || !manifestacao.trim()}
                >
                  <Send className="size-3.5" />
                  {enviando ? 'Enviando…' : 'Registrar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {aba === 'conversa' && (
          <div className="space-y-4">
            {/* `relative` apenas para ancorar o aviso de mensagem nova sobre a
                lista; não muda o tamanho nem o espaçamento da conversa. */}
            <div className="relative">
            <div
              ref={refLista}
              className="max-h-80 space-y-3 overflow-y-auto rounded-xl border p-4"
            >
              {atendimento.mensagens.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem ainda. Escreva abaixo para falar com o
                  profissional.
                </p>
              ) : (
                atendimento.mensagens.map((mensagem) => (
                  <div
                    key={mensagem.id}
                    className={`flex ${mensagem.autorEhCliente ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        mensagem.autorEhCliente
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md bg-muted text-foreground'
                      }`}
                    >
                      <p className="mb-1 text-[11px] opacity-80">
                        {mensagem.autorEhCliente ? 'Você' : mensagem.autorNome} ·{' '}
                        {formatarData(mensagem.criadoEm)}
                      </p>
                      <p className="whitespace-pre-wrap">{mensagem.conteudo}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {temNovaMensagem && (
              <button
                type="button"
                onClick={() => irParaOFim('smooth')}
                className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
              >
                <ChevronDown className="size-3.5" />
                Nova mensagem
              </button>
            )}
            </div>

            <div className="rounded-xl border">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                rows={3}
                placeholder="Escreva para o profissional…"
                className="w-full resize-none bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <div className="flex justify-end border-t px-2 py-1.5">
                <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>
                  <Send className="size-3.5" />
                  {enviando ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {aba === 'arquivos' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Arquivos do atendimento</h3>
              <Button
                size="sm"
                variant="outline"
                disabled={enviando}
                onClick={() => entradaArquivo.current?.click()}
              >
                <Plus className="size-3.5" /> {enviando ? 'Enviando…' : 'Anexar'}
              </Button>
              <input
                ref={entradaArquivo}
                type="file"
                className="hidden"
                accept=".txt,.pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  anexar(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            {atendimento.arquivos.length === 0 ? (
              <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                Nenhum arquivo enviado.
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {atendimento.arquivos.map((arquivo) => (
                  <li key={arquivo.id}>
                    <a
                      href={`/api/atendimentos/${atendimento.id}/arquivos/${arquivo.id}`}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
                    >
                      <FileText className="size-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {arquivo.nome}
                          </span>
                          {arquivo.finalidade === 'entrega_final' && (
                            <span className="shrink-0 rounded-md bg-status-done-bg px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                              Entrega final
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatarTamanho(arquivo.tamanhoBytes)} ·{' '}
                          {formatarData(arquivo.criadoEm)} ·{' '}
                          {arquivo.origem === 'cliente' ? 'Enviado por você' : arquivo.remetenteNome}
                        </span>
                      </span>
                      <Download className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aba === 'historico' && (
          <div className="relative space-y-4 border-l pl-5">
            {atendimento.eventos.map((evento) => (
              <div key={evento.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card" />
                <p className="text-sm">{evento.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {formatarData(evento.criadoEm)}
                </p>
              </div>
            ))}
          </div>
        )}

        {aba === 'informacoes' && (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Informacao rotulo="Protocolo" valor={atendimento.protocolo} />
            <Informacao
              rotulo="Serviço"
              valor={contratacao?.nomeServico ?? atendimento.titulo}
            />
            <Informacao rotulo="Profissional" valor={atendimento.prestador.nome} />
            <Informacao
              rotulo="Categoria"
              valor={rotuloCategoria(atendimento.categoria)}
            />
            <Informacao
              rotulo="Status"
              valor={ROTULO_STATUS_ATENDIMENTO[atendimento.status]}
            />
            <Informacao
              rotulo="Contratado em"
              valor={formatarData(contratacao?.criadaEm ?? atendimento.criadoEm)}
            />
            <Informacao
              rotulo="Valor"
              valor={
                contratacao
                  ? rotuloPreco(
                      contratacao.modeloPreco as ModeloPreco,
                      contratacao.valorCentavos,
                    )
                  : '—'
              }
            />
            <Informacao
              rotulo="Modelo de preço"
              valor={
                contratacao
                  ? (ROTULO_MODELO[contratacao.modeloPreco] ?? contratacao.modeloPreco)
                  : '—'
              }
            />
            {/*
              Prazo e prioridade são decisões da equipe: aqui aparecem para
              leitura, sem nenhum controle de edição. Quando a profissional
              altera qualquer um dos dois, o novo valor chega nesta tela na
              próxima carga — os dados vêm do mesmo Atendimento, não de uma
              cópia.
            */}
            <Informacao
              rotulo="Prazo"
              valor={
                atendimento.prazoEm
                  ? new Intl.DateTimeFormat('pt-BR').format(new Date(atendimento.prazoEm))
                  : 'Sem prazo definido'
              }
              icone={<Clock className="size-3.5" />}
            />
            <Informacao
              rotulo="Prioridade"
              valor={ROTULO_PRIORIDADE[atendimento.prioridade]}
              icone={<Flag className="size-3.5" />}
            />
            {/* Só depois da conclusão: antes dela não há data nem autor, e um
                travessão aqui pareceria dado faltando. */}
            {atendimento.conclusao && (
              <>
                <Informacao
                  rotulo="Concluído em"
                  valor={formatarData(atendimento.conclusao.em)}
                  icone={<CheckCircle2 className="size-3.5" />}
                />
                <Informacao
                  rotulo="Concluído por"
                  valor={atendimento.conclusao.porNome ?? atendimento.prestador.nome}
                  icone={<CheckCircle2 className="size-3.5" />}
                />
              </>
            )}
          </dl>
        )}

        {/*
          Andamento do serviço, em etapas.
          Só as etapas públicas chegam até aqui — o roteiro interno da equipe
          não é enviado ao navegador do Cliente. E é só leitura: quem marca
          etapa concluída é quem executa o serviço.
        */}
        {aba === 'informacoes' && atendimento.checklist.length > 0 && (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Andamento do serviço</h3>
              <span className="text-xs text-muted-foreground">
                {concluidas}/{atendimento.checklist.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <ul className="space-y-1.5">
              {atendimento.checklist.map((etapa) => (
                <li key={etapa.id} className="flex items-center gap-2 text-sm">
                  {etapa.concluido ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={
                      etapa.concluido ? 'text-muted-foreground line-through' : ''
                    }
                  >
                    {etapa.titulo}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              As etapas são atualizadas pelo profissional responsável.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Informacao({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string
  valor: string
  icone?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icone}
        {rotulo}
      </dt>
      <dd className="mt-1 text-sm font-medium">{valor}</dd>
    </div>
  )
}
