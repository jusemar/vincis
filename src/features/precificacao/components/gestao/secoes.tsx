'use client'

import {
  Building2,
  Calculator,
  LayoutList,
  Scale,
  Sparkles,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { formatarCentavos } from '../../lib/formato'
import { precoBaseDoServico } from '../../lib/motor'
import {
  chaveDaFaixa,
  chaveDoFator,
  chaveDoPreco,
  type RascunhoPrecificacao,
} from '../../lib/rascunho'
import { GRUPOS_COMPARATIVO } from '@/features/precos/lib/comparativo'
import type {
  FaixaPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import {
  AvisoSemPersistencia,
  CabecalhoSecao,
  Campo,
  CampoNumero,
  CampoTexto,
  Painel,
} from './primitivas'

/**
 * As oito seções da Precificação, na ordem e com os textos do protótipo.
 *
 * Cada uma foi mapeada para o dado real do Vincis. Onde o protótipo editava
 * algo que aqui é conteúdo de código — nome de serviço, tabela comparativa,
 * textos da vitrine —, o campo aparece em modo leitura com a origem declarada,
 * em vez de fingir que grava.
 */

export type PropsSecao = {
  tabela: TabelaPrecificacao
  /** A tabela com o rascunho aplicado: alimenta os valores de apoio. */
  simulada: TabelaPrecificacao
  rascunho: RascunhoPrecificacao
  alterar: (mudanca: (atual: RascunhoPrecificacao) => RascunhoPrecificacao) => void
}

/* ------------------------------------------------------- tipos de serviço */

export function SecaoServicos({ tabela, simulada, rascunho, alterar }: PropsSecao) {
  const regimeReferencia =
    tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes.find((o) => o.padrao)
      ?.codigo ?? 'simples'

  const baseDe = (codigo: string) => {
    try {
      return formatarCentavos(precoBaseDoServico(simulada, codigo, regimeReferencia))
    } catch {
      return '—'
    }
  }

  const nomeDe = (codigo: string) =>
    tabela.servicos.find((s) => s.codigo === codigo)?.nome ?? codigo

  return (
    <>
      <CabecalhoSecao
        titulo="Tipos de serviço"
        descricao="Os cartões exibidos no topo da página de preços. O valor base é o ponto de partida do cálculo."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {tabela.servicos.map((servico) => (
          <Painel key={servico.codigo} className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              {servico.destaque ? (
                <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                  Destaque
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px]">
                  {servico.componentes.length > 0 ? 'Pacote' : 'Plano'}
                </Badge>
              )}
              <Switch checked={servico.ativo} disabled />
            </div>
            <Campo label="Nome do serviço">
              <CampoTexto valor={servico.nome} />
            </Campo>
            <Campo label="Subtítulo">
              <CampoTexto valor={servico.chamada} />
            </Campo>

            {servico.componentes.length > 0 ? (
              <Campo
                label="Composição"
                hint="Soma dos serviços abaixo, menos o desconto do pacote."
              >
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 p-2.5 text-[11px]">
                  {servico.componentes.map((codigo, indice) => (
                    <span key={codigo} className="flex items-center gap-1.5">
                      {indice > 0 ? (
                        <span className="text-muted-foreground">+</span>
                      ) : null}
                      <span className="rounded bg-card px-1.5 py-0.5 font-medium text-foreground">
                        {nomeDe(codigo)}
                      </span>
                    </span>
                  ))}
                  <span className="text-muted-foreground">−</span>
                  <span className="rounded bg-accent px-1.5 py-0.5 font-medium text-accent-foreground">
                    desconto do pacote
                  </span>
                </div>
              </Campo>
            ) : (
              <Campo
                label="Valor base mensal"
                hint={`No ${
                  tabela.dimensoes
                    .find((d) => d.codigo === 'regime')
                    ?.opcoes.find((o) => o.codigo === regimeReferencia)?.rotulo ??
                  'regime de referência'
                }, antes das faixas e adicionais.`}
              >
                <CampoNumero valor={baseDe(servico.codigo).replace('R$', '').trim()} sufixo="/mês" somenteLeitura />
              </Campo>
            )}

            {servico.codigo === 'consultiva' ? (
              <Campo
                label="Multiplicador sobre a Padrão"
                hint="A Consultiva não tem grade própria: parte da base contábil."
              >
                <CampoNumero
                  id="mult-consultiva"
                  valor={rascunho.acrescimoConsultiva}
                  onChange={(valor) =>
                    alterar((atual) => ({ ...atual, acrescimoConsultiva: valor }))
                  }
                  prefixo={null}
                  sufixo="x"
                />
              </Campo>
            ) : null}
          </Painel>
        ))}
      </div>
      <AvisoSemPersistencia>
        Nome, subtítulo, destaque e disponibilidade dos serviços são estruturais e
        vivem no catálogo da plataforma — o valor base vem dos preços por regime,
        editáveis em <strong>Perfil da empresa</strong>. O multiplicador da
        Consultiva é o único campo desta seção que se grava daqui.
      </AvisoSemPersistencia>
    </>
  )
}

/* -------------------------------------------------------- perfil da empresa */

export function SecaoPerfil({ tabela, rascunho, alterar }: PropsSecao) {
  const regimes = tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ?? []
  const ramos = tabela.dimensoes.find((d) => d.codigo === 'atividade')?.opcoes ?? []

  return (
    <>
      <CabecalhoSecao
        titulo="Perfil da empresa"
        descricao="Enquadramento fiscal e ramo de atuação definem a base e o multiplicador aplicados ao preço."
      />
      <Painel
        titulo="Enquadramento fiscal"
        descricao="Cada opção aparece como cartão selecionável no simulador."
      >
        <div className="space-y-3">
          {regimes.map((regime) => (
            <div
              key={regime.codigo}
              className="grid items-end gap-3 rounded-lg border border-border/70 bg-background/60 p-3 md:grid-cols-[1.2fr_1.6fr_140px_140px_auto]"
            >
              <Campo label="Nome">
                <CampoTexto valor={regime.rotulo} />
              </Campo>
              <Campo label="Descrição">
                <CampoTexto valor={regime.ajuda ?? ''} />
              </Campo>
              <Campo label="Base contábil">
                <CampoNumero
                  id={`preco-contabil-${regime.codigo}`}
                  valor={rascunho.precosBase[chaveDoPreco('contabil', regime.codigo)] ?? ''}
                  onChange={(valor) =>
                    alterar((atual) => ({
                      ...atual,
                      precosBase: {
                        ...atual.precosBase,
                        [chaveDoPreco('contabil', regime.codigo)]: valor,
                      },
                    }))
                  }
                />
              </Campo>
              <Campo label="Base jurídica">
                <CampoNumero
                  id={`preco-juridico-${regime.codigo}`}
                  valor={rascunho.precosBase[chaveDoPreco('juridico', regime.codigo)] ?? ''}
                  onChange={(valor) =>
                    alterar((atual) => ({
                      ...atual,
                      precosBase: {
                        ...atual.precosBase,
                        [chaveDoPreco('juridico', regime.codigo)]: valor,
                      },
                    }))
                  }
                />
              </Campo>
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={regime.ativo} disabled />
              </div>
            </div>
          ))}
        </div>
      </Painel>

      <Painel
        titulo="Ramo da empresa"
        descricao="Multiplicador aplicado sobre o subtotal do enquadramento."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {ramos.map((ramo) => (
            <div
              key={ramo.codigo}
              className="rounded-lg border border-border/70 bg-background/60 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {ramo.rotulo}
                </span>
                <Switch checked={ramo.ativo} disabled />
              </div>
              <Campo label="Multiplicador">
                <CampoNumero
                  id={`fator-atividade-${ramo.codigo}`}
                  valor={rascunho.fatores[chaveDoFator('atividade', ramo.codigo)] ?? ''}
                  onChange={(valor) =>
                    alterar((atual) => ({
                      ...atual,
                      fatores: {
                        ...atual.fatores,
                        [chaveDoFator('atividade', ramo.codigo)]: valor,
                      },
                    }))
                  }
                  prefixo={null}
                  sufixo="x"
                />
              </Campo>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          O ramo não altera o preço da Assistência Jurídica.
        </p>
      </Painel>
    </>
  )
}

/* --------------------------------------------------------- faixas e volumes */

function TabelaDeFaixas({
  titulo,
  descricao,
  unidade,
  icone: Icone,
  faixas,
  rascunho,
  alterar,
  formatarLimite,
}: {
  titulo: string
  descricao: string
  unidade: string
  icone: typeof Users
  faixas: FaixaPrecificacao[]
  rascunho: RascunhoPrecificacao
  alterar: PropsSecao['alterar']
  formatarLimite: (valor: number | null) => string
}) {
  return (
    <Painel titulo={titulo} descricao={descricao}>
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Icone className="size-4 text-primary" />
        Unidade: {unidade}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">De</th>
              <th className="px-3 py-2 font-medium">Até</th>
              <th className="px-3 py-2 font-medium">Acréscimo mensal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 bg-card">
            {faixas.map((faixa) => {
              const chave = chaveDaFaixa(faixa.grupo, faixa.tipo, faixa.codigo)
              return (
                <tr key={chave}>
                  <td className="px-3 py-2">
                    <CampoNumero
                      valor={formatarLimite(faixa.limiteMin)}
                      prefixo={null}
                      somenteLeitura
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CampoNumero
                      valor={formatarLimite(faixa.limiteMax)}
                      prefixo={null}
                      somenteLeitura
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CampoNumero
                      id={`faixa-${chave}`}
                      className="max-w-40"
                      valor={rascunho.faixas[chave] ?? ''}
                      onChange={(valor) =>
                        alterar((atual) => ({
                          ...atual,
                          faixas: { ...atual.faixas, [chave]: valor },
                        }))
                      }
                      sufixo={faixa.modo === 'por_unidade' ? '/un.' : '/mês'}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Painel>
  )
}

export function SecaoFaixas({ tabela, rascunho, alterar }: PropsSecao) {
  const daFamilia = (grupo: string, tipo: string) =>
    tabela.faixas
      .filter((f) => f.grupo === grupo && f.tipo === tipo)
      .sort((a, b) => a.limiteMin - b.limiteMin)

  const quantidade = (valor: number | null) => (valor === null ? '∞' : String(valor))
  const dinheiro = (valor: number | null) =>
    valor === null ? '∞' : String(valor / 100)

  return (
    <>
      <CabecalhoSecao
        titulo="Faixas e volumes"
        descricao="Os campos da página (funcionários, notas fiscais e faturamento) somam valores conforme a faixa atingida."
      />
      <TabelaDeFaixas
        titulo="Funcionários registrados — Contabilidade"
        descricao="Valor cobrado por funcionário dentro da faixa."
        unidade="pessoas"
        icone={Users}
        faixas={daFamilia('contabil', 'funcionarios')}
        rascunho={rascunho}
        alterar={alterar}
        formatarLimite={quantidade}
      />
      <TabelaDeFaixas
        titulo="Funcionários registrados — Assistência Jurídica"
        descricao="Mesma regra, com o valor de risco trabalhista da rotina jurídica."
        unidade="pessoas"
        icone={Scale}
        faixas={daFamilia('juridico', 'funcionarios')}
        rascunho={rascunho}
        alterar={alterar}
        formatarLimite={quantidade}
      />
      <TabelaDeFaixas
        titulo="Notas fiscais por mês"
        descricao="Acréscimo fixo por faixa de emissão mensal, cobrado quando quem emite é a Vincis."
        unidade="notas/mês"
        icone={LayoutList}
        faixas={daFamilia('contabil', 'notas_fiscais')}
        rascunho={rascunho}
        alterar={alterar}
        formatarLimite={quantidade}
      />
      <TabelaDeFaixas
        titulo="Faturamento mensal"
        descricao="Acréscimo fixo por faixa de receita informada."
        unidade="R$/mês"
        icone={Calculator}
        faixas={daFamilia('contabil', 'faturamento')}
        rascunho={rascunho}
        alterar={alterar}
        formatarLimite={dinheiro}
      />
      <AvisoSemPersistencia>
        Os limites de cada faixa são estruturais: mudá-los pode abrir buraco ou
        sobreposição na grade, e por isso hoje só o acréscimo é editável por aqui.
      </AvisoSemPersistencia>
    </>
  )
}

/* ----------------------------------------------------- atendimento e rotina */

function ListaDeOpcoes({
  dimensao,
  opcoes,
  rascunho,
  alterar,
}: {
  dimensao: string
  opcoes: { codigo: string; rotulo: string; ajuda: string | null; ativo: boolean }[]
  rascunho: RascunhoPrecificacao
  alterar: PropsSecao['alterar']
}) {
  return (
    <div className="space-y-3">
      {opcoes.map((opcao) => {
        const chave = chaveDoFator(dimensao, opcao.codigo)
        return (
          <div
            key={opcao.codigo}
            className="grid items-end gap-3 rounded-lg border border-border/70 bg-background/60 p-3 md:grid-cols-[1.2fr_1.8fr_150px_auto]"
          >
            <Campo label="Título">
              <CampoTexto valor={opcao.rotulo} />
            </Campo>
            <Campo label="Descrição">
              <CampoTexto valor={opcao.ajuda ?? ''} />
            </Campo>
            <Campo label="Multiplicador">
              <CampoNumero
                id={`fator-${chave}`}
                valor={rascunho.fatores[chave] ?? ''}
                onChange={(valor) =>
                  alterar((atual) => ({
                    ...atual,
                    fatores: { ...atual.fatores, [chave]: valor },
                  }))
                }
                prefixo={null}
                sufixo="x"
              />
            </Campo>
            <div className="flex items-center gap-2 pb-1">
              <Switch checked={opcao.ativo} disabled />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SecaoAtendimento({ tabela, rascunho, alterar }: PropsSecao) {
  const opcoesDe = (codigo: string) =>
    tabela.dimensoes.find((d) => d.codigo === codigo)?.opcoes ?? []

  return (
    <>
      <CabecalhoSecao
        titulo="Atendimento e rotina"
        descricao="Como o cliente quer ser atendido e quem conduz a rotina — cada escolha multiplica o valor calculado."
      />
      <Painel titulo="Como quer ser atendido">
        <ListaDeOpcoes
          dimensao="atendimento"
          opcoes={opcoesDe('atendimento')}
          rascunho={rascunho}
          alterar={alterar}
        />
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          É a única dimensão que também multiplica a Assistência Jurídica.
        </p>
      </Painel>
      <Painel titulo="Quem cuida da rotina">
        <ListaDeOpcoes
          dimensao="rotina"
          opcoes={opcoesDe('rotina')}
          rascunho={rascunho}
          alterar={alterar}
        />
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          A rotina não altera o preço da Assistência Jurídica.
        </p>
      </Painel>
    </>
  )
}

/* ---------------------------------------------------------------- adicionais */

export function SecaoAdicionais({ tabela, rascunho, alterar }: PropsSecao) {
  return (
    <>
      <CabecalhoSecao
        titulo="Personalize com adicionais"
        descricao="Itens opcionais exibidos como cartões marcáveis antes do resultado do cálculo."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {tabela.adicionais.map((adicional, indice) => {
          const atual = rascunho.adicionais[adicional.codigo]
          return (
            <Painel key={adicional.codigo} className="space-y-4">
              <div className="flex items-start justify-between">
                <Badge className="bg-accent text-accent-foreground hover:bg-accent">
                  Opcional
                </Badge>
                <Switch
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
              </div>
              <Campo label="Título">
                <CampoTexto valor={adicional.rotulo} />
              </Campo>
              <Campo label="Descrição">
                <CampoTexto valor={adicional.descricao} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Valor">
                  <CampoNumero
                    id={`adicional-${adicional.codigo}`}
                    valor={atual?.valor ?? ''}
                    desabilitado={!atual?.ativo}
                    onChange={(valor) =>
                      alterar((estado) => ({
                        ...estado,
                        adicionais: {
                          ...estado.adicionais,
                          [adicional.codigo]: {
                            ...estado.adicionais[adicional.codigo],
                            valor,
                          },
                        },
                      }))
                    }
                    sufixo="/mês"
                  />
                </Campo>
                <Campo label="Ordem">
                  <CampoNumero valor={String(indice + 1)} prefixo={null} somenteLeitura />
                </Campo>
              </div>
            </Painel>
          )
        })}
      </div>
      <AvisoSemPersistencia>
        Adicionais entram pelo valor cheio: nenhum multiplicador de ramo,
        atendimento ou rotina incide sobre eles. Título, descrição e ordem são
        conteúdo do catálogo; valor e disponibilidade se gravam daqui.
      </AvisoSemPersistencia>
    </>
  )
}

/* -------------------------------------------------------- planos e descontos */

export function SecaoPlanos({ tabela, rascunho, alterar }: PropsSecao) {
  const periodos = tabela.descontos.filter((d) => d.tipo === 'periodo')
  const combo = tabela.descontos.find((d) => d.tipo === 'combo')
  const servicoCombo = tabela.servicos.find((s) => s.codigo === combo?.servicoCodigo)

  return (
    <>
      <CabecalhoSecao
        titulo="Planos e descontos"
        descricao="Cartões de resultado, multiplicador sobre o valor calculado e desconto por período de contrato."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {tabela.servicos.map((servico) => (
          <Painel key={servico.codigo} className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {servico.componentes.length > 0 ? 'Pacote' : 'Plano'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Destacar</span>
                <Switch checked={servico.destaque} disabled />
              </div>
            </div>
            <Campo label="Nome do plano">
              <CampoTexto valor={servico.nome} />
            </Campo>
            <Campo label="Descrição">
              <CampoTexto valor={servico.chamada} />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Multiplicador">
                {servico.codigo === 'consultiva' ? (
                  <CampoNumero
                    valor={rascunho.acrescimoConsultiva}
                    onChange={(valor) =>
                      alterar((atual) => ({ ...atual, acrescimoConsultiva: valor }))
                    }
                    prefixo={null}
                    sufixo="x"
                  />
                ) : (
                  <CampoNumero
                    valor={
                      servico.multiplicadorMilesimos === null
                        ? '—'
                        : String(servico.multiplicadorMilesimos / 1000)
                    }
                    prefixo={null}
                    sufixo={servico.multiplicadorMilesimos === null ? undefined : 'x'}
                    somenteLeitura
                  />
                )}
              </Campo>
              {periodos
                .filter((p) => p.descontoMilesimos > 0)
                .map((periodo) => (
                  <Campo key={periodo.codigo} label={`Desconto ${periodo.rotulo}`}>
                    <CampoNumero
                      valor={rascunho.descontos[periodo.codigo] ?? ''}
                      onChange={(valor) =>
                        alterar((atual) => ({
                          ...atual,
                          descontos: { ...atual.descontos, [periodo.codigo]: valor },
                        }))
                      }
                      prefixo={null}
                      sufixo="%"
                    />
                  </Campo>
                ))}
            </div>
            {servico.componentes.length > 0 && combo ? (
              <Campo
                label="Desconto do pacote"
                hint={`Sobre a soma de ${servico.componentes
                  .map((c) => tabela.servicos.find((s) => s.codigo === c)?.nome ?? c)
                  .join(' + ')}.`}
              >
                <CampoNumero
                  id="desconto-combo"
                  valor={rascunho.descontos[combo.codigo] ?? ''}
                  onChange={(valor) =>
                    alterar((atual) => ({
                      ...atual,
                      descontos: { ...atual.descontos, [combo.codigo]: valor },
                    }))
                  }
                  prefixo={null}
                  sufixo="%"
                />
              </Campo>
            ) : null}
          </Painel>
        ))}
      </div>

      <Painel
        titulo="Períodos de contrato"
        descricao="Abas exibidas em cada cartão de plano. O desconto vale para todos os serviços."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {periodos.map((periodo) => (
            <div
              key={periodo.codigo}
              className="rounded-lg border border-border/70 bg-background/60 p-3"
            >
              <Campo label="Rótulo da aba">
                <CampoTexto valor={periodo.rotulo} />
              </Campo>
              <div className="mt-3">
                <Campo label="Desconto" hint={`Compromisso de ${periodo.meses} ${periodo.meses === 1 ? 'mês' : 'meses'}.`}>
                  <CampoNumero
                    id={`desconto-${periodo.codigo}`}
                    valor={rascunho.descontos[periodo.codigo] ?? ''}
                    onChange={(valor) =>
                      alterar((atual) => ({
                        ...atual,
                        descontos: { ...atual.descontos, [periodo.codigo]: valor },
                      }))
                    }
                    prefixo={null}
                    sufixo="%"
                  />
                </Campo>
              </div>
            </div>
          ))}
        </div>
      </Painel>

      {servicoCombo ? (
        <AvisoSemPersistencia>
          O <strong>{servicoCombo.nome}</strong> é a soma de{' '}
          {servicoCombo.componentes
            .map((c) => tabela.servicos.find((s) => s.codigo === c)?.nome ?? c)
            .join(' + ')}{' '}
          menos o desconto do pacote — reajustar a Consultiva reflete nele
          automaticamente. A composição é estrutural; o desconto se grava daqui.
        </AvisoSemPersistencia>
      ) : null}
    </>
  )
}

/* --------------------------------------------------------- tabela comparativa */

export function SecaoComparativo() {
  return (
    <>
      <CabecalhoSecao
        titulo="Veja exatamente o que muda"
        descricao="Tabela comparativa entre os planos exibida abaixo dos cartões de preço."
      />
      {GRUPOS_COMPARATIVO.map((grupo) => (
        <Painel key={grupo.group}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <CampoTexto valor={grupo.group} className="max-w-xs font-medium" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[36rem] overflow-hidden rounded-lg border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Funcionalidade</th>
                    <th className="px-3 py-2 font-medium">Padrão</th>
                    <th className="px-3 py-2 font-medium">Consultiva</th>
                    <th className="px-3 py-2 font-medium">Jurídico</th>
                    <th className="px-3 py-2 font-medium">Completo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70 bg-card">
                  {grupo.rows.map((linha) => (
                    <tr key={linha.label}>
                      <td className="px-3 py-2">
                        <CampoTexto valor={linha.label} />
                      </td>
                      {(['padrao', 'consultiva', 'juridico', 'combo'] as const).map(
                        (oferta) => {
                          const valor = linha.values[oferta]
                          return (
                            <td key={oferta} className="px-3 py-2">
                              <CampoTexto
                                valor={
                                  valor === true
                                    ? 'incluso'
                                    : valor === false || valor === undefined
                                      ? '—'
                                      : valor
                                }
                              />
                            </td>
                          )
                        },
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Painel>
      ))}
      <AvisoSemPersistencia>
        Esta tabela é conteúdo da vitrine e hoje vive no código
        (<code>features/precos/lib/comparativo.ts</code>), não em{' '}
        <code>precificacao_*</code>. Torná-la editável exige criar persistência
        nova — diga se quer isso e eu preparo a migration.
      </AvisoSemPersistencia>
    </>
  )
}

/* ------------------------------------------------------------ textos da página */

const TEXTOS_DA_VITRINE = [
  {
    painel: 'Topo da página',
    campos: [
      { label: 'Título principal', valor: 'Sua empresa não é igual às outras' },
      { label: 'Subtítulo', valor: 'Seu preço também não precisa ser.' },
      { label: 'Rótulo do seletor de serviço', valor: 'Escolha o tipo de serviço' },
      { label: 'Rótulo do formulário', valor: 'Conte sobre a empresa' },
    ],
  },
  {
    painel: 'Rodapé do cálculo',
    campos: [
      { label: 'Texto do botão de detalhamento', valor: 'Como chegamos nesse valor?' },
      { label: 'Texto do botão principal', valor: 'Contratar' },
      {
        label: 'Aviso legal',
        valor:
          'Valores calculados a partir do perfil informado, com regras ainda demonstrativas — a proposta final é confirmada após a análise dos documentos da empresa.',
      },
    ],
  },
]

export function SecaoTextos() {
  return (
    <>
      <CabecalhoSecao
        titulo="Textos da página"
        descricao="Títulos, chamadas e avisos exibidos na página pública de preços."
      />
      {TEXTOS_DA_VITRINE.map((bloco) => (
        <Painel key={bloco.painel} titulo={bloco.painel}>
          <div className="space-y-4">
            {bloco.campos.map((campo) => (
              <Campo key={campo.label} label={campo.label}>
                <CampoTexto valor={campo.valor} />
              </Campo>
            ))}
          </div>
        </Painel>
      ))}
      <AvisoSemPersistencia>
        Estes textos são conteúdo da vitrine e hoje vivem nos componentes de{' '}
        <code>/precos</code>. Aparecem aqui para o Gestor conferir o que a página
        diz; torná-los editáveis exige persistência nova — diga se quer isso.
      </AvisoSemPersistencia>
    </>
  )
}

export const ICONES_DE_SECAO = { Scale, Building2, LayoutList, Sparkles, Calculator }
