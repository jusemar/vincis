'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgeDollarSign,
  Building2,
  Calculator,
  ChevronRight,
  Eye,
  Headphones,
  LayoutList,
  Loader2,
  RotateCcw,
  Save,
  Scale,
  Sparkles,
  Table2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  salvarAdicionais,
  salvarDescontos,
  salvarFaixas,
  salvarFatores,
  salvarPrecosBase,
} from '../../actions/precificacao'
import { multiplicadorParaPercentual } from '../../lib/conversao'
import { formatarCentavos } from '../../lib/formato'
import { impactoDaAlteracao } from '../../lib/impacto'
import { impressaoDaSecao } from '../../lib/impressao'
import {
  aplicarRascunho,
  chaveDaFaixa,
  chaveDoFator,
  chaveDoPreco,
  paraNumero,
  rascunhoDaTabela,
  secaoAlterada,
  SECOES_RASCUNHO,
  type RascunhoPrecificacao,
  type SecaoRascunho,
} from '../../lib/rascunho'
import { respostasIniciais } from '../../lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { PrevisaoLateral } from './PrevisaoLateral'
import {
  SecaoAdicionais,
  SecaoAtendimento,
  SecaoComparativo,
  SecaoFaixas,
  SecaoPerfil,
  SecaoPlanos,
  SecaoServicos,
  SecaoTextos,
} from './secoes'

/**
 * A Precificação, com o layout do protótipo aprovado e o motor real do Vincis.
 *
 * ## O que veio do protótipo
 *
 * A moldura inteira: topbar compacta, coluna de navegação de 15rem fixa, oito
 * seções na mesma ordem e com os mesmos títulos, conteúdo central de largura
 * livre, trilha de simulação de 18rem à direita, cartões, tabelas densas e
 * campos de 36px. Quem conhece o protótipo reconhece a tela.
 *
 * ## O que é do Vincis, e não podia ser copiado
 *
 * Os números. O protótipo mostrava valores escritos à mão e avisava que nada
 * estava ligado; aqui cada campo vem de `precificacao_*`, cada preço da
 * simulação sai do mesmo motor que atende `/precos`, e gravar passa pelas
 * Server Actions com Zod, impressão de seção, transação e conferência de
 * coerência. Onde o protótipo editava algo que no Vincis é conteúdo de código,
 * o campo aparece em leitura com a origem declarada — inventar um campo que
 * grava em lugar nenhum seria pior do que não mostrá-lo.
 *
 * ## Salvar é um só, e continua por seção por dentro
 *
 * O protótipo tem um botão de publicar no topo, e é o que a tela oferece. Por
 * baixo, cada conjunto alterado segue pela sua própria action — a transação, a
 * impressão e a coerência continuam por seção, e um erro é relatado com o nome
 * do bloco em vez de derrubar tudo em silêncio.
 */
const NAV = [
  { id: 'servicos', rotulo: 'Tipos de serviço', icone: Scale },
  { id: 'perfil', rotulo: 'Perfil da empresa', icone: Building2 },
  { id: 'faixas', rotulo: 'Faixas e volumes', icone: LayoutList },
  { id: 'atendimento', rotulo: 'Atendimento e rotina', icone: Headphones },
  { id: 'adicionais', rotulo: 'Adicionais', icone: Sparkles },
  { id: 'planos', rotulo: 'Planos e descontos', icone: Calculator },
  { id: 'comparativo', rotulo: 'Tabela comparativa', icone: Table2 },
  { id: 'textos', rotulo: 'Textos da página', icone: Type },
] as const

type NavId = (typeof NAV)[number]['id']

/** O que as Server Actions da Precificação devolvem. */
type ResultadoDaGravacao = {
  sucesso: boolean
  mensagem: string
  secao?: string
  campo?: string
  conflito?: boolean
}

/** Seções de dados que cada área da navegação toca. */
const SECOES_DA_AREA: Record<NavId, SecaoRascunho[]> = {
  servicos: ['precos_base'],
  perfil: ['precos_base', 'atividade'],
  faixas: ['funcionarios', 'notas_fiscais', 'faturamento'],
  atendimento: ['atendimento', 'rotina'],
  adicionais: ['adicionais'],
  planos: ['precos_base', 'descontos'],
  comparativo: [],
  textos: [],
}

/** O serviço cuja composição a trilha detalha em cada área. */
const FOCO_DA_AREA: Record<NavId, string> = {
  servicos: 'consultiva',
  perfil: 'padrao',
  faixas: 'padrao',
  atendimento: 'consultiva',
  adicionais: 'consultiva',
  planos: 'combo',
  comparativo: 'consultiva',
  textos: 'consultiva',
}

export function PrecificacaoGestaoPage({
  gestorNome,
  tabela,
}: {
  gestorNome: string
  tabela: TabelaPrecificacao
}) {
  const router = useRouter()
  const [ativa, setAtiva] = useState<NavId>('servicos')
  const [salvando, iniciar] = useTransition()
  const [confirmandoQueda, setConfirmandoQueda] = useState(false)
  /** Onde o último erro de gravação aconteceu, para a tela apontar. */
  const [erroDaSecao, setErroDaSecao] = useState<{
    secao: string
    campo?: string
    mensagem: string
    conflito?: boolean
  } | null>(null)

  const salvo = useMemo(() => rascunhoDaTabela(tabela), [tabela])
  const [rascunho, setRascunho] = useState<RascunhoPrecificacao>(salvo)
  const [respostas, setRespostas] = useState<RespostasPrecificacao>(() =>
    respostasIniciais(tabela),
  )

  // A tabela como ficaria se tudo fosse salvo agora. Só a trilha e os textos de
  // apoio a consultam; o banco continua vendo apenas o que o botão manda.
  const simulada = useMemo(
    () => aplicarRascunho(tabela, rascunho),
    [tabela, rascunho],
  )
  const pendentes = useMemo(
    () => SECOES_RASCUNHO.filter((secao) => secaoAlterada(rascunho, salvo, secao)),
    [rascunho, salvo],
  )

  function invalido(valores: number[]) {
    return valores.some((v) => !Number.isFinite(v))
  }

  /** Monta o conjunto de uma seção na unidade que a action espera. */
  function enviar(secao: SecaoRascunho): Promise<ResultadoDaGravacao> {
    if (secao === 'precos_base') {
      const precos = tabela.precosBase.map((p) => ({
        grupo: p.grupo,
        regime: p.regime,
        valorReais: paraNumero(rascunho.precosBase[chaveDoPreco(p.grupo, p.regime)] ?? ''),
      }))
      const multiplicador = paraNumero(rascunho.acrescimoConsultiva)
      if (invalido([...precos.map((p) => p.valorReais), multiplicador])) {
        return Promise.resolve({ sucesso: false, mensagem: 'Preços-base: valor inválido.' })
      }
      return salvarPrecosBase({
        impressao: impressaoDaSecao(tabela, 'precos_base'),
        precos,
        acrescimoConsultiva: multiplicadorParaPercentual(multiplicador),
      })
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
      if (invalido(faixas.map((f) => f.valorReais))) {
        return Promise.resolve({ sucesso: false, mensagem: 'Faixas: valor inválido.' })
      }
      return salvarFaixas({
        impressao: impressaoDaSecao(tabela, secao),
        tipo: secao,
        faixas,
      })
    }

    if (secao === 'atividade' || secao === 'atendimento' || secao === 'rotina') {
      const opcoes = (tabela.dimensoes.find((d) => d.codigo === secao)?.opcoes ?? [])
        .filter((o) => o.multiplicadorMilesimos !== null)
        .map((o) => ({
          codigo: o.codigo,
          acrescimoPercentual: multiplicadorParaPercentual(
            paraNumero(rascunho.fatores[chaveDoFator(secao, o.codigo)] ?? ''),
          ),
        }))
      if (invalido(opcoes.map((o) => o.acrescimoPercentual))) {
        return Promise.resolve({
          sucesso: false,
          mensagem: 'Multiplicadores: valor inválido.',
        })
      }
      return salvarFatores({
        impressao: impressaoDaSecao(tabela, `fatores:${secao}`),
        dimensao: secao,
        opcoes,
      })
    }

    if (secao === 'adicionais') {
      const adicionais = tabela.adicionais.map((a) => ({
        codigo: a.codigo,
        valorReais: paraNumero(rascunho.adicionais[a.codigo]?.valor ?? ''),
        ativo: rascunho.adicionais[a.codigo]?.ativo ?? a.ativo,
      }))
      if (invalido(adicionais.map((a) => a.valorReais))) {
        return Promise.resolve({ sucesso: false, mensagem: 'Adicionais: valor inválido.' })
      }
      return salvarAdicionais({
        impressao: impressaoDaSecao(tabela, 'adicionais'),
        adicionais,
      })
    }

    const descontos = tabela.descontos.map((d) => ({
      codigo: d.codigo,
      percentual: paraNumero(rascunho.descontos[d.codigo] ?? ''),
    }))
    if (invalido(descontos.map((d) => d.percentual))) {
      return Promise.resolve({ sucesso: false, mensagem: 'Descontos: valor inválido.' })
    }
    return salvarDescontos({
      impressao: impressaoDaSecao(tabela, 'descontos'),
      descontos,
    })
  }

  const ROTULO_DA_SECAO: Record<SecaoRascunho, string> = {
    precos_base: 'Preços-base',
    funcionarios: 'Funcionários',
    notas_fiscais: 'Notas fiscais',
    faturamento: 'Faturamento',
    atividade: 'Ramo da empresa',
    atendimento: 'Atendimento',
    rotina: 'Rotina',
    adicionais: 'Adicionais',
    descontos: 'Descontos',
  }

  // O tamanho comercial do que está prestes a ir ao ar. Serve só para decidir
  // se a publicação pede uma segunda confirmação.
  const impacto = useMemo(
    () => impactoDaAlteracao(tabela, simulada),
    [tabela, simulada],
  )

  /**
   * Publica os conjuntos alterados, um por seção.
   *
   * O rascunho **não** é descartado quando algo falha: o Gestor precisa do que
   * digitou para corrigir. Só depois de tudo passar a página é recarregada,
   * e aí o rascunho volta a espelhar o que ficou gravado.
   */
  function publicar() {
    if (pendentes.length === 0) return
    setConfirmandoQueda(false)
    setErroDaSecao(null)

    iniciar(async () => {
      for (const secao of pendentes) {
        const resultado = await enviar(secao)
        if (!resultado.sucesso) {
          setErroDaSecao({
            secao: resultado.secao ?? secao,
            campo: resultado.campo,
            mensagem: resultado.mensagem,
            conflito: resultado.conflito,
          })
          toast.error(`${ROTULO_DA_SECAO[secao]}: ${resultado.mensagem}`)
          // Para na primeira recusa: seguir gravando as outras deixaria a
          // configuração meio nova e meio velha, que é o oposto do que a
          // transação por seção existe para evitar.
          return
        }
      }
      toast.success('Alterações salvas.')
      router.refresh()
    })
  }

  function pedirPublicacao() {
    if (pendentes.length === 0) return
    if (impacto.exigeConfirmacao) {
      setConfirmandoQueda(true)
      return
    }
    publicar()
  }

  const comum = { tabela, simulada, rascunho, alterar: setRascunho }
  const focoAtual = FOCO_DA_AREA[ativa]
  const regimeAtual = simulada.dimensoes
    .find((d) => d.codigo === 'regime')
    ?.opcoes.find((o) => o.codigo === respostas.regime)?.rotulo
  const ramoAtual = simulada.dimensoes
    .find((d) => d.codigo === 'atividade')
    ?.opcoes.find((o) => o.codigo === respostas.atividades[0])?.rotulo
  const notasAtual = simulada.faixas.find(
    (f) => f.tipo === 'notas_fiscais' && f.codigo === respostas.notasFiscais,
  )?.rotulo
  const cenario = `Perfil: ${regimeAtual} · ${ramoAtual} · ${respostas.funcionarios} funcionários · ${notasAtual} notas/mês`

  return (
    <div className="-mx-1">
      <header className="sticky top-0 z-20 -mx-4 border-b border-border/70 bg-card/85 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BadgeDollarSign className="size-5" />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">
                Precificação · {gestorNome}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Configuração da página de preços
              </p>
            </div>
            <Badge
              variant="outline"
              className={`ml-2 hidden text-[11px] sm:inline-flex ${
                pendentes.length > 0 ? 'border-primary/50 text-primary' : 'border-border/80'
              }`}
            >
              {pendentes.length > 0 ? 'Rascunho' : 'Publicado'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              disabled={pendentes.length === 0 || salvando}
              onClick={() => setRascunho(salvo)}
            >
              <RotateCcw /> Descartar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/precos" target="_blank" rel="noreferrer">
                <Eye /> Pré-visualizar
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={pedirPublicacao}
              disabled={pendentes.length === 0 || salvando}
            >
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Publicar
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 py-6 xl:gap-8">
        <IndiceDeSecoes
          ativa={ativa}
          onSelecionar={setAtiva}
          pendenteEm={(id) => SECOES_DA_AREA[id].some((s) => pendentes.includes(s))}
          pendentes={pendentes.length}
        />

        <main className="min-w-0 flex-1 space-y-6 pb-16">
          <NavegacaoCompacta ativa={ativa} onSelecionar={setAtiva} />

          {erroDaSecao ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-destructive">
                {erroDaSecao.conflito
                  ? 'Estes valores mudaram em outra sessão'
                  : `Não foi possível salvar ${
                      ROTULO_DA_SECAO[erroDaSecao.secao as SecaoRascunho] ??
                      'esta seção'
                    }`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {erroDaSecao.mensagem}
                {erroDaSecao.campo ? ` (campo: ${erroDaSecao.campo})` : ''}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {erroDaSecao.conflito ? (
                  <Button size="sm" variant="outline" onClick={() => router.refresh()}>
                    Recarregar a configuração atual
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setErroDaSecao(null)}>
                  Entendi
                </Button>
              </div>
            </div>
          ) : null}
          {ativa === 'servicos' && <SecaoServicos {...comum} />}
          {ativa === 'perfil' && <SecaoPerfil {...comum} />}
          {ativa === 'faixas' && <SecaoFaixas {...comum} />}
          {ativa === 'atendimento' && <SecaoAtendimento {...comum} />}
          {ativa === 'adicionais' && <SecaoAdicionais {...comum} />}
          {ativa === 'planos' && <SecaoPlanos {...comum} />}
          {ativa === 'comparativo' && <SecaoComparativo />}
          {ativa === 'textos' && <SecaoTextos />}

          {/* Abaixo de xl a trilha desce para o fim da coluna, que é onde cabe
              sem espremer o formulário. */}
          <div className="xl:hidden">
            <PrevisaoLateral
              prefixo="movel"
              tabela={simulada}
              respostas={respostas}
              onRespostas={setRespostas}
              servicoEmFoco={focoAtual}
              cenario={cenario}
            />
          </div>
        </main>

        <aside
          aria-label="Simulação de preço"
          className="hidden w-72 shrink-0 xl:block"
        >
          <PrevisaoLateral
            prefixo="lateral"
            tabela={simulada}
            respostas={respostas}
            onRespostas={setRespostas}
            servicoEmFoco={focoAtual}
            cenario={cenario}
          />
        </aside>
      </div>

      <AlertDialog open={confirmandoQueda} onOpenChange={setConfirmandoQueda}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Esta alteração reduz bastante os preços da vitrine
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  No perfil de referência da página de preços, a queda chega a{' '}
                  <strong className="text-foreground">
                    {impacto.maiorQuedaPercentual}%
                  </strong>
                  . Confira antes de publicar:
                </p>
                <ul className="space-y-1">
                  {impacto.quedas.slice(0, 4).map((queda) => (
                    <li key={queda.servico} className="flex justify-between gap-3">
                      <span className="truncate">{queda.nome}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatarCentavos(queda.de)} → {formatarCentavos(queda.para)}{' '}
                        <span className="text-destructive">−{queda.queda}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={publicar}>
              Publicar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** A coluna de navegação do protótipo: 15rem, fixa, uma seção acesa por vez. */
function IndiceDeSecoes({
  ativa,
  onSelecionar,
  pendenteEm,
  pendentes,
}: {
  ativa: NavId
  onSelecionar: (id: NavId) => void
  pendenteEm: (id: NavId) => boolean
  pendentes: number
}) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <nav aria-label="Seções da precificação" className="sticky top-20 space-y-1">
        {NAV.map((item) => {
          const Icone: LucideIcon = item.icone
          const acesa = item.id === ativa
          return (
            <button
              key={item.id}
              type="button"
              aria-current={acesa ? 'page' : undefined}
              onClick={() => onSelecionar(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                acesa
                  ? 'bg-accent font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <Icone className={`size-4 shrink-0 ${acesa ? 'text-primary' : ''}`} />
              <span className="truncate">{item.rotulo}</span>
              {pendenteEm(item.id) ? (
                <span
                  aria-label="alterações não salvas"
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
                />
              ) : acesa ? (
                <ChevronRight className="ml-auto size-4 text-primary" />
              ) : null}
            </button>
          )
        })}
        <Separator className="my-4" />
        <div className="rounded-lg border border-border/70 bg-card p-3">
          <p className="text-xs font-semibold text-foreground">
            Conectado ao motor real
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {pendentes > 0
              ? `${pendentes} ${pendentes === 1 ? 'bloco alterado' : 'blocos alterados'} — a simulação já reflete o rascunho. Publique para valer na página de preços.`
              : 'Os valores desta tela alimentam a página pública de preços pelo mesmo cálculo.'}
          </p>
        </div>
      </nav>
    </aside>
  )
}

/** A mesma navegação, rolando na horizontal, para telas sem espaço à esquerda. */
function NavegacaoCompacta({
  ativa,
  onSelecionar,
}: {
  ativa: NavId
  onSelecionar: (id: NavId) => void
}) {
  return (
    <nav
      aria-label="Seções da precificação"
      className="-mx-1 overflow-x-auto px-1 pb-1 lg:hidden"
    >
      <div className="flex w-max gap-1">
        {NAV.map((item) => {
          const Icone: LucideIcon = item.icone
          const acesa = item.id === ativa
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelecionar(item.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                acesa
                  ? 'bg-accent font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent/60'
              }`}
            >
              <Icone className={`size-4 ${acesa ? 'text-primary' : ''}`} />
              {item.rotulo}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
