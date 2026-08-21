import Link from 'next/link'
import { ChevronDown, CreditCard, Headphones, Paperclip, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rotuloDaCategoria } from '@/features/oportunidades/constants/oportunidade'
import {
  ROTULO_ETAPA_COMERCIAL,
  type EtapaComercial,
} from '@/features/pagamentos/lib/etapa-comercial'
import { PropostaRecebida } from '@/features/oportunidades/components/cliente/PropostaRecebida'
import type { OportunidadeDoClienteDTO } from '@/features/oportunidades/types/oportunidade'
import { formatarDataCurta, formatarDataHora } from '../../lib/painel-do-cliente'
import {
  CabecalhoSecao,
  Dado,
  PainelVazio,
  Pilula,
  Superficie,
  type Tom,
} from '../ui/primitivos'

/** Filtros oferecidos. Poucos, e todos derivados de dado real. */
const FILTROS = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'abertas', rotulo: 'Abertas' },
  { id: 'negociacao', rotulo: 'Em negociação' },
  { id: 'encerradas', rotulo: 'Encerradas' },
] as const

export type FiltroSolicitacoes = (typeof FILTROS)[number]['id']

/** Só aparece a barra de filtros quando ela resolve algum problema real. */
const MINIMO_PARA_FILTRAR = 3

/**
 * A pílula conta a **etapa comercial**, não o status cru.
 *
 * "Encerrada" era a única coisa que o Cliente lia depois de fechar acordo — e
 * encerrada é exatamente o que a solicitação não está do ponto de vista dele:
 * falta pagar, e depois o atendimento começa. A coluna `status` continua sendo
 * sobre distribuição; a leitura de quem pediu o orçamento é esta.
 */
function tomDaEtapa(etapa: EtapaComercial): Tom {
  if (etapa === 'aberta') return 'destaque'
  if (etapa === 'aguardando_pagamento') return 'atencao'
  if (etapa === 'pago' || etapa === 'em_atendimento') return 'sucesso'
  return 'neutro'
}

function emNegociacao(oportunidade: OportunidadeDoClienteDTO) {
  return oportunidade.propostas.some(
    (proposta) =>
      proposta.contrapropostaPendente !== null ||
      proposta.historicoContrapropostas.length > 0,
  )
}

function aplicarFiltro(
  oportunidades: OportunidadeDoClienteDTO[],
  filtro: FiltroSolicitacoes,
) {
  if (filtro === 'abertas') return oportunidades.filter((item) => item.ativa)
  if (filtro === 'encerradas') return oportunidades.filter((item) => !item.ativa)
  if (filtro === 'negociacao') return oportunidades.filter(emNegociacao)
  return oportunidades
}

function valorEmReais(centavos: number | null) {
  if (centavos == null) return null
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * Solicitações de orçamento do Cliente.
 *
 * Componente de **servidor**. A lista inteira — inclusive as propostas — é
 * renderizada no servidor; o que abre e fecha é um `<details>` nativo, que já
 * vem com acessibilidade e teclado sem custar JavaScript. Só as ações
 * (aceitar, contrapropor) atravessam para o navegador, dentro de
 * `PropostaRecebida`.
 *
 * Criar solicitação continua sendo ato da área pública: aqui se **gerencia** o
 * que já foi enviado, e o botão leva para `/profissionais` em vez de duplicar o
 * formulário.
 */
export function SolicitacoesCliente({
  oportunidades,
  filtro = 'todas',
}: {
  oportunidades: OportunidadeDoClienteDTO[]
  filtro?: FiltroSolicitacoes
}) {
  const visiveis = aplicarFiltro(oportunidades, filtro)
  const mostrarFiltros = oportunidades.length >= MINIMO_PARA_FILTRAR

  return (
    <div className="space-y-6">
      <CabecalhoSecao
        contexto="Orçamentos"
        titulo="Solicitações de orçamento"
        descricao="Acompanhe as respostas dos profissionais, negocie valores e feche o acordo."
        acoes={
          <Button asChild size="sm">
            <Link href="/profissionais">
              <Plus className="size-4" />
              Nova solicitação
            </Link>
          </Button>
        }
      />

      {mostrarFiltros ? (
        <nav
          aria-label="Filtrar solicitações"
          className="flex flex-wrap gap-1 border-b pb-1"
        >
          {FILTROS.map((opcao) => {
            const ativo = opcao.id === filtro
            return (
              <Link
                key={opcao.id}
                href={`/cliente?aba=orcamentos&filtro=${opcao.id}`}
                aria-current={ativo ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  ativo
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opcao.rotulo}
              </Link>
            )
          })}
        </nav>
      ) : null}

      {visiveis.length === 0 ? (
        <PainelVazio
          titulo={
            oportunidades.length
              ? 'Nenhuma solicitação neste filtro'
              : 'Você ainda não solicitou orçamentos'
          }
          descricao={
            oportunidades.length
              ? 'Troque o filtro para ver as demais solicitações.'
              : 'Descreva o que você precisa e receba propostas de profissionais da categoria adequada.'
          }
          acao={
            oportunidades.length ? undefined : (
              <Button asChild size="sm">
                <Link href="/profissionais">Solicitar orçamento</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {visiveis.map((oportunidade) => {
            const pendencia = oportunidade.propostas.find(
              (proposta) => proposta.contrapropostaPendente,
            )
            const acordo = oportunidade.propostas.find(
              (proposta) => proposta.status === 'aceita',
            )
            return (
              <Superficie key={oportunidade.id} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pilula
                      rotulo={ROTULO_ETAPA_COMERCIAL[oportunidade.etapa]}
                      tom={tomDaEtapa(oportunidade.etapa)}
                    />
                    {/* Uma pílula de negociação só faz sentido enquanto ela
                        existe: fechado o acordo, a etapa já conta a história. */}
                    {pendencia && !acordo ? (
                      <Pilula rotulo="Contraproposta enviada" tom="atencao" />
                    ) : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatarDataCurta(oportunidade.criadoEm)}
                    </span>
                  </div>

                  <h2 className="mt-3 text-base font-semibold leading-snug">
                    {oportunidade.titulo}
                  </h2>
                  {/* O título é um resumo da própria descrição: quando a
                      descrição é curta, os dois textos são o mesmo e repeti-los
                      só rouba espaço. */}
                  {oportunidade.descricao.trim() !==
                  oportunidade.titulo.trim() ? (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {oportunidade.descricao}
                    </p>
                  ) : null}

                  {oportunidade.especialidades.length > 0 ? (
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
                  ) : null}

                  <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Dado
                      rotulo="Categoria"
                      valor={rotuloDaCategoria(oportunidade.categoria)}
                    />
                    <Dado rotulo="Abrangência" valor={oportunidade.abrangencia} />
                    <Dado
                      rotulo="Investimento"
                      valor={
                        valorEmReais(oportunidade.valorPretendidoCentavos) ??
                        'Não informado'
                      }
                    />
                    {/* Solicitações anteriores ao prazo global não têm
                        vencimento; em vez de um traço vazio, mostram quando
                        foram publicadas. */}
                    <Dado
                      rotulo={
                        oportunidade.expiraEm
                          ? oportunidade.ativa
                            ? 'Aberta até'
                            : 'Encerrada em'
                          : 'Publicada em'
                      }
                      valor={formatarDataHora(
                        oportunidade.expiraEm ?? oportunidade.criadoEm,
                      )}
                    />
                  </dl>

                  {oportunidade.anexos.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {oportunidade.anexos.map((anexo) => (
                        <li key={anexo.id}>
                          <a
                            href={anexo.url}
                            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
                          >
                            <Paperclip className="size-3 text-muted-foreground" />
                            <span className="max-w-44 truncate">{anexo.nome}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
                  <p className="text-sm">
                    <span className="font-semibold">
                      {oportunidade.totalPropostas}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {oportunidade.totalPropostas === 1 ? 'proposta' : 'propostas'}
                    </span>
                    {oportunidade.totalSemInteresse > 0 ? (
                      <span className="text-muted-foreground">
                        {' · '}
                        {oportunidade.totalSemInteresse}{' '}
                        {oportunidade.totalSemInteresse === 1
                          ? 'não interessado'
                          : 'não interessados'}
                      </span>
                    ) : null}
                  </p>

                  {/* A ação que falta, no lugar onde a decisão termina. */}
                  {acordo && !oportunidade.pagamento ? (
                    <Button asChild size="sm">
                      <Link href={`/cliente?aba=orcamentos&pagar=${oportunidade.id}`}>
                        <CreditCard className="size-4" />
                        Pagar
                      </Link>
                    </Button>
                  ) : null}
                  {oportunidade.atendimento ? (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/cliente?aba=atendimentos&atendimento=${oportunidade.atendimento.id}`}
                      >
                        <Headphones className="size-4" />
                        {oportunidade.atendimento.protocolo}
                      </Link>
                    </Button>
                  ) : null}
                </div>

                {oportunidade.totalPropostas > 0 ? (
                  // `<details>` nativo: abre e fecha sem JavaScript, com foco e
                  // teclado corretos por padrão.
                  <details className="group border-t">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-muted/30">
                      Ver propostas recebidas
                      <ChevronDown
                        className="size-4 transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <ul className="divide-y border-t">
                      {oportunidade.propostas.map((proposta) => (
                        <PropostaRecebida
                          key={proposta.id}
                          proposta={proposta}
                          oportunidadeAtiva={oportunidade.ativa}
                          oportunidadeId={oportunidade.id}
                          pago={oportunidade.pagamento !== null}
                        />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Superficie>
            )
          })}
        </div>
      )}
    </div>
  )
}
