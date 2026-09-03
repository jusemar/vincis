'use client'

import { startTransition, useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  Clock,
  Globe2,
  Handshake,
  Target,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { confirmarInteresseNaOportunidade } from '../../actions/conversa-direta'
import { responderContraproposta } from '../../actions/negociacao'
import { registrarVisualizacaoDaOportunidade } from '../../actions/oportunidades'
import {
  carregarOportunidadesDisponiveis,
  marcarSemInteresse,
} from '../../actions/propostas'
import {
  ROTULO_ORIGEM_OPORTUNIDADE,
  ROTULO_VISIBILIDADE_OPORTUNIDADE,
  ehDeSimulacao,
  rotuloDaCategoria,
} from '../../constants/oportunidade'
import type { OportunidadeParaPrestadorDTO } from '../../types/oportunidade'
import { ConversaDaOportunidade } from '../compartilhado/ConversaDaOportunidade'
import { ListaDeAnexos } from '../compartilhado/ListaDeAnexos'
import { RetratoDaSimulacao } from '../compartilhado/RetratoDaSimulacao'
import { formatarDataHora, formatarValor } from '../compartilhado/formato'
import { ModalEnviarProposta } from './ModalEnviarProposta'

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

/**
 * Oportunidades disponíveis para o prestador.
 *
 * Área própria, e de propósito fora do quadro de Atendimentos: oportunidade é
 * a etapa **anterior** à contratação e misturá-la ao Kanban faria trabalho não
 * contratado ocupar a mesma fila do trabalho em execução.
 *
 * As **solicitações diretas** — as que um Cliente enviou pelo perfil desta
 * pessoa — convivem aqui, na mesma lista, e não numa tela separada: o que se
 * faz com elas é idêntico (analisar, propor, negociar), e separá-las criaria
 * duas filas para a mesma decisão. O que as distingue é um rótulo e uma linha
 * de contexto.
 *
 * O que a tela nunca mostra: proposta de outro prestador. Não é uma omissão de
 * interface — o dado não chega aqui, porque a consulta filtra por
 * `prestador_id` no SQL.
 *
 * Os dados carregam por Server Action no navegador, como o sino e as demais
 * páginas do painel, que é um componente de cliente.
 */
export default function OportunidadesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Deep-link do sino: `?pagina=oportunidades&oportunidade=<id>` destaca a que
  // originou o aviso, em vez de largar a pessoa numa lista sem referência.
  const destacada = searchParams.get('oportunidade')

  const [lista, setLista] = useState<OportunidadeParaPrestadorDTO[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionada, setSelecionada] =
    useState<OportunidadeParaPrestadorDTO | null>(null)
  const [dispensando, setDispensando] = useState<string | null>(null)
  const [respondendo, setRespondendo] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    const resultado = await carregarOportunidadesDisponiveis()
    setLista(resultado.sucesso ? (resultado.dados?.lista ?? []) : [])
    setCarregando(false)
    // O banner do Dashboard é renderizado no servidor: sem o refresh, ele só
    // voltaria ao estado da meta no próximo F5.
    router.refresh()
  }, [router])

  useEffect(() => {
    startTransition(async () => {
      await buscar()
    })
  }, [buscar])

  /*
    Abrir a área **é** abrir a solicitação.

    O cartão do prestador não esconde nada atrás de um clique: descrição,
    simulação e valor aparecem inteiros na lista. Então o instante em que ele
    pode ler é o instante em que a lista renderiza — e é esse que o Cliente lê
    como "visualizada". Marcar só no clique de "Enviar proposta" diria que ele
    não viu o pedido que já estava lendo.

    Só as dirigidas a ele entram: numa pública não há destinatário, e a marca de
    um prestador entre dezenas não é informação de ninguém. O servidor confere
    isso de novo — aqui a filtragem existe para não gastar requisição.

    Falhar é aceitável e silencioso: a marca é conveniência do Cliente, não pode
    derrubar a fila de trabalho de quem está lendo.
  */
  useEffect(() => {
    const dirigidas = lista
      .filter((item) => item.direcionadaAMim)
      .map((item) => item.id)
    if (!dirigidas.length) return

    startTransition(async () => {
      for (const id of dirigidas) {
        await registrarVisualizacaoDaOportunidade({ oportunidadeId: id })
      }
    })
  }, [lista])

  async function responder(
    contrapropostaId: string,
    decisao: 'aceitar' | 'recusar',
  ) {
    setRespondendo(contrapropostaId)
    const resultado = await responderContraproposta({ contrapropostaId, decisao })
    if (!resultado.sucesso) toast.error(resultado.mensagem)
    else toast.success(resultado.mensagem)
    await buscar()
    setRespondendo(null)
  }

  async function confirmarInteresse(oportunidadeId: string) {
    setConfirmando(oportunidadeId)
    const resultado = await confirmarInteresseNaOportunidade({ oportunidadeId })
    if (!resultado.sucesso) toast.error(resultado.mensagem)
    else toast.success(resultado.mensagem)
    await buscar()
    setConfirmando(null)
  }

  async function dispensar(oportunidadeId: string) {
    setDispensando(oportunidadeId)
    const resultado = await marcarSemInteresse({ oportunidadeId })
    if (!resultado.sucesso) toast.error(resultado.mensagem)
    else toast.success(resultado.mensagem)
    await buscar()
    setDispensando(null)
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold">Oportunidades</h2>
          <p className="text-muted-foreground">
            Clientes que procuram profissionais da sua categoria — e as
            solicitações enviadas diretamente para você. Envie sua proposta para
            participar.
          </p>
        </div>
      </motion.div>

      {carregando ? (
        <div className="bg-card border rounded-xl p-6">
          <p className="text-muted-foreground">Carregando oportunidades...</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
            <Target className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">
            Nenhuma oportunidade disponível agora
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Assim que um cliente solicitar orçamento na sua categoria — ou
            diretamente pelo seu perfil —, a solicitação aparece aqui e no seu
            sino de notificações.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lista.map((oportunidade, index) => (
            <motion.article
              key={oportunidade.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className={`bg-card border rounded-xl p-5 transition-all hover:shadow-lg ${
                destacada === oportunidade.id ? 'ring-2 ring-primary' : ''
              } ${oportunidade.dispensada && !oportunidade.minhaProposta ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-info rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                    {rotuloDaCategoria(oportunidade.categoria)}
                  </span>
                  {/* Pílula existente do design system, sem cor nova: o que
                      muda é a origem do pedido, não o que fazer com ele. */}
                  {oportunidade.direcionadaAMim ? (
                    <span className="badge-warning rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                      {ROTULO_VISIBILIDADE_OPORTUNIDADE.privada}
                    </span>
                  ) : null}
                  {/* A origem é a segunda pergunta, e por isso a segunda
                      pílula: "quem me mandou" e "de onde veio" são coisas
                      diferentes, e quem trabalha a fila usa as duas. */}
                  {ehDeSimulacao(oportunidade.origem) ? (
                    <span className="badge-info rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                      {ROTULO_ORIGEM_OPORTUNIDADE.simulacao_preco}
                    </span>
                  ) : null}
                </div>
                {oportunidade.minhaProposta ? (
                  <span className="badge-success flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                    <CheckCircle2 className="size-3.5" />
                    Proposta enviada
                  </span>
                ) : oportunidade.dispensada ? (
                  // Dispensada não some da lista: o prestador precisa poder ver
                  // o que tirou da fila — e ainda pode mudar de ideia.
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Sem interesse
                  </span>
                ) : null}
              </div>

              {oportunidade.especialidades.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {oportunidade.especialidades.map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}

              {/* Dito com todas as letras: o Cliente escolheu esta pessoa no
                  perfil dela, e ninguém mais recebeu o pedido. */}
              {oportunidade.direcionadaAMim ? (
                <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-foreground">
                  {ehDeSimulacao(oportunidade.origem)
                    ? 'Este cliente simulou o preço na sua página e quer conversar. Ainda não é contratação.'
                    : 'Solicitação enviada diretamente para você. Nenhum outro profissional a recebeu.'}
                </p>
              ) : null}

              {/* Na simulação a descrição é gerada a partir do retrato — repetir
                  as duas coisas seria ler o mesmo cenário duas vezes. */}
              {oportunidade.simulacao ? (
                <RetratoDaSimulacao simulacao={oportunidade.simulacao} />
              ) : (
                <p className="mt-3 line-clamp-3 text-sm">
                  {oportunidade.descricao}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5" />
                  {oportunidade.clienteNome}
                </span>
                <span className="flex items-center gap-1.5">
                  <Globe2 className="size-3.5" />
                  {oportunidade.abrangencia}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {formatarData(oportunidade.criadoEm)}
                </span>
              </div>

              {/* Referência informada pelo Cliente — não é teto nem preço.
                  Na simulação ele não informou nada: o número que existe é o que
                  a página **exibiu**, e ele já está no retrato acima com o nome
                  certo. Repeti-lo aqui o transformaria em orçamento declarado. */}
              {oportunidade.simulacao ? null : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Quanto o Cliente pretende investir:{' '}
                  <b className="text-foreground">
                    {formatarValor(oportunidade.valorPretendidoCentavos)}
                  </b>
                </p>
              )}

              <ListaDeAnexos anexos={oportunidade.anexos} />

              {oportunidade.minhaProposta && (
                <div className="mt-4 space-y-2">
                  <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Sua proposta:{' '}
                    <b className="text-foreground">
                      {formatarValor(
                        oportunidade.minhaProposta.valorCentavos,
                        'valor a combinar',
                      )}
                    </b>
                    {oportunidade.minhaProposta.prazoEstimadoDias != null && (
                      <> · {oportunidade.minhaProposta.prazoEstimadoDias} dias</>
                    )}
                    {oportunidade.minhaProposta.validaAte && (
                      <>
                        {' '}
                        · válida até{' '}
                        {formatarDataHora(oportunidade.minhaProposta.validaAte)}
                      </>
                    )}
                  </p>

                  {oportunidade.minhaProposta.status === 'aceita' && (
                    <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                      <p className="flex items-center gap-2">
                        <Handshake className="size-4 shrink-0" />
                        Acordo fechado por{' '}
                        {formatarValor(
                          oportunidade.minhaProposta.valorAcordadoCentavos ??
                            oportunidade.minhaProposta.valorCentavos,
                          'valor a combinar',
                        )}
                        .
                      </p>
                      {/* O trabalho começa quando o Cliente paga — dizer isso
                          evita que o prestador comece antes de haver
                          contratação efetivada. */}
                      {oportunidade.atendimento ? (
                        <p className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4 shrink-0" />
                          Pagamento aprovado · atendimento{' '}
                          {oportunidade.atendimento.protocolo} aberto.
                        </p>
                      ) : (
                        <p className="flex items-center gap-2">
                          <Clock className="size-4 shrink-0" />
                          Aguardando o pagamento do Cliente para abrir o
                          atendimento.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Contraproposta é ato comercial com valor e estado — por
                      isso aparece aqui, e não como mensagem de conversa. */}
                  {oportunidade.minhaProposta.contrapropostaPendente && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-xs font-semibold">
                        Contraproposta do Cliente:{' '}
                        {formatarValor(
                          oportunidade.minhaProposta.contrapropostaPendente
                            .valorCentavos,
                        )}
                      </p>
                      {oportunidade.minhaProposta.contrapropostaPendente
                        .mensagem && (
                        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                          {
                            oportunidade.minhaProposta.contrapropostaPendente
                              .mensagem
                          }
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Recebida em{' '}
                        {formatarDataHora(
                          oportunidade.minhaProposta.contrapropostaPendente
                            .criadoEm,
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            respondendo ===
                            oportunidade.minhaProposta.contrapropostaPendente.id
                          }
                          onClick={() =>
                            void responder(
                              oportunidade.minhaProposta!.contrapropostaPendente!
                                .id,
                              'aceitar',
                            )
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
                        >
                          Aceitar contraproposta
                        </button>
                        <button
                          type="button"
                          disabled={
                            respondendo ===
                            oportunidade.minhaProposta.contrapropostaPendente.id
                          }
                          onClick={() =>
                            void responder(
                              oportunidade.minhaProposta!.contrapropostaPendente!
                                .id,
                              'recusar',
                            )
                          }
                          className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
                        >
                          Recusar
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Recusar mantém sua proposta original valendo.
                      </p>
                    </div>
                  )}

                  {oportunidade.minhaProposta.historicoContrapropostas.length >
                    0 && (
                    <ul className="space-y-1 text-[11px] text-muted-foreground">
                      {oportunidade.minhaProposta.historicoContrapropostas.map(
                        (rodada) => (
                          <li key={rodada.id}>
                            Contraproposta de{' '}
                            {formatarValor(rodada.valorCentavos)} ·{' '}
                            {rodada.status === 'aceita' ? 'aceita' : 'recusada'}{' '}
                            em {formatarDataHora(rodada.respondidaEm)}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/*
                A conversa fica dentro do cartão, e só no fluxo direto: na
                solicitação tradicional a troca acontece por proposta e
                contraproposta, e um segundo canal ao lado mudaria o módulo.
              */}
              {ehDeSimulacao(oportunidade.origem) ? (
                <ConversaDaOportunidade
                  oportunidadeId={oportunidade.id}
                  naoLidas={oportunidade.mensagensNaoLidas}
                  aoMudar={() => {
                    startTransition(async () => {
                      await buscar()
                    })
                  }}
                />
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                {/*
                  Fluxo direto: duas ações conceituais, sem preço.

                  "Tenho interesse" é só isto — quero conversar com este
                  potencial cliente. Não cria proposta, e é por não criar que
                  aceite, contraproposta, pagamento e Atendimento continuam
                  fora do alcance desta origem. O valor da simulação segue
                  acima, no retrato, como referência do que o cliente viu.
                */}
                {ehDeSimulacao(oportunidade.origem) ? (
                  <>
                    {oportunidade.interesseEm ? (
                      <span className="badge-success flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
                        <CheckCircle2 className="size-3.5" />
                        Interesse confirmado
                      </span>
                    ) : oportunidade.dispensada ? null : (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        disabled={confirmando === oportunidade.id}
                        onClick={() => void confirmarInteresse(oportunidade.id)}
                        className="rounded-lg bg-gradient-gold px-5 py-2.5 font-semibold text-on-gradient shadow-glow transition-all hover:shadow-glow-lg disabled:opacity-60"
                      >
                        Tenho interesse
                      </motion.button>
                    )}
                  </>
                ) : null}

                {/* Não é recusa comercial — não existe contratação para
                    recusar. Some só da fila deste prestador; no fluxo direto,
                    encerra a solicitação e avisa o cliente, como já fazia em
                    qualquer solicitação dirigida a uma pessoa só.

                    Quem já confirmou interesse não vê mais o botão: as duas
                    ações são a mesma decisão, e oferecê-las juntas depois de
                    tomada seria pedir que ela fosse tomada de novo. */}
                {!oportunidade.minhaProposta &&
                  !oportunidade.dispensada &&
                  !oportunidade.interesseEm && (
                  <button
                    type="button"
                    onClick={() => void dispensar(oportunidade.id)}
                    disabled={dispensando === oportunidade.id}
                    className="flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <X className="size-4" />
                    Não tenho interesse
                  </button>
                )}
                {/* O caminho comercial não existe no fluxo direto: sem este
                    botão não há proposta, e sem proposta não há acordo, nem
                    pagamento, nem Atendimento. O servidor recusa do mesmo
                    jeito — esconder nunca foi proteção. */}
                {!ehDeSimulacao(oportunidade.origem) &&
                  oportunidade.minhaProposta?.status !== 'aceita' && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelecionada(oportunidade)}
                    className="px-5 py-2.5 bg-gradient-gold text-on-gradient rounded-lg font-semibold shadow-glow hover:shadow-glow-lg transition-all"
                  >
                    {oportunidade.minhaProposta
                      ? 'Revisar proposta'
                      : 'Enviar proposta'}
                  </motion.button>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {selecionada && (
        <ModalEnviarProposta
          // Remontar por `key` evita que o formulário exiba os dados da
          // oportunidade aberta anteriormente.
          key={selecionada.id}
          oportunidade={selecionada}
          aberto
          onFechar={() => setSelecionada(null)}
          onEnviada={() => {
            startTransition(async () => {
              await buscar()
            })
          }}
        />
      )}
    </div>
  )
}
