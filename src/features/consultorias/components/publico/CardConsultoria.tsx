'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, Heart, Share2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buscarAgendaDoMes,
  buscarHorariosDaData,
} from '../../actions/agenda'
import {
  type EstadoDoCard,
  estadoInicial,
  horarioEscolhido as acharHorario,
  mesNavegavel,
  podeAgendar as podeAgendarEstado,
  podeNavegar,
  selecionarDia,
  selecionarHorario,
  trocarMes,
} from '../../lib/estado-do-card'
import { dataPorExtenso, formatarPreco } from '../../lib/formato'
import { mesDaData, montarGradeDoMes } from '../../lib/mes'
import type {
  AgendaDoMesDTO,
  HorarioDisponivelDTO,
  SelecaoDeConsultoria,
} from '../../types/consultoria'

/**
 * O card de consultoria do perfil público, agora com dados reais.
 *
 * ## O que mudou, e o que não mudou
 *
 * O layout é o mesmo que estava aprovado: as classes, a ordem dos blocos, a
 * legenda, a grade de sete colunas, o botão e o campo de cupom saíram do
 * componente antigo sem alteração. O que mudou é a origem do conteúdo — antes
 * `availabilityData` e `timeSlots`, dois objetos escritos à mão; agora a agenda
 * do Profissional, calculada no servidor.
 *
 * Os dias e os horários viraram `<button>` porque passaram a ser interativos:
 * um `<span>` clicável não recebe foco por teclado e não tem estado
 * desabilitado de verdade. As classes visuais são as mesmas.
 *
 * ## Nenhuma regra de agenda mora aqui
 *
 * Este componente não decide o que está disponível. Ele desenha a resposta do
 * servidor, que aplica duração, intervalo, exceções, antecedência e horizonte
 * em `lib/slots.ts`. Recalcular qualquer parte disso no navegador criaria uma
 * segunda verdade — e seria a versão que o Cliente conseguiria alterar.
 *
 * ## Escolher não reserva
 *
 * Selecionar dia e horário é estado de interface, e só. Nada é gravado, nada é
 * segurado: até a etapa da reserva temporária, outro Cliente pode contratar o
 * mesmo horário antes. Isso é conhecido e aceito — a trava correta é do
 * servidor, no momento do pagamento, e não de um bloqueio inventado aqui.
 */

const DIAS_DA_SEMANA_INICIAIS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** A casca do card. Idêntica nos dois estados, com e sem consultoria. */
function Moldura({
  nome,
  children,
}: {
  nome: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm">
      <div className="relative h-48">
        <img
          alt={nome}
          className="w-full h-full object-cover"
          src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop"
        />
        {/*
          Favoritar e compartilhar continuam decorativos, como já eram. Ligá-los
          é decisão de outra etapa; removê-los mudaria o card aprovado.
        */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button className="bg-white/90 dark:bg-card/90 p-2 rounded-full shadow-sm hover:bg-white dark:hover:bg-card transition-colors">
            <Heart className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="bg-white/90 dark:bg-card/90 p-2 rounded-full shadow-sm hover:bg-white dark:hover:bg-card transition-colors">
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export type CardConsultoriaProps = {
  /** Identidade pública do Profissional exibido. */
  nomeExibido: string
  /**
   * O primeiro mês, resolvido no servidor.
   *
   * Vem pronto para que o card nasça preenchido: buscar no navegador faria o
   * calendário piscar depois da página montada. `null` — ou sem consultoria
   * dentro — é o estado de ausência.
   */
  agendaInicial: AgendaDoMesDTO | null
  /**
   * Ponte para a etapa seguinte.
   *
   * O card avisa que existe uma escolha completa; quem abre o modal de
   * contratação é o perfil. Enquanto essa etapa não existe, a propriedade fica
   * ausente e o clique não produz efeito nenhum — nenhuma reserva, nenhum
   * pagamento, nenhum Atendimento.
   */
  onAgendar?: (selecao: SelecaoDeConsultoria) => void
}

export function CardConsultoria({
  nomeExibido,
  agendaInicial,
  onAgendar,
}: CardConsultoriaProps) {
  const [agenda, setAgenda] = useState<AgendaDoMesDTO | null>(agendaInicial)
  // Mês, dia e horário andam juntos: trocar um invalida os seguintes, e as
  // transições ficam em `lib/estado-do-card` para poderem ser testadas.
  const [estado, setEstado] = useState<EstadoDoCard>(() =>
    estadoInicial(agendaInicial?.mes ?? { ano: 1970, mes: 1 }),
  )
  const [navegando, iniciarNavegacao] = useTransition()

  const [horarios, setHorarios] = useState<HorarioDisponivelDTO[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [erroHorarios, setErroHorarios] = useState(false)

  /**
   * Descarta resposta atrasada.
   *
   * Clicar rápido em dois dias dispara duas buscas, e a primeira pode chegar
   * depois da segunda. Sem este contador, o dia 27 acabaria mostrando os
   * horários do dia 25.
   */
  const buscaAtual = useRef(0)

  const consultoria = agenda?.consultoria ?? null

  const carregarHorarios = useCallback(
    async (prestadorId: string, data: string) => {
      const busca = buscaAtual.current + 1
      buscaAtual.current = busca
      setCarregandoHorarios(true)
      setErroHorarios(false)
      try {
        const resposta = await buscarHorariosDaData({ prestadorId, data })
        if (buscaAtual.current !== busca) return
        setHorarios(resposta.horarios)
      } catch {
        if (buscaAtual.current !== busca) return
        // Lista antiga some junto com o erro: mostrar horários de antes como se
        // ainda valessem é pior do que não mostrar nada.
        setHorarios([])
        setErroHorarios(true)
      } finally {
        if (buscaAtual.current === busca) setCarregandoHorarios(false)
      }
    },
    [],
  )

  if (!consultoria || !agenda?.hoje || !agenda.ultimoDia) {
    return (
      <Moldura nome={nomeExibido}>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">
            Consultoria indisponível no momento.
          </p>
        </div>
      </Moldura>
    )
  }

  const dataSelecionada = estado.data
  const horarioSelecionado = estado.horario
  const grade = montarGradeDoMes(estado.mes)
  const disponiveis = new Map(agenda.dias.map((dia) => [dia.data, dia.totalSlots]))
  const limites = {
    minimo: mesDaData(agenda.hoje),
    maximo: mesDaData(agenda.ultimoDia),
  }
  const podeVoltar = podeNavegar(estado.mes, -1, limites)
  const podeAvancar = podeNavegar(estado.mes, 1, limites)

  function irParaMes(passos: number) {
    const destino = mesNavegavel(estado.mes, passos, limites)
    if (!destino) return

    setEstado((atual) => trocarMes(atual, destino))
    setHorarios([])
    setErroHorarios(false)
    // Uma resposta de horários em voo não pode pintar a lista do mês novo.
    buscaAtual.current += 1

    iniciarNavegacao(async () => {
      const resposta = await buscarAgendaDoMes({
        prestadorId: consultoria!.prestadorId,
        ano: destino.ano,
        mes: destino.mes,
      })
      setAgenda(resposta)
    })
  }

  function escolherDia(data: string) {
    const disponivel = disponiveis.has(data)
    if (!disponivel) return
    setEstado((atual) => selecionarDia(atual, data, disponivel))
    setHorarios([])
    void carregarHorarios(consultoria!.prestadorId, data)
  }

  const horarioEscolhido = acharHorario(estado, horarios)
  const podeAgendar = podeAgendarEstado(estado, horarios)

  function confirmar() {
    if (!dataSelecionada || !horarioEscolhido || !consultoria) return
    // Só avisa. Reserva, pagamento e Atendimento são das etapas seguintes.
    onAgendar?.({
      prestadorId: consultoria.prestadorId,
      consultoriaId: consultoria.id,
      titulo: consultoria.titulo,
      data: dataSelecionada,
      inicio: horarioEscolhido.inicio,
      fim: horarioEscolhido.fim,
      inicioEm: horarioEscolhido.inicioEm,
      fimEm: horarioEscolhido.fimEm,
      timezone: consultoria.timezone,
      duracaoMinutos: consultoria.duracaoMinutos,
      valorCentavos: consultoria.valorCentavos,
      modalidade: consultoria.modalidade,
    })
  }

  return (
    <Moldura nome={nomeExibido}>
      <div className="p-6">
        <div className="flex items-baseline gap-1 mb-6">
          <span className="text-3xl font-bold text-foreground">
            {formatarPreco(consultoria.valorCentavos)}
          </span>
          {/*
            Antes dizia "/ hora". A duração é configurável por Profissional, e
            uma consultoria de 45 minutos anunciada por hora seria preço errado.
          */}
          <span className="text-muted-foreground text-sm">
            · {consultoria.duracaoMinutos} min
          </span>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h5 className="text-lg font-semibold text-foreground">{grade.rotulo}</h5>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => irParaMes(-1)}
                disabled={!podeVoltar || navegando}
                aria-label="Mês anterior"
                className={cn(
                  'transition-colors',
                  podeVoltar && !navegando
                    ? 'text-foreground hover:text-primary'
                    : 'text-muted-foreground/50 cursor-not-allowed',
                )}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => irParaMes(1)}
                disabled={!podeAvancar || navegando}
                aria-label="Próximo mês"
                className={cn(
                  'transition-colors',
                  podeAvancar && !navegando
                    ? 'text-foreground hover:text-primary'
                    : 'text-muted-foreground/50 cursor-not-allowed',
                )}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            aria-busy={navegando}
            className={cn(
              'grid grid-cols-7 gap-1 text-center text-xs font-bold mb-4 transition-opacity',
              // Feedback discreto: a grade continua no lugar e com a mesma
              // altura durante a troca de mês — nada desmonta, nada salta.
              navegando && 'opacity-50',
            )}
          >
            {/*
              A chave é a posição, e não a letra: as iniciais dos dias
              em português repetem (D S T Q Q S S) e duas colunas com a
              mesma chave fazem o React descartar uma delas.
            */}
            {DIAS_DA_SEMANA_INICIAIS.map((inicial, indice) => (
              <span key={indice} className="opacity-50 text-muted-foreground">
                {inicial}
              </span>
            ))}
            {Array.from({ length: grade.vazias }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {grade.dias.map((data) => {
              const total = disponiveis.get(data) ?? 0
              const disponivel = total > 0
              const selecionado = data === dataSelecionada
              return (
                <button
                  key={data}
                  type="button"
                  disabled={!disponivel}
                  aria-pressed={selecionado}
                  // O estado não viaja só pela cor: quem usa leitor de tela
                  // ouve a data e a situação dela.
                  aria-label={`${dataPorExtenso(data)} — ${
                    disponivel
                      ? `${total} ${total === 1 ? 'horário disponível' : 'horários disponíveis'}`
                      : 'indisponível'
                  }`}
                  onClick={() => escolherDia(data)}
                  className={cn(
                    'py-2 rounded-lg text-xs font-bold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    disponivel && !selecionado &&
                      'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20',
                    !disponivel && 'bg-red-500/10 text-red-500 cursor-not-allowed',
                    selecionado && 'bg-primary text-primary-foreground',
                  )}
                >
                  {Number(data.slice(8))}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase text-muted-foreground/70">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Disponível
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" /> Selecionado
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Indisponível
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg mb-6">
          <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="text-sm font-semibold text-foreground">Responde em até 2h úteis</span>
        </div>

        <div className="mb-6">
          <h6 className="text-xs font-bold text-muted-foreground uppercase mb-3">
            Horários disponíveis
          </h6>
          {!dataSelecionada ? (
            <p className="text-sm text-muted-foreground">
              Escolha um dia disponível para ver os horários.
            </p>
          ) : carregandoHorarios ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Carregando horários…
            </p>
          ) : erroHorarios ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground" role="status">
                Não foi possível carregar os horários.
              </p>
              <button
                type="button"
                onClick={() =>
                  void carregarHorarios(consultoria.prestadorId, dataSelecionada)
                }
                className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors text-sm"
              >
                Tentar novamente
              </button>
            </div>
          ) : !horarios.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum horário disponível neste dia.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {horarios.map((horario) => {
                const selecionado = horario.inicio === horarioSelecionado
                return (
                  <button
                    key={horario.inicio}
                    type="button"
                    aria-pressed={selecionado}
                    aria-label={`${horario.inicio} às ${horario.fim}`}
                    onClick={() =>
                      setEstado((atual) => selecionarHorario(atual, horario.inicio))
                    }
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-bold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selecionado
                        ? 'border-2 border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border border-border text-foreground hover:border-primary hover:text-primary',
                    )}
                  >
                    {horario.inicio}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={confirmar}
          disabled={!podeAgendar}
          className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold mb-4 active:scale-95 transition-all shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary disabled:active:scale-100"
        >
          Agendar consultoria
        </button>

        <div className="space-y-4">
          {/*
            Cupom segue decorativo. A decisão sobre desconto é de outra etapa, e
            remover o campo mudaria o card aprovado.
          */}
          <p className="text-xs font-bold text-muted-foreground">Tem um cupom?</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {/*
              `min-w-0` no campo.

              Um item de flex não encolhe abaixo do próprio `min-content`, e a
              largura intrínseca de um `<input>` é generosa: na largura de
              tablet o campo empurrava o botão "Aplicar" para fora do cartão,
              que tem `overflow-hidden` e o escondia sem produzir rolagem — um
              botão inalcançável e invisível ao mesmo tempo. `flex-1` sozinho
              não resolve; é o `min-w-0` que devolve a decisão ao contêiner.
            */}
            <input
              className="min-w-0 flex-1 bg-muted/30 border border-border rounded-lg text-sm font-bold text-center text-foreground focus:ring-2 focus:ring-primary/20 focus:outline-none px-3 py-2"
              type="text"
              defaultValue=""
            />
            <button className="bg-primary/10 text-primary px-4 py-2 rounded-lg font-bold hover:bg-primary/20 transition-colors">
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </Moldura>
  )
}
