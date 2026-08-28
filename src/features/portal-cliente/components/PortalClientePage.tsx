import Link from 'next/link'
import { ClipboardList, Headphones, LayoutGrid, UserRound } from 'lucide-react'
import type { AtendimentoDoClienteDTO } from '@/features/atendimentos/types/atendimento'
import type { ConsultoriaDoClienteDTO } from '@/features/consultorias/types/agendamento'
import type { OportunidadeDoClienteDTO } from '@/features/oportunidades/types/oportunidade'
import { PainelDePagamento } from '@/features/pagamentos/components/PainelDePagamento'
import { AtendimentosDoCliente } from './AtendimentosDoCliente'
import { CabecalhoDoPortal } from './CabecalhoDoPortal'
import { MinhaContaCliente } from './secoes/MinhaContaCliente'
import {
  SolicitacoesCliente,
  type FiltroSolicitacoes,
} from './secoes/SolicitacoesCliente'
import { VisaoGeralCliente } from './secoes/VisaoGeralCliente'
import type {
  AbaPortal,
  ContratacaoCliente,
  DadosPortalCliente,
} from '../types/portal'

export type { ContratacaoCliente, DadosPortalCliente } from '../types/portal'

const ABAS = [
  { id: 'visao', rotulo: 'Visão geral', icone: LayoutGrid },
  { id: 'orcamentos', rotulo: 'Orçamentos', icone: ClipboardList },
  { id: 'atendimentos', rotulo: 'Atendimentos', icone: Headphones },
  { id: 'conta', rotulo: 'Minha conta', icone: UserRound },
] as const

/**
 * Área do Cliente.
 *
 * Shell de **servidor**: o cabeçalho e as ações interativas são os únicos
 * pedaços que atravessam para o navegador. Antes a página inteira era um
 * componente de cliente com abas em estado local — o conteúdo só existia depois
 * da hidratação e nenhuma aba tinha endereço próprio.
 *
 * Agora a aba viaja na URL (`?aba=`). Isso resolve três coisas de uma vez: cada
 * área é linkável (o menu do cabeçalho público já aponta para
 * `?aba=conta`), o servidor renderiza só o que aquela aba precisa, e voltar
 * pelo navegador funciona como a pessoa espera.
 */
export function PortalClientePage({
  dados,
  aba = 'visao',
  filtroSolicitacoes = 'todas',
  atendimentoInicial = null,
  pagarOportunidade = null,
  contratacoes = [],
  atendimentos = [],
  consultorias = [],
  oportunidades = [],
}: {
  dados: DadosPortalCliente
  aba?: AbaPortal
  filtroSolicitacoes?: FiltroSolicitacoes
  /** Deep link vindo da Visão Geral para abrir um Atendimento específico. */
  atendimentoInicial?: string | null
  /** Deep link do acordo: abre a tela de pagamento daquela solicitação. */
  pagarOportunidade?: string | null
  contratacoes?: ContratacaoCliente[]
  /** Já chegam filtrados: só os do próprio Cliente, sem nada interno. */
  atendimentos?: AtendimentoDoClienteDTO[]
  /** Consultorias com hora marcada ainda no futuro, da mais próxima em diante. */
  consultorias?: ConsultoriaDoClienteDTO[]
  oportunidades?: OportunidadeDoClienteDTO[]
}) {
  // Só encontra o que já pertence a quem está logado: a lista veio da consulta
  // recortada por dono. Um id de outra pessoa não casa e a aba volta à lista.
  const emPagamento = pagarOportunidade
    ? (oportunidades.find((item) => item.id === pagarOportunidade) ?? null)
    : null

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <CabecalhoDoPortal email={dados.email} />
          <nav
            aria-label="Áreas do portal"
            className="-mx-1 flex gap-1 overflow-x-auto pb-2"
          >
            {ABAS.map((item) => {
              const ativo = item.id === aba
              const Icone = item.icone
              return (
                <Link
                  key={item.id}
                  href={`/cliente?aba=${item.id}`}
                  aria-current={ativo ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    ativo
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icone className="size-4" aria-hidden />
                  {item.rotulo}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {aba === 'visao' ? (
          <VisaoGeralCliente
            nome={dados.nome}
            oportunidades={oportunidades}
            atendimentos={atendimentos}
            consultorias={consultorias}
            contratacoes={contratacoes}
          />
        ) : null}

        {aba === 'orcamentos' ? (
          // `pagar` é um recorte da própria aba de Orçamentos, e não uma quinta
          // área: o pagamento pertence à solicitação, e sair dele devolve para
          // a lista de onde se veio.
          emPagamento ? (
            <PainelDePagamento oportunidade={emPagamento} />
          ) : (
            <SolicitacoesCliente
              oportunidades={oportunidades}
              filtro={filtroSolicitacoes}
            />
          )
        ) : null}

        {aba === 'atendimentos' ? (
          <AtendimentosDoCliente
            atendimentos={atendimentos}
            atendimentoInicial={atendimentoInicial}
          />
        ) : null}

        {aba === 'conta' ? <MinhaContaCliente dados={dados} /> : null}
      </main>
    </div>
  )
}
