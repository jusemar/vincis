'use client'

import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import {
  Campo,
  CampoNumero,
  Painel,
} from '@/features/precificacao/components/gestao/primitivas'
import {
  ROTULO_DA_SECAO,
  type SecaoDoProfissional,
} from '../../constants/precificacao-profissional'
import {
  chaveDaFaixa,
  chaveDoFator,
  dimensoesComFator,
  faixasDaGrade,
  opcoesComFator,
  regimesDaGrade,
} from '../../lib/grade'
import type { RascunhoDoProfissional } from '../../lib/rascunho'

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
  const definirFator = (chave: string, valor: string) =>
    onChange({ ...rascunho, fatores: { ...rascunho.fatores, [chave]: valor } })

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

      {dimensoesComFator(estrutura).map((dimensao) => (
        <Painel
          key={dimensao.codigo}
          titulo={
            ROTULO_DA_SECAO[dimensao.codigo as SecaoDoProfissional] ??
            dimensao.rotulo
          }
          descricao="Acréscimo em porcentagem sobre o subtotal. Zero deixa a resposta neutra; 20 cobra 20% a mais."
          className={destaque(dimensao.codigo as SecaoDoProfissional)}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {opcoesComFator(dimensao).map((opcao) => (
              <Campo
                key={opcao.codigo}
                label={opcao.rotulo}
                hint={opcao.ajuda ?? undefined}
              >
                <CampoNumero
                  id={`fator-${dimensao.codigo}-${opcao.codigo}`}
                  valor={
                    rascunho.fatores[
                      chaveDoFator(dimensao.codigo, opcao.codigo)
                    ] ?? ''
                  }
                  onChange={(v) =>
                    definirFator(chaveDoFator(dimensao.codigo, opcao.codigo), v)
                  }
                  prefixo={null}
                  sufixo="%"
                />
              </Campo>
            ))}
          </div>
        </Painel>
      ))}
    </div>
  )
}
