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
import { responderContraproposta } from '../../actions/negociacao'
import {
  carregarOportunidadesDisponiveis,
  marcarSemInteresse,
} from '../../actions/propostas'
import { rotuloDaCategoria } from '../../constants/oportunidade'
import type { OportunidadeParaPrestadorDTO } from '../../types/oportunidade'
import { ListaDeAnexos } from '../compartilhado/ListaDeAnexos'
import { formatarDataHora, formatarValor } from '../compartilhado/formato'
import { ModalEnviarProposta } from './ModalEnviarProposta'

function formatarData(iso: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso))
}

/**
 * Oportunidades públicas disponíveis para o prestador.
 *
 * Área própria, e de propósito fora do quadro de Atendimentos: oportunidade é
 * a etapa **anterior** à contratação e misturá-la ao Kanban faria trabalho não
 * contratado ocupar a mesma fila do trabalho em execução.
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
            Clientes que procuram profissionais da sua categoria. Envie sua
            proposta para participar.
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
            Assim que um cliente solicitar orçamento na sua categoria, ele
            aparece aqui e no seu sino de notificações.
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
                <span className="badge-info rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
                  {rotuloDaCategoria(oportunidade.categoria)}
                </span>
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

              <p className="mt-3 line-clamp-3 text-sm">
                {oportunidade.descricao}
              </p>

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

              {/* Referência informada pelo Cliente — não é teto nem preço. */}
              <p className="mt-3 text-xs text-muted-foreground">
                Quanto o Cliente pretende investir:{' '}
                <b className="text-foreground">
                  {formatarValor(oportunidade.valorPretendidoCentavos)}
                </b>
              </p>

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

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                {/* Não é recusa comercial — não existe contratação para
                    recusar. Some só da fila deste prestador. */}
                {!oportunidade.minhaProposta && !oportunidade.dispensada && (
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
                {oportunidade.minhaProposta?.status !== 'aceita' && (
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
