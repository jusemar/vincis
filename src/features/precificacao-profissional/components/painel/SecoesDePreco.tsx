'use client'

import { cn } from '@/lib/utils'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import {
  Campo,
  CampoNumero,
  Painel,
} from '@/features/precificacao/components/gestao/primitivas'
import {
  DIMENSOES_COM_ACRESCIMO_FIXO,
  ROTULO_DA_SECAO,
  TIPOS_DE_COBRANCA,
  type SecaoDoProfissional,
  type TipoDeCobranca,
} from '../../constants/precificacao-profissional'
import {
  chaveDaFaixa,
  chaveDoFator,
  dimensoesComFator,
  faixasDaGrade,
  opcoesComFator,
  regimesDaGrade,
} from '../../lib/grade'
import type {
  AcrescimoDoRascunho,
  RascunhoDoProfissional,
} from '../../lib/rascunho'

/**
 * Os campos que o Profissional preenche — sete blocos, e nenhum a mais.
 *
 * ## Muito menor que a tela do Gestor, de propósito
 *
 * A Precificação da Vincis tem oito áreas de navegação, edita dois grupos de
 * preço, quatro serviços, adicionais, descontos de prazo e o desconto do
 * pacote. Nada disso existe aqui: o Profissional responde "quanto custa a
 * contabilidade mensal" para os perfis de empresa que a plataforma pergunta, e
 * é só isso. Sete blocos numa coluna rolável, sem menu lateral próprio.
 *
 * ## As primitivas são as mesmas
 *
 * `Painel`, `Campo` e `CampoNumero` vêm da tela do Gestor sem alteração. As
 * duas telas editam preço, e um segundo desenho de campo de dinheiro só
 * garantiria que as duas divergissem com o tempo.
 *
 * ## Rótulo, ordem e limites vêm da grade
 *
 * Nenhuma faixa, regime ou ramo está escrito neste arquivo. Tudo é lido da
 * estrutura da Vincis, então uma faixa nova aparece aqui como campo novo sem
 * ninguém tocar neste componente.
 */
export function SecoesDePreco({
  estrutura,
  rascunho,
  onChange,
  secaoComProblema,
}: {
  estrutura: TabelaPrecificacao
  rascunho: RascunhoDoProfissional
  onChange: (r: RascunhoDoProfissional) => void
  /** Seção apontada pela última recusa do servidor. */
  secaoComProblema?: string
}) {
  const definirPreco = (chave: string, valor: string) =>
    onChange({ ...rascunho, precosBase: { ...rascunho.precosBase, [chave]: valor } })
  const definirFaixa = (chave: string, valor: string) =>
    onChange({ ...rascunho, faixas: { ...rascunho.faixas, [chave]: valor } })
  /** Muda um pedaço de um acréscimo, preservando o resto do que foi digitado. */
  const definirFator = (chave: string, mudanca: Partial<AcrescimoDoRascunho>) =>
    onChange({
      ...rascunho,
      fatores: {
        ...rascunho.fatores,
        [chave]: { ...rascunho.fatores[chave], ...mudanca },
      },
    })

  const destaque = (secao: SecaoDoProfissional) =>
    secaoComProblema === secao ? 'ring-1 ring-destructive/50' : undefined

  const funcionarios = faixasDaGrade(estrutura, 'funcionarios')
  const notas = faixasDaGrade(estrutura, 'notas_fiscais')
  const faturamento = faixasDaGrade(estrutura, 'faturamento')

  return (
    <div className="space-y-4">
      <Painel
        titulo={ROTULO_DA_SECAO.precos_base}
        descricao="O valor de partida da contabilidade mensal, por enquadramento fiscal da empresa. Todo o resto se soma a ele."
        className={destaque('precos_base')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {regimesDaGrade(estrutura).map((regime) => (
            <Campo
              key={regime.codigo}
              label={regime.rotulo}
              hint={regime.ajuda ?? undefined}
            >
              <CampoNumero
                id={`preco-${regime.codigo}`}
                valor={rascunho.precosBase[regime.codigo] ?? ''}
                onChange={(v) => definirPreco(regime.codigo, v)}
                sufixo="/mês"
              />
            </Campo>
          ))}
        </div>
      </Painel>

      <Painel
        titulo={ROTULO_DA_SECAO.funcionarios}
        descricao="Cobrado por funcionário registrado a partir do limite da faixa — os anteriores estão inclusos no preço-base."
        className={destaque('funcionarios')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {funcionarios.map((faixa) => (
            <Campo
              key={faixa.codigo}
              label={faixa.rotulo}
              hint={
                faixa.modo === 'por_unidade'
                  ? `Por funcionário, a partir do ${faixa.limiteMin}º`
                  : 'Valor fixo na faixa'
              }
            >
              <CampoNumero
                id={`faixa-funcionarios-${faixa.codigo}`}
                valor={
                  rascunho.faixas[chaveDaFaixa(faixa.tipo, faixa.codigo)] ?? ''
                }
                onChange={(v) =>
                  definirFaixa(chaveDaFaixa(faixa.tipo, faixa.codigo), v)
                }
              />
            </Campo>
          ))}
        </div>
      </Painel>

      <Painel
        titulo={ROTULO_DA_SECAO.notas_fiscais}
        descricao="Acréscimo por volume de notas. Só entra na conta quando o cliente escolhe que você emite as notas por ele."
        className={destaque('notas_fiscais')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notas.map((faixa) => (
            <Campo key={faixa.codigo} label={faixa.rotulo}>
              <CampoNumero
                id={`faixa-notas-${faixa.codigo}`}
                valor={
                  rascunho.faixas[chaveDaFaixa(faixa.tipo, faixa.codigo)] ?? ''
                }
                onChange={(v) =>
                  definirFaixa(chaveDaFaixa(faixa.tipo, faixa.codigo), v)
                }
              />
            </Campo>
          ))}
        </div>
      </Painel>

      <Painel
        titulo={ROTULO_DA_SECAO.faturamento}
        descricao="Acréscimo por porte da empresa. Zero em uma faixa significa que ela não paga nada a mais."
        className={destaque('faturamento')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {faturamento.map((faixa) => (
            <Campo key={faixa.codigo} label={faixa.rotulo}>
              <CampoNumero
                id={`faixa-faturamento-${faixa.codigo}`}
                valor={
                  rascunho.faixas[chaveDaFaixa(faixa.tipo, faixa.codigo)] ?? ''
                }
                onChange={(v) =>
                  definirFaixa(chaveDaFaixa(faixa.tipo, faixa.codigo), v)
                }
              />
            </Campo>
          ))}
        </div>
      </Painel>

      {dimensoesComFator(estrutura).map((dimensao) => {
        const aceitaValorFixo = DIMENSOES_COM_ACRESCIMO_FIXO.includes(
          dimensao.codigo as (typeof DIMENSOES_COM_ACRESCIMO_FIXO)[number],
        )

        return (
          <Painel
            key={dimensao.codigo}
            titulo={
              ROTULO_DA_SECAO[dimensao.codigo as SecaoDoProfissional] ??
              dimensao.rotulo
            }
            descricao={
              aceitaValorFixo
                ? 'Escolha como cobrar cada forma de atendimento: em porcentagem sobre o subtotal ou em reais. Zero, dos dois jeitos, deixa a resposta neutra.'
                : 'Acréscimo em porcentagem sobre o subtotal. Zero deixa a resposta neutra; 20 cobra 20% a mais.'
            }
            className={destaque(dimensao.codigo as SecaoDoProfissional)}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {opcoesComFator(dimensao).map((opcao) => {
                const chave = chaveDoFator(dimensao.codigo, opcao.codigo)
                const campo = rascunho.fatores[chave]
                const tipo: TipoDeCobranca = campo?.tipo ?? 'percentual'
                const emReais = aceitaValorFixo && tipo === 'fixo'

                return (
                  <Campo
                    key={opcao.codigo}
                    label={opcao.rotulo}
                    hint={opcao.ajuda ?? undefined}
                  >
                    <div className="flex items-center gap-2">
                      {aceitaValorFixo ? (
                        <SeletorDeCobranca
                          chave={chave}
                          tipo={tipo}
                          onChange={(novo) => definirFator(chave, { tipo: novo })}
                        />
                      ) : null}

                      <CampoNumero
                        id={`fator-${dimensao.codigo}-${opcao.codigo}`}
                        className="min-w-0 flex-1"
                        valor={
                          (emReais ? campo?.fixoReais : campo?.percentual) ?? ''
                        }
                        onChange={(v) =>
                          definirFator(
                            chave,
                            emReais ? { fixoReais: v } : { percentual: v },
                          )
                        }
                        prefixo={emReais ? 'R$' : null}
                        sufixo={emReais ? '/mês' : '%'}
                      />
                    </div>
                  </Campo>
                )
              })}
            </div>
          </Painel>
        )
      })}
    </div>
  )
}

/**
 * Como esta resposta cobra: em porcentagem ou em reais.
 *
 * Dois botões e nada mais. A alternativa — um `select` — esconderia atrás de um
 * clique a informação que decide o significado do campo ao lado, e essa é
 * justamente a que precisa estar visível enquanto se digita o número.
 *
 * Trocar de lado não apaga o outro campo: o rascunho guarda os dois valores, e
 * o seletor só diz qual deles vale.
 */
function SeletorDeCobranca({
  chave,
  tipo,
  onChange,
}: {
  chave: string
  tipo: TipoDeCobranca
  onChange: (tipo: TipoDeCobranca) => void
}) {
  return (
    <div
      role="group"
      aria-label="Forma de cobrança do acréscimo"
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-input"
    >
      {TIPOS_DE_COBRANCA.map((candidato) => {
        const ativo = candidato === tipo
        return (
          <button
            key={candidato}
            id={`cobranca-${chave.replace('/', '-')}-${candidato}`}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(candidato)}
            className={cn(
              'h-9 px-2.5 text-xs font-semibold tabular-nums transition-colors',
              ativo
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {candidato === 'percentual' ? '%' : 'R$'}
          </button>
        )
      })}
    </div>
  )
}
