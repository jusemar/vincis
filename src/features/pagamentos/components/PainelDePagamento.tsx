import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Handshake,
  Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rotuloDaCategoria } from '@/features/oportunidades/constants/oportunidade'
import type { OportunidadeDoClienteDTO } from '@/features/oportunidades/types/oportunidade'
import {
  CabecalhoSecao,
  Dado,
  PainelVazio,
  Pilula,
  Superficie,
  Trilha,
} from '@/features/portal-cliente/components/ui/primitivos'
import { ROTULO_PAGAMENTO_SIMULADO } from '../constants/pagamento'
import {
  TRILHA_APOS_ACORDO,
  posicaoNaTrilha,
} from '../lib/etapa-comercial'
import { honorariosDiretos } from '@/features/profissionais/constants/honorarios'
import { AbrirAtendimentoJuridico } from './AbrirAtendimentoJuridico'
import { PagamentoPixDoAcordo } from './PagamentoPixDoAcordo'

function reais(centavos: number | null | undefined) {
  if (centavos == null) return 'A combinar'
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function dataHora(iso: string | null) {
  if (!iso) return '—'
  const data = new Date(iso)
  return `${new Intl.DateTimeFormat('pt-BR').format(data)} às ${new Intl.DateTimeFormat(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' },
  ).format(data)}`
}

/**
 * O acordo fechado e o que falta para ele virar Atendimento.
 *
 * Uma tela só para as três etapas — proposta aceita, pagamento, Atendimento —
 * em vez de uma sequência de modais. A trilha no topo diz onde o Cliente está;
 * abaixo dela ficam **as informações da proposta**, que continuam visíveis
 * depois do acordo de propósito: esconder quem foi escolhido, por quanto e em
 * que prazo bem na hora de pagar é a forma mais rápida de perder a confiança de
 * quem está prestes a pagar.
 *
 * Componente de servidor. Só o botão e o campo de valor atravessam para o
 * navegador.
 */
export function PainelDePagamento({
  oportunidade,
}: {
  oportunidade: OportunidadeDoClienteDTO
}) {
  const acordo = oportunidade.propostas.find(
    (proposta) => proposta.status === 'aceita',
  )

  if (!acordo) {
    return (
      <div className="space-y-6">
        <CabecalhoSecao
          contexto="Orçamentos"
          titulo="Nada a pagar por aqui"
          descricao="Esta solicitação ainda não tem um acordo fechado."
          acoes={<VoltarParaOrcamentos />}
        />
        <PainelVazio
          titulo="Sem acordo fechado"
          descricao="Aceite uma proposta ou aguarde a resposta do profissional à sua contraproposta para seguir com o pagamento."
        />
      </div>
    )
  }

  const pago = oportunidade.pagamento !== null
  /*
    Advogado: honorários combinados diretamente entre Cliente e profissional.
    Esta tela não tem etapa financeira para ele — sem trilha de pagamento, sem
    Pix, sem "aguardando"/"aprovado". O acordo só registra que os dois
    concordaram com a proposta; o atendimento é o lugar da conversa.
  */
  const juridico = honorariosDiretos(acordo.prestadorTipoProfissional)
  // Recorrente do contador Autônomo: pagamento direto, sem etapa financeira aqui.
  const recorrente = acordo.natureza === 'recorrente'
  const direto = juridico || recorrente
  const posicao = posicaoNaTrilha(oportunidade.etapa)
  const valorAcordado = acordo.valorAcordadoCentavos ?? acordo.valorCentavos

  return (
    <div className="space-y-8">
      <CabecalhoSecao
        contexto="Acordo fechado"
        titulo={oportunidade.titulo}
        descricao={
          juridico
            ? 'Você e o profissional concordaram com a proposta. Os honorários são combinados diretamente entre vocês.'
            : recorrente
              ? 'Você e o contador fecharam uma relação contábil recorrente. O pagamento é combinado diretamente entre vocês.'
              : pago
              ? 'Pagamento aprovado. O atendimento já está aberto e o profissional foi avisado.'
              : 'Vocês chegaram a um acordo. Conclua o pagamento para abrir o atendimento.'
        }
        acoes={<VoltarParaOrcamentos />}
      />

      {direto ? null : <Trilha passos={TRILHA_APOS_ACORDO} atual={posicao} />}

      <Superficie className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
          <div className="flex min-w-0 items-center gap-3">
            {acordo.perfilPublico.avatarUrl ? (
              <img
                src={acordo.perfilPublico.avatarUrl}
                alt=""
                className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {acordo.perfilPublico.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {acordo.perfilPublico.nome}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {acordo.perfilPublico.destaque ??
                  rotuloDaCategoria(oportunidade.categoria)}
                {acordo.prestadorCidade
                  ? ` · ${acordo.prestadorCidade}/${acordo.prestadorEstado}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pilula
              rotulo={direto ? 'Acordo fechado' : pago ? 'Pagamento aprovado' : 'Aguardando pagamento'}
              tom={direto || pago ? 'sucesso' : 'atencao'}
            />
            <Button asChild variant="outline" size="sm">
              <Link href={acordo.perfilPublico.perfilUrl}>
                <ExternalLink className="size-3.5" />
                Ver perfil
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Mensagem da proposta
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {acordo.mensagem}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dado
              rotulo="Valor acordado"
              valor={
                <span className="text-base font-semibold text-primary">
                  {reais(valorAcordado)}
                </span>
              }
            />
            <Dado
              rotulo="Prazo de execução"
              valor={
                acordo.prazoEstimadoDias != null
                  ? `${acordo.prazoEstimadoDias} dias`
                  : 'A combinar'
              }
            />
            <Dado rotulo="Acordo fechado em" valor={dataHora(acordo.aceitaEm)} />
            <Dado
              rotulo="Categoria"
              valor={rotuloDaCategoria(oportunidade.categoria)}
            />
          </dl>

          {acordo.historicoContrapropostas.length > 0 ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                Como se chegou a este valor
              </p>
              <ol className="mt-2 space-y-1.5 text-xs">
                <li className="flex flex-wrap gap-x-2">
                  <span className="font-medium">
                    Proposta original de {reais(acordo.valorCentavos)}
                  </span>
                  <span className="text-muted-foreground">
                    · {dataHora(acordo.criadoEm)}
                  </span>
                </li>
                {acordo.historicoContrapropostas.map((rodada) => (
                  <li key={rodada.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">
                      Você propôs {reais(rodada.valorCentavos)}
                    </span>
                    <span className="text-muted-foreground">
                      · {rodada.status === 'aceita' ? 'aceita' : 'recusada'} em{' '}
                      {dataHora(rodada.respondidaEm)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </Superficie>

      {direto ? (
        <Superficie className="p-5">
          <h2 className="text-sm font-semibold">
            {juridico ? 'Honorários combinados diretamente' : 'Pagamento combinado diretamente'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {juridico
              ? 'A forma de pagamento dos honorários é combinada entre você e o profissional — pela conversa do atendimento ou como preferirem. A Vincis não processa nem acompanha esse pagamento.'
              : 'Os valores e a forma de pagamento da relação recorrente são combinados entre você e o contador. A Vincis não emite Pix, não cobra e não acompanha esse pagamento.'}
          </p>
          <div className="mt-4">
            {oportunidade.atendimento ? (
              <Button asChild size="sm">
                <Link href={`/cliente/atendimentos?atendimento=${oportunidade.atendimento.id}`}>
                  Abrir atendimento
                </Link>
              </Button>
            ) : juridico ? (
              <AbrirAtendimentoJuridico oportunidadeId={oportunidade.id} />
            ) : null}
          </div>
        </Superficie>
      ) : pago ? (
        <ComprovanteSimulado oportunidade={oportunidade} />
      ) : (
        <Superficie className="p-5">
          <PagamentoPixDoAcordo oportunidadeId={oportunidade.id} />
        </Superficie>
      )}
    </div>
  )
}

function VoltarParaOrcamentos() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/cliente/orcamentos">
        <ArrowLeft className="size-4" />
        Voltar
      </Link>
    </Button>
  )
}

function ComprovanteSimulado({
  oportunidade,
}: {
  oportunidade: OportunidadeDoClienteDTO
}) {
  const pagamento = oportunidade.pagamento
  if (!pagamento) return null

  return (
    <Superficie className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-success" aria-hidden />
          <h2 className="text-sm font-semibold">Comprovante</h2>
        </div>
        {pagamento.origem === 'simulado' ? (
          <Pilula rotulo={ROTULO_PAGAMENTO_SIMULADO} tom="atencao" />
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Dado rotulo="Valor pago" valor={reais(pagamento.valorCentavos)} />
        <Dado rotulo="Aprovado em" valor={dataHora(pagamento.aprovadoEm)} />
        <Dado
          rotulo="Referência"
          valor={<span className="font-mono text-xs">{pagamento.referencia}</span>}
        />
        <Dado
          rotulo="Atendimento"
          valor={oportunidade.atendimento?.protocolo ?? 'Em abertura'}
        />
      </dl>

      {oportunidade.atendimento ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
          <Handshake className="size-4 text-success" aria-hidden />
          <p className="text-sm text-muted-foreground">
            O atendimento {oportunidade.atendimento.protocolo} já está aberto com
            o profissional escolhido.
          </p>
          <Button asChild size="sm" className="ml-auto">
            <Link
              href={`/cliente/atendimentos?atendimento=${oportunidade.atendimento.id}`}
            >
              Abrir atendimento
            </Link>
          </Button>
        </div>
      ) : null}
    </Superficie>
  )
}
