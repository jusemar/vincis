import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { AtendimentoDoClienteDTO } from '@/features/atendimentos/types/atendimento'
import type { ConsultoriaDoClienteDTO } from '@/features/consultorias/types/agendamento'
import { rotuloDaCategoria } from '@/features/oportunidades/constants/oportunidade'
import type { OportunidadeDoClienteDTO } from '@/features/oportunidades/types/oportunidade'
import { separarNomeDeTratamento } from '@/features/usuarios/lib/nome-de-tratamento'
import type { ContratacaoCliente } from '../../types/portal'
import {
  formatarDataCurta,
  montarAtividade,
  montarIndicadores,
  montarItensDeAtencao,
  resumoDoAtendimento,
} from '../../lib/painel-do-cliente'
import { ConsultoriasDoCliente } from './ConsultoriasDoCliente'
import {
  CabecalhoSecao,
  Indicadores,
  LinhaDoTempo,
  PainelVazio,
  Pilula,
  Progresso,
  Superficie,
  TituloDeBloco,
} from '../ui/primitivos'

/**
 * Abertura da Área do Cliente.
 *
 * Componente de **servidor**: não tem estado nem interação própria, e por isso
 * não precisa atravessar a fronteira para o navegador. Ele responde, de cima
 * para baixo, a três perguntas na ordem em que importam: o que precisa de mim,
 * o que está em andamento e o que aconteceu por último.
 *
 * O que não entra aqui, deliberadamente: métrica sem consequência. Não existe
 * gráfico, meta nem série histórica — nada disso muda uma decisão de quem
 * contratou um serviço.
 */
/** Mesma leitura de preço que o portal já usava na lista de serviços. */
function valorDaContratacao(modeloPreco: string, valorCentavos: number | null) {
  if (modeloPreco === 'sob_orcamento' || valorCentavos === null) {
    return 'Sob orçamento'
  }
  const valor = (valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return modeloPreco === 'por_hora' ? `${valor}/h` : valor
}

export function VisaoGeralCliente({
  nome,
  oportunidades,
  atendimentos,
  consultorias = [],
  contratacoes = [],
}: {
  nome: string
  oportunidades: OportunidadeDoClienteDTO[]
  atendimentos: AtendimentoDoClienteDTO[]
  /**
   * Consultorias com hora marcada.
   *
   * Vêm separadas dos Atendimentos porque respondem a outra pergunta — *quando
   * é a próxima?* —, embora cada uma **seja** um Atendimento. O bloco fica logo
   * abaixo do que precisa de atenção: é compromisso com hora, e hora marcada
   * envelhece.
   */
  consultorias?: ConsultoriaDoClienteDTO[]
  /**
   * Serviços contratados diretamente do catálogo.
   *
   * Continuam aqui, no mesmo lugar em que o Cliente já os encontrava, porque
   * são a face comercial do que ele acompanha em Atendimentos — e o valor
   * contratado não aparece em nenhuma outra tela do portal.
   */
  contratacoes?: ContratacaoCliente[]
}) {
  const { primeiroNome, tratamentoComNome } = separarNomeDeTratamento(nome)
  const atencao = montarItensDeAtencao({ oportunidades, atendimentos })
  const indicadores = montarIndicadores({ oportunidades, atendimentos })
  const atividade = montarAtividade({ oportunidades, atendimentos })

  const ativos = atendimentos.filter(
    (item) => !['concluido', 'recusado', 'cancelado'].includes(item.status),
  )
  const solicitacoesAbertas = oportunidades.filter((item) => item.ativa)

  return (
    <div className="space-y-8">
      <CabecalhoSecao
        contexto="Área do cliente"
        titulo={`Bom te ver, ${tratamentoComNome ?? primeiroNome ?? 'por aqui'}.`}
        descricao={
          atencao.length
            ? `Você tem ${atencao.length} ${atencao.length === 1 ? 'item esperando' : 'itens esperando'} sua decisão.`
            : 'Nada esperando por você agora. Abaixo, o andamento dos seus serviços.'
        }
      />

      <Indicadores itens={indicadores} />

      <section>
        <TituloDeBloco
          titulo="Precisa da sua atenção"
          apoio={atencao.length ? `${atencao.length}` : undefined}
        />
        {atencao.length === 0 ? (
          <PainelVazio
            titulo="Tudo em dia"
            descricao="Nenhuma proposta, resposta ou avaliação esperando por você neste momento."
          />
        ) : (
          <Superficie className="divide-y overflow-hidden">
            {atencao.map((item) => (
              <Link
                key={item.id}
                href={`/cliente?aba=${item.aba}`}
                className="flex flex-col gap-2 p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <Pilula rotulo={item.etiqueta} tom={item.tom} />
                  <p className="mt-2 text-sm font-semibold">{item.titulo}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {item.detalhe}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
                  {item.acao}
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            ))}
          </Superficie>
        )}
      </section>

      <ConsultoriasDoCliente consultorias={consultorias} />

      {/*
        `min-w-0` nas duas colunas.

        Uma coluna de grade tem largura mínima `auto`, que é o *min-content* do
        que está dentro dela — e uma coluna só estica a grade inteira para
        caber. No celular de 320px isso empurrava a página para 347px de
        largura e criava rolagem horizontal em toda a Visão Geral, não só neste
        bloco. `min-w-0` devolve a decisão ao contêiner: quem corta o texto
        passa a ser o `truncate` de cada card, como já estava previsto.
      */}
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="min-w-0">
          <TituloDeBloco
            titulo="Serviços em andamento"
            acao={
              <Link
                href="/cliente?aba=atendimentos"
                className="alvo-toque-h -mr-2 inline-flex items-center px-2 text-xs font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            }
          />
          {ativos.length === 0 ? (
            <PainelVazio
              titulo="Nenhum serviço em andamento"
              descricao="Quando você contratar um profissional, o acompanhamento aparece aqui com protocolo, prazo e progresso."
            />
          ) : (
            <Superficie className="divide-y overflow-hidden">
              {ativos.slice(0, 4).map((atendimento) => {
                const resumo = resumoDoAtendimento(atendimento)
                return (
                  <Link
                    key={atendimento.id}
                    href={`/cliente?aba=atendimentos&atendimento=${atendimento.id}`}
                    className="block p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs text-muted-foreground">
                        {atendimento.protocolo}
                      </p>
                      <Pilula rotulo={resumo.statusRotulo} tom={resumo.tom} />
                    </div>
                    <p className="mt-1.5 text-sm font-semibold">
                      {atendimento.titulo}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {atendimento.prestador.nome}
                      {resumo.prazo ? ` · prazo ${resumo.prazo}` : ''}
                    </p>
                    {resumo.progresso ? (
                      <div className="mt-3">
                        <Progresso
                          percentual={resumo.progresso.percentual}
                          rotulo={`${resumo.progresso.done} de ${resumo.progresso.total} etapas`}
                        />
                      </div>
                    ) : null}
                    {resumo.ultimaAtualizacao ? (
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {resumo.ultimaAtualizacao.descricao}
                      </p>
                    ) : null}
                  </Link>
                )
              })}
            </Superficie>
          )}

          {contratacoes.length > 0 ? (
            <div className="mt-8">
              <TituloDeBloco titulo="Serviços contratados" />
              <Superficie className="divide-y overflow-hidden">
                {contratacoes.slice(0, 4).map((contratacao) => (
                  <div
                    key={contratacao.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {contratacao.nomeServico}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {contratacao.prestadorNome} ·{' '}
                        {formatarDataCurta(contratacao.criadoEm)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-primary">
                      {valorDaContratacao(
                        contratacao.modeloPreco,
                        contratacao.valorCentavos,
                      )}
                    </p>
                  </div>
                ))}
              </Superficie>
            </div>
          ) : null}
        </section>

        <div className="min-w-0 space-y-8">
          <section>
            <TituloDeBloco titulo="Solicitações abertas" />
            {solicitacoesAbertas.length === 0 ? (
              <PainelVazio
                titulo="Sem solicitações abertas"
                descricao="Descreva o que você precisa e receba propostas de profissionais da categoria."
                acao={
                  <Link
                    href="/profissionais"
                    className="alvo-toque-h inline-flex items-center text-sm font-medium text-primary hover:underline"
                  >
                    Solicitar orçamento
                  </Link>
                }
              />
            ) : (
              <Superficie className="divide-y overflow-hidden">
                {solicitacoesAbertas.slice(0, 4).map((oportunidade) => (
                  <Link
                    key={oportunidade.id}
                    href="/cliente?aba=orcamentos"
                    className="block p-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <p className="text-xs text-muted-foreground">
                      {rotuloDaCategoria(oportunidade.categoria)} ·{' '}
                      {oportunidade.abrangencia}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium">
                      {oportunidade.titulo}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {oportunidade.totalPropostas}{' '}
                      {oportunidade.totalPropostas === 1
                        ? 'proposta'
                        : 'propostas'}
                    </p>
                  </Link>
                ))}
              </Superficie>
            )}
          </section>

          <section>
            <TituloDeBloco titulo="Atividade recente" />
            {atividade.length === 0 ? (
              <PainelVazio
                titulo="Ainda sem movimento"
                descricao="O que acontecer nas suas solicitações e serviços aparece aqui."
              />
            ) : (
              <Superficie className="p-5">
                <LinhaDoTempo eventos={atividade} />
              </Superficie>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
