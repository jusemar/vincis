'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeDollarSign,
  Building2,
  ChevronRight,
  Headphones,
  LayoutList,
  Percent,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  salvarAdicionais,
  salvarDescontos,
  salvarFaixas,
  salvarFatores,
  salvarPrecosBase,
} from '../../actions/precificacao'
import { impressaoDaSecao } from '../../lib/impressao'
import {
  aplicarRascunho,
  chaveDaFaixa,
  chaveDoFator,
  chaveDoPreco,
  paraNumero,
  rascunhoDaTabela,
  secaoAlterada,
  type RascunhoPrecificacao,
  type SecaoRascunho,
} from '../../lib/rascunho'
import { respostasIniciais } from '../../lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { CabecalhoSecao } from './primitivas'
import { PrevisaoLateral } from './PrevisaoLateral'
import { SecaoVisaoGeral } from './SecaoVisaoGeral'
import {
  SecaoAdicionais,
  SecaoDescontos,
  SecaoPerfil,
  SecaoPorte,
  SecaoPrecosBase,
} from './secoes'

/**
 * A mesa de trabalho da Precificação.
 *
 * ## Três colunas, e o motivo de cada uma
 *
 * À esquerda o índice das seis áreas — só uma aparece por vez, porque
 * configurar preço é uma tarefa de cada vez e empilhar tudo numa página só
 * produzia metros de rolagem. No centro o assunto escolhido. À direita a
 * simulação, fixa: é a pergunta que antecede qualquer alteração de preço —
 * "quanto fica?" — respondida sem sair da tela.
 *
 * ## O rascunho mora aqui
 *
 * As seções não guardam estado próprio. Se guardassem, a prévia só saberia da
 * seção aberta, e mexer no acréscimo da Consultiva não mostraria efeito no
 * Pacote. Com um rascunho só, `aplicarRascunho` monta a tabela hipotética
 * inteira e o motor calcula sobre ela — o mesmo motor de `/precos`, sem cópia
 * nenhuma da fórmula.
 *
 * Rascunho não é persistência: cada cartão continua salvando o próprio
 * conjunto pela Server Action de sempre, com Zod, impressão da seção,
 * transação e conferência de coerência.
 */
const AREAS = [
  { id: 'visao', rotulo: 'Visão geral', icone: LayoutList },
  { id: 'base', rotulo: 'Preços-base', icone: BadgeDollarSign },
  { id: 'porte', rotulo: 'Porte da empresa', icone: Building2 },
  { id: 'perfil', rotulo: 'Perfil do atendimento', icone: Headphones },
  { id: 'adicionais', rotulo: 'Adicionais', icone: Sparkles },
  { id: 'descontos', rotulo: 'Descontos e pacote', icone: Percent },
] as const

type AreaId = (typeof AREAS)[number]['id']

/** Seções de rascunho que cada área da tela controla. */
const SECOES_DA_AREA: Record<AreaId, SecaoRascunho[]> = {
  visao: [],
  base: ['precos_base'],
  porte: ['funcionarios', 'notas_fiscais', 'faturamento'],
  perfil: ['atividade', 'atendimento', 'rotina'],
  adicionais: ['adicionais'],
  descontos: ['descontos'],
}

/** O serviço cuja composição a prévia detalha em cada área. */
const FOCO_DA_AREA: Record<AreaId, string> = {
  visao: 'consultiva',
  base: 'consultiva',
  porte: 'padrao',
  perfil: 'consultiva',
  adicionais: 'consultiva',
  descontos: 'combo',
}

export function PrecificacaoGestaoPage({
  gestorNome,
  tabela,
}: {
  gestorNome: string
  tabela: TabelaPrecificacao
}) {
  const router = useRouter()
  const [area, setArea] = useState<AreaId>('visao')
  const [salvando, iniciar] = useTransition()

  const salvo = useMemo(() => rascunhoDaTabela(tabela), [tabela])
  const [rascunho, setRascunho] = useState<RascunhoPrecificacao>(salvo)
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(() =>
    respostasIniciais(tabela),
  )

  // A tabela como ficaria se tudo fosse salvo agora. Só a prévia e os textos
  // de apoio a consultam; o banco continua vendo apenas o que o botão manda.
  const simulada = useMemo(
    () => aplicarRascunho(tabela, rascunho),
    [tabela, rascunho],
  )
  const alteradas = useMemo(
    () =>
      new Set(
        (Object.keys(SECOES_DA_AREA) as AreaId[])
          .flatMap((id) => SECOES_DA_AREA[id])
          .filter((secao) => secaoAlterada(rascunho, salvo, secao)),
      ),
    [rascunho, salvo],
  )

  function concluir(promessa: Promise<{ sucesso: boolean; mensagem: string }>) {
    iniciar(async () => {
      const resultado = await promessa
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  function invalido(valores: number[]) {
    if (valores.every((v) => Number.isFinite(v))) return false
    toast.error('Confira os campos: há valores em branco ou inválidos.')
    return true
  }

  /** Monta e envia o conjunto de uma seção, na unidade que a action espera. */
  function salvarSecao(secao: SecaoRascunho) {
    if (secao === 'precos_base') {
      const precos = tabela.precosBase.map((p) => ({
        grupo: p.grupo,
        regime: p.regime,
        valorReais: paraNumero(rascunho.precosBase[chaveDoPreco(p.grupo, p.regime)] ?? ''),
      }))
      const acrescimoConsultiva = paraNumero(rascunho.acrescimoConsultiva)
      if (invalido([...precos.map((p) => p.valorReais), acrescimoConsultiva])) return
      concluir(
        salvarPrecosBase({
          impressao: impressaoDaSecao(tabela, 'precos_base'),
          precos,
          acrescimoConsultiva,
        }),
      )
      return
    }

    if (secao === 'funcionarios' || secao === 'notas_fiscais' || secao === 'faturamento') {
      const faixas = tabela.faixas
        .filter((f) => f.tipo === secao)
        .map((f) => ({
          grupo: f.grupo,
          codigo: f.codigo,
          valorReais: paraNumero(
            rascunho.faixas[chaveDaFaixa(f.grupo, f.tipo, f.codigo)] ?? '',
          ),
        }))
      if (invalido(faixas.map((f) => f.valorReais))) return
      concluir(
        salvarFaixas({
          impressao: impressaoDaSecao(tabela, secao),
          tipo: secao,
          faixas,
        }),
      )
      return
    }

    if (secao === 'atividade' || secao === 'atendimento' || secao === 'rotina') {
      const dimensao = tabela.dimensoes.find((d) => d.codigo === secao)
      const opcoes = (dimensao?.opcoes ?? [])
        .filter((o) => o.multiplicadorMilesimos !== null)
        .map((o) => ({
          codigo: o.codigo,
          acrescimoPercentual: paraNumero(rascunho.fatores[chaveDoFator(secao, o.codigo)] ?? ''),
        }))
      if (invalido(opcoes.map((o) => o.acrescimoPercentual))) return
      concluir(
        salvarFatores({
          impressao: impressaoDaSecao(tabela, `fatores:${secao}`),
          dimensao: secao,
          opcoes,
        }),
      )
      return
    }

    if (secao === 'adicionais') {
      const adicionais = tabela.adicionais.map((a) => ({
        codigo: a.codigo,
        valorReais: paraNumero(rascunho.adicionais[a.codigo]?.valor ?? ''),
        ativo: rascunho.adicionais[a.codigo]?.ativo ?? a.ativo,
      }))
      if (invalido(adicionais.map((a) => a.valorReais))) return
      concluir(
        salvarAdicionais({
          impressao: impressaoDaSecao(tabela, 'adicionais'),
          adicionais,
        }),
      )
      return
    }

    const descontos = tabela.descontos.map((d) => ({
      codigo: d.codigo,
      percentual: paraNumero(rascunho.descontos[d.codigo] ?? ''),
    }))
    if (invalido(descontos.map((d) => d.percentual))) return
    concluir(
      salvarDescontos({
        impressao: impressaoDaSecao(tabela, 'descontos'),
        descontos,
      }),
    )
  }

  /** O que cada cartão precisa saber para desenhar o próprio rodapé. */
  const estadoDaSecao = (secao: string) => ({
    alterado: alteradas.has(secao as SecaoRascunho),
    salvando,
    onSalvar: () => salvarSecao(secao as SecaoRascunho),
    onDescartar: () => setRascunho(salvo),
  })

  const comum = { tabela, simulada, rascunho, alterar: setRascunho, estadoDaSecao }
  const areaAtual = AREAS.find((a) => a.id === area)!
  const pendentesNaArea = SECOES_DA_AREA[area].filter((s) => alteradas.has(s)).length

  return (
    <div className="space-y-4">
      <CabecalhoSecao
        titulo="Precificação"
        descricao={`Valores e regras da página pública de preços · ${gestorNome}`}
      />

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_19rem]">
        <IndiceDeAreas
          area={area}
          onSelecionar={setArea}
          alteradas={(id) => SECOES_DA_AREA[id].some((s) => alteradas.has(s))}
        />

        <main className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {areaAtual.rotulo}
            </h2>
            {pendentesNaArea > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                não salvo
              </span>
            ) : null}
          </div>

          {area === 'visao' ? (
            <SecaoVisaoGeral tabela={simulada} respostas={respostas} />
          ) : null}
          {area === 'base' ? <SecaoPrecosBase {...comum} /> : null}
          {area === 'porte' ? <SecaoPorte {...comum} /> : null}
          {area === 'perfil' ? <SecaoPerfil {...comum} /> : null}
          {area === 'adicionais' ? <SecaoAdicionais {...comum} /> : null}
          {area === 'descontos' ? <SecaoDescontos {...comum} /> : null}
        </main>

        {/* Fixa a partir de `xl`; abaixo disso vai para o fim da coluna, que é
            onde ela cabe sem espremer o formulário. */}
        <aside
          aria-label="Simulação de preço"
          className="min-w-0 xl:sticky xl:top-4 xl:self-start"
        >
          <PrevisaoLateral
            tabela={simulada}
            respostas={respostas}
            onRespostas={setRespostas}
            temRascunho={alteradas.size > 0}
            servicoEmFoco={FOCO_DA_AREA[area]}
          />
        </aside>
      </div>
    </div>
  )
}

/**
 * O índice das áreas.
 *
 * Vertical no desktop e rolando na horizontal no celular: seis itens não cabem
 * numa linha estreita, e quebrar em duas empurraria o formulário para baixo da
 * dobra.
 */
function IndiceDeAreas({
  area,
  onSelecionar,
  alteradas,
}: {
  area: AreaId
  onSelecionar: (id: AreaId) => void
  alteradas: (id: AreaId) => boolean
}) {
  return (
    <nav
      aria-label="Áreas da precificação"
      className="-mx-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      <div className="flex w-max gap-1 lg:sticky lg:top-4 lg:w-auto lg:flex-col">
        {AREAS.map((item) => {
          const Icone: LucideIcon = item.icone
          const ativa = item.id === area
          return (
            <button
              key={item.id}
              type="button"
              aria-current={ativa ? 'page' : undefined}
              onClick={() => onSelecionar(item.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors lg:w-full ${
                ativa
                  ? 'bg-accent font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <Icone className={`size-4 shrink-0 ${ativa ? 'text-primary' : ''}`} />
              <span className="truncate">{item.rotulo}</span>
              {alteradas(item.id) ? (
                <span
                  aria-label="alterações não salvas"
                  className="size-1.5 shrink-0 rounded-full bg-primary lg:ml-auto"
                />
              ) : null}
              {ativa && !alteradas(item.id) ? (
                <ChevronRight className="ml-auto hidden size-4 text-primary lg:block" />
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
