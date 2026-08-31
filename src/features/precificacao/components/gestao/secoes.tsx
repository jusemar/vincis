'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatarCentavos } from '../../lib/formato'
import { precoBaseDoServico } from '../../lib/motor'
import {
  chaveDaFaixa,
  chaveDoFator,
  chaveDoPreco,
  paraNumero,
  type RascunhoPrecificacao,
} from '../../lib/rascunho'
import type {
  FaixaPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { CampoValor, LinhaConfig, Painel } from './primitivas'

/**
 * O conteúdo de cada seção da Precificação.
 *
 * Todas seguem a mesma forma: um cartão por assunto, linhas compactas dentro
 * dele e o botão de salvar no rodapé do próprio cartão. Nenhuma delas guarda
 * estado — o rascunho vive na página, porque é ele que alimenta a prévia
 * lateral enquanto a pessoa digita.
 */

type Comum = {
  tabela: TabelaPrecificacao
  /** A tabela com o rascunho aplicado — é o que a prévia e os apoios usam. */
  simulada: TabelaPrecificacao
  rascunho: RascunhoPrecificacao
  alterar: (mudanca: (atual: RascunhoPrecificacao) => RascunhoPrecificacao) => void
  estadoDaSecao: (secao: string) => {
    alterado: boolean
    salvando: boolean
    onSalvar: () => void
    onDescartar: () => void
  }
}

export function SecaoPrecosBase({
  tabela,
  simulada,
  rascunho,
  alterar,
  estadoDaSecao,
}: Comum) {
  const regimes = tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ?? []
  const estado = estadoDaSecao('precos_base')

  const base = (servico: string, regime: string) => {
    try {
      return formatarCentavos(precoBaseDoServico(simulada, servico, regime))
    } catch {
      return '—'
    }
  }

  const linhas = (grupo: 'contabil' | 'juridico', servico: string) =>
    regimes.map((regime, indice) => {
      const chave = chaveDoPreco(grupo, regime.codigo)
      return (
        <LinhaConfig
          key={chave}
          id={`preco-${chave}`}
          rotulo={regime.rotulo}
          ajuda={regime.ajuda ?? undefined}
          apoio={`Na vitrine, parte de ${base(servico, regime.codigo)}`}
          primeira={indice === 0}
        >
          <CampoValor
            id={`preco-${chave}`}
            unidade="reais"
            valor={rascunho.precosBase[chave] ?? ''}
            onChange={(valor) =>
              alterar((atual) => ({
                ...atual,
                precosBase: { ...atual.precosBase, [chave]: valor },
              }))
            }
          />
        </LinhaConfig>
      )
    })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Painel
        titulo="Contabilidade"
        descricao="Ponto de partida da rotina contábil em cada regime."
        rodape="Os valores exibidos na vitrine são arredondados para o múltiplo de R$ 5 mais próximo."
        {...estado}
      >
        {linhas('contabil', 'padrao')}
      </Painel>

      <Painel
        titulo="Assistência Jurídica"
        descricao="Ponto de partida da assistência jurídica em cada regime."
        {...estado}
      >
        {linhas('juridico', 'juridico')}
      </Painel>

      <Painel
        titulo="Contabilidade Consultiva"
        descricao="A Consultiva não tem preço próprio: usa a base da Padrão e aplica um acréscimo."
        className="lg:col-span-2"
        {...estado}
      >
        <LinhaConfig
          id="acrescimo-consultiva"
          rotulo="Acréscimo sobre a Contabilidade Padrão"
          primeira
        >
          <CampoValor
            id="acrescimo-consultiva"
            unidade="porcento"
            valor={rascunho.acrescimoConsultiva}
            onChange={(valor) =>
              alterar((atual) => ({ ...atual, acrescimoConsultiva: valor }))
            }
          />
        </LinhaConfig>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {regimes.map((regime) => (
            <li
              key={regime.codigo}
              className="flex items-baseline justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px]"
            >
              <span className="truncate text-muted-foreground">{regime.rotulo}</span>
              <span className="shrink-0 tabular-nums text-foreground">
                {base('padrao', regime.codigo)}
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-semibold text-primary">
                  {base('consultiva', regime.codigo)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Painel>
    </div>
  )
}

function nomeDoGrupo(grupo: string) {
  return grupo === 'juridico' ? 'Assistência Jurídica' : 'Contabilidade'
}

function PainelDeFaixas({
  tabela,
  rascunho,
  alterar,
  estadoDaSecao,
  tipo,
  titulo,
  descricao,
  rodape,
  rotulo,
}: Comum & {
  tipo: 'funcionarios' | 'notas_fiscais' | 'faturamento'
  titulo: string
  descricao: string
  rodape?: string
  rotulo: (faixa: FaixaPrecificacao) => { rotulo: string; ajuda?: string }
}) {
  const faixas = tabela.faixas
    .filter((f) => f.tipo === tipo)
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.limiteMin - b.limiteMin)

  return (
    <Painel
      titulo={titulo}
      descricao={descricao}
      rodape={rodape}
      {...estadoDaSecao(tipo)}
    >
      {faixas.map((faixa, indice) => {
        const chave = chaveDaFaixa(faixa.grupo, faixa.tipo, faixa.codigo)
        const texto = rotulo(faixa)
        return (
          <LinhaConfig
            key={chave}
            id={`faixa-${chave}`}
            rotulo={texto.rotulo}
            ajuda={texto.ajuda}
            primeira={indice === 0}
          >
            <CampoValor
              id={`faixa-${chave}`}
              unidade="reais"
              valor={rascunho.faixas[chave] ?? ''}
              onChange={(valor) =>
                alterar((atual) => ({
                  ...atual,
                  faixas: { ...atual.faixas, [chave]: valor },
                }))
              }
            />
          </LinhaConfig>
        )
      })}
    </Painel>
  )
}

export function SecaoPorte(props: Comum) {
  return (
    <div className="space-y-4">
      <PainelDeFaixas
        {...props}
        tipo="funcionarios"
        titulo="Funcionários registrados"
        descricao="Os primeiros funcionários estão inclusos. A partir daí, cada um acrescenta um valor por mês."
        rotulo={(faixa) => ({
          rotulo: `${nomeDoGrupo(faixa.grupo)} — por funcionário`,
          ajuda: `Inclusos: ${faixa.limiteMin - 1}. A cobrança começa no ${faixa.limiteMin}º.`,
        })}
      />
      <PainelDeFaixas
        {...props}
        tipo="notas_fiscais"
        titulo="Notas fiscais por mês"
        descricao="Acréscimo pelo volume de notas emitidas."
        rodape="Só é cobrada quando as notas são emitidas pela Vincis. Se a empresa emite, nenhuma faixa se aplica."
        rotulo={(faixa) => ({ rotulo: faixa.rotulo })}
      />
      <PainelDeFaixas
        {...props}
        tipo="faturamento"
        titulo="Faturamento mensal"
        descricao="Acréscimo pelo porte financeiro da empresa."
        rotulo={(faixa) => ({ rotulo: faixa.rotulo })}
      />
    </div>
  )
}

function PainelDeFatores({
  tabela,
  rascunho,
  alterar,
  estadoDaSecao,
  dimensao,
  titulo,
  descricao,
  rodape,
}: Comum & {
  dimensao: 'atividade' | 'atendimento' | 'rotina'
  titulo: string
  descricao: string
  rodape?: string
}) {
  const opcoes = (
    tabela.dimensoes.find((d) => d.codigo === dimensao)?.opcoes ?? []
  ).filter((o) => o.multiplicadorMilesimos !== null)

  return (
    <Painel
      titulo={titulo}
      descricao={descricao}
      rodape={rodape}
      {...estadoDaSecao(dimensao)}
    >
      {opcoes.map((opcao, indice) => {
        const chave = chaveDoFator(dimensao, opcao.codigo)
        const digitado = paraNumero(rascunho.fatores[chave] ?? '')
        return (
          <LinhaConfig
            key={chave}
            id={`fator-${chave}`}
            rotulo={opcao.rotulo}
            ajuda={
              digitado === 0
                ? 'Sem acréscimo sobre o preço da rotina.'
                : (opcao.ajuda ?? undefined)
            }
            primeira={indice === 0}
          >
            <CampoValor
              id={`fator-${chave}`}
              unidade="porcento"
              valor={rascunho.fatores[chave] ?? ''}
              onChange={(valor) =>
                alterar((atual) => ({
                  ...atual,
                  fatores: { ...atual.fatores, [chave]: valor },
                }))
              }
            />
          </LinhaConfig>
        )
      })}
    </Painel>
  )
}

export function SecaoPerfil(props: Comum) {
  return (
    <div className="space-y-4">
      <PainelDeFatores
        {...props}
        dimensao="atividade"
        titulo="Ramo da empresa"
        descricao="Quanto cada ramo acrescenta sobre o preço da rotina contábil."
        rodape="O ramo não altera o preço da Assistência Jurídica."
      />
      <PainelDeFatores
        {...props}
        dimensao="atendimento"
        titulo="Como quer ser atendido"
        descricao="Quanto cada forma de atendimento acrescenta sobre o preço."
        rodape="É a única dimensão que também acrescenta na Assistência Jurídica."
      />
      <PainelDeFatores
        {...props}
        dimensao="rotina"
        titulo="Quem cuida da rotina"
        descricao="Quanto acrescenta deixar a rotina inteira com a Vincis."
        rodape="A rotina não altera o preço da Assistência Jurídica."
      />
    </div>
  )
}

export function SecaoAdicionais({ tabela, rascunho, alterar, estadoDaSecao }: Comum) {
  return (
    <Painel
      titulo="Serviços adicionais"
      descricao="Itens opcionais do configurador. Entram pelo valor cheio, sem os acréscimos de ramo, atendimento ou rotina."
      {...estadoDaSecao('adicionais')}
    >
      {tabela.adicionais.map((adicional, indice) => {
        const atual = rascunho.adicionais[adicional.codigo]
        return (
          <LinhaConfig
            key={adicional.codigo}
            id={`adicional-${adicional.codigo}`}
            rotulo={adicional.rotulo}
            ajuda={adicional.descricao}
            primeira={indice === 0}
            apoio={
              <span className="flex items-center gap-2">
                <Switch
                  id={`ativo-${adicional.codigo}`}
                  checked={atual?.ativo ?? true}
                  onCheckedChange={(ativo) =>
                    alterar((estado) => ({
                      ...estado,
                      adicionais: {
                        ...estado.adicionais,
                        [adicional.codigo]: {
                          ...estado.adicionais[adicional.codigo],
                          ativo,
                        },
                      },
                    }))
                  }
                />
                <Label
                  htmlFor={`ativo-${adicional.codigo}`}
                  className="cursor-pointer text-[11px] text-muted-foreground"
                >
                  {atual?.ativo ? 'Na página de preços' : 'Fora da página'}
                </Label>
              </span>
            }
          >
            <CampoValor
              id={`adicional-${adicional.codigo}`}
              unidade="reais"
              desabilitado={!atual?.ativo}
              valor={atual?.valor ?? ''}
              onChange={(valor) =>
                alterar((estado) => ({
                  ...estado,
                  adicionais: {
                    ...estado.adicionais,
                    [adicional.codigo]: { ...estado.adicionais[adicional.codigo], valor },
                  },
                }))
              }
            />
          </LinhaConfig>
        )
      })}
    </Painel>
  )
}

export function SecaoDescontos({ tabela, rascunho, alterar, estadoDaSecao }: Comum) {
  const estado = estadoDaSecao('descontos')
  const periodos = tabela.descontos.filter((d) => d.tipo === 'periodo')
  const combos = tabela.descontos.filter((d) => d.tipo === 'combo')

  const campo = (codigo: string, rotulo: string, ajuda: string | undefined, primeira: boolean) => (
    <LinhaConfig
      key={codigo}
      id={`desconto-${codigo}`}
      rotulo={rotulo}
      ajuda={ajuda}
      primeira={primeira}
    >
      <CampoValor
        id={`desconto-${codigo}`}
        unidade="porcento"
        valor={rascunho.descontos[codigo] ?? ''}
        onChange={(valor) =>
          alterar((atual) => ({
            ...atual,
            descontos: { ...atual.descontos, [codigo]: valor },
          }))
        }
      />
    </LinhaConfig>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Painel
        titulo="Desconto por prazo"
        descricao="Quanto o cliente economiza ao fechar por mais tempo."
        {...estado}
      >
        {periodos.map((periodo, indice) =>
          campo(
            periodo.codigo,
            periodo.rotulo,
            periodo.meses === 1
              ? 'Sem compromisso de permanência.'
              : `Compromisso de ${periodo.meses} meses.`,
            indice === 0,
          ),
        )}
      </Painel>

      {combos.map((combo) => {
        const servico = tabela.servicos.find((s) => s.codigo === combo.servicoCodigo)
        return (
          <Painel
            key={combo.codigo}
            titulo={servico?.nome ?? 'Pacote'}
            descricao={servico?.chamada}
            rodape="A composição do pacote é estrutural: aqui você define apenas o desconto."
            {...estado}
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px]">
              {(servico?.componentes ?? []).map((codigo, indice) => (
                <span key={codigo} className="flex items-center gap-1.5">
                  {indice > 0 ? <span className="text-muted-foreground">+</span> : null}
                  <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                    {tabela.servicos.find((s) => s.codigo === codigo)?.nome ?? codigo}
                  </span>
                </span>
              ))}
              <span className="text-muted-foreground">−</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                desconto
              </span>
            </div>
            {campo(combo.codigo, 'Desconto do pacote', undefined, true)}
          </Painel>
        )
      })}
    </div>
  )
}
