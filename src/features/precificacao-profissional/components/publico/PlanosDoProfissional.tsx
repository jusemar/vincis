'use client'

import {
  ROTULO_MODELO_CONTRATACAO,
  type ModeloContratacao,
} from '@/features/profissionais/constants/modelo-contratacao'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { BotaoDeInteresse } from './BotaoDeInteresse'
import { CartaoDoPreco } from './CartaoDoPreco'
import { ConfiguradorDaEmpresa } from './ConfiguradorDaEmpresa'

/**
 * Os planos e preços de um Profissional, como o cliente os vê.
 *
 * A tabela chega pronta do servidor e vive aqui como propriedade — o mesmo
 * desenho de `/precos`. O motor é puro e roda no navegador sobre ela: cada
 * clique no configurador recalcula na hora, sem uma ida ao servidor por
 * resposta.
 *
 * O componente não sabe se está numa página pública ou dentro da prévia do
 * painel. É de propósito: a prévia precisa mostrar **exatamente** o que o
 * cliente veria, e a única forma de garantir isso é ser a mesma tela.
 */
export function PlanosDoProfissional({
  tabela,
  nome,
  responsavel = null,
  primeiroNome,
  prestadorId,
  autenticado = false,
  voltarPara,
  demonstracao = false,
  modeloContratacao = null,
}: {
  tabela: TabelaPrecificacao
  nome: string
  /** Pessoa responsável quando `nome` é um escritório. */
  responsavel?: string | null
  primeiroNome: string
  /**
   * De quem é esta tabela. Ausente na prévia do painel, que não cria nada.
   *
   * É chave de consulta, não autorização: quem decide se este Profissional
   * existe, publicou e pode receber solicitação é o servidor, na action.
   */
  prestadorId?: string
  /** Há sessão? Vem do servidor — o navegador não opina sobre isso. */
  autenticado?: boolean
  /** Link de volta ao perfil. Ausente na prévia do painel. */
  voltarPara?: string
  /** Prévia do painel: sem ação de contratar e com aviso de demonstração. */
  demonstracao?: boolean
  /** Contábil: modelo comercial publicado (nulo = não definido). */
  modeloContratacao?: ModeloContratacao | null
}) {
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(() =>
    respostasIniciais(tabela),
  )
  /**
   * Contador "Contratação pela Vincis": a contabilidade mensal é contratada em
   * /precos, pela tabela central da Vincis, escolhendo o contador. A tabela
   * desta página é referência — não abre contratação nem proposta recorrente
   * (proposta recorrente é exclusiva do Autônomo). Por isso, nesse modelo, a
   * página fala em "referência" e aponta para os planos da Vincis.
   */
  const referenciaVincis = modeloContratacao === 'vincis' && !demonstracao
  const quemEscolher = responsavel ? `${responsavel} (${nome})` : nome

  return (
    <main className={demonstracao ? '' : 'min-h-screen bg-background'}>
      {demonstracao ? null : (
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-12 sm:pt-20">
            {voltarPara ? (
              <Link
                href={voltarPara}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Voltar ao perfil de {primeiroNome}
              </Link>
            ) : null}
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
              Planos e preços
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl leading-[1.1] font-bold text-foreground sm:text-5xl">
              {referenciaVincis
                ? `Valores de referência de ${primeiroNome}`
                : `Quanto ${primeiroNome} cobra para cuidar da sua contabilidade`}
            </h1>
            {responsavel ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Responsável técnico: <span className="font-semibold text-foreground">{responsavel}</span>
              </p>
            ) : null}
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {referenciaVincis ? (
                <>
                  Simule o valor mensal que {nome} usa como referência para o
                  perfil da sua empresa. A contratação mensal pela Vincis é feita
                  nos planos da Vincis, com o preço da tabela da Vincis — lá você
                  pode escolher {quemEscolher} como contador responsável.
                </>
              ) : (
                <>
                  Responda sobre a empresa e o valor mensal aparece na hora. Os
                  preços são definidos por {nome} — não são a tabela da Vincis.
                </>
              )}
            </p>
          </div>
        </section>
      )}

      <section
        className={
          demonstracao ? '' : 'mx-auto max-w-6xl px-5 py-10'
        }
      >
        {/*
          Na prévia o valor vem primeiro.

          O conteúdo é o mesmo da página pública — mesmo configurador, mesmo
          card, mesmo motor. O que muda é a ordem de empilhamento: a prévia vive
          numa coluna estreita ao lado dos campos, e com o card embaixo do
          formulário inteiro o preço ficaria fora da tela justamente enquanto o
          Profissional digita o preço. Ali a pergunta é "quanto ficou?", e a
          resposta precisa estar à vista.
        */}
        <div
          className={
            demonstracao
              ? 'flex min-w-0 flex-col-reverse gap-4'
              : 'grid min-w-0 gap-6 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start'
          }
        >
          <div className="min-w-0">
            <ConfiguradorDaEmpresa
              tabela={tabela}
              respostas={respostas}
              onChange={setRespostas}
              compacto={demonstracao}
            />
          </div>

          <div className="min-w-0">
            <CartaoDoPreco
              tabela={tabela}
              respostas={respostas}
              primeiroNome={primeiroNome}
              rodape={
                /*
                  Demonstrar interesse é ato de quem está numa página pública
                  olhando o preço de outra pessoa. Na prévia do painel o
                  Profissional está vendo a **própria** tabela — não há a quem
                  se dirigir, e o botão seria uma armadilha.
                */
                demonstracao || !prestadorId ? null : referenciaVincis ? (
                  <Link
                    href="/precos"
                    className="flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Contratar pelos planos da Vincis
                  </Link>
                ) : (
                  <BotaoDeInteresse
                    prestadorId={prestadorId}
                    primeiroNome={primeiroNome}
                    respostas={respostas}
                    autenticado={autenticado}
                    onRestaurar={setRespostas}
                  />
                )
              }
            />

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {referenciaVincis
                ? 'Valor de referência calculado com base nas informações fornecidas. O valor contratado é o do plano escolhido nos planos da Vincis.'
                : null}
              {referenciaVincis ? null : <>Preço calculado com base nas informações fornecidas.{' '}</>}
              {referenciaVincis ? null : demonstracao || !prestadorId
                ? `A proposta final é confirmada por ${primeiroNome} após a análise dos documentos da empresa.`
                : 'Demonstrar interesse não é contratação: o contato e a negociação são realizados diretamente com o profissional.'}
            </p>
            {/* Autônomo: a contabilidade recorrente é paga a ele, nunca à Vincis. */}
            {modeloContratacao === 'autonomo' ? (
              <p className="mt-2 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{ROTULO_MODELO_CONTRATACAO.autonomo.selo}:</span>{' '}
                {ROTULO_MODELO_CONTRATACAO.autonomo.descricao} A contabilidade mensal não é contratada nem paga pela
                Vincis — converse com {primeiroNome} para combinar.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
