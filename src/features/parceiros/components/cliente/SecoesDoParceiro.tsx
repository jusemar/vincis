import { CabecalhoSecao } from '@/features/portal-cliente/components/ui/primitivos'
import type { LinkDoParceiro } from '../../lib/link-de-indicacao'
import type { IndicacaoDoParceiro } from '../../queries/listar-indicacoes'
import type {
  ComissaoDoParceiro,
  ResumoDeComissoes,
  SaqueDoParceiro,
} from '../../queries/listar-comissoes'
import { ComissoesDoParceiro } from './ComissoesDoParceiro'
import { CentralDeCompartilhamento } from './CentralDeCompartilhamento'
import type { DestinoProfissional } from '../../queries/listar-destinos-profissionais'
import { rotuloDaSecao } from '../../constants/navegacao'
import { SITUACAO_PARCEIRO } from '../../constants/mock-painel'
import { CardDeNiveis } from './CardDeNiveis'
import { IndicacoesRecebidas } from './IndicacoesRecebidas'
import { PainelDoParceiro } from './PainelDoParceiro'
import { SecaoEmPreparo } from './SecaoEmPreparo'
import {
  AcademiaVincis,
  CampanhasAtivas,
  ComunidadeVincis,
  CupomDoParceiro,
  FunilDeConversao,
  MateriaisDeDivulgacao,
  RankingSemanal,
  SistemaHibrido,
} from './BlocosDoParceiro'

/**
 * O conteúdo de cada seção do módulo.
 *
 * O Dashboard é a página inteira, com todos os blocos na ordem aprovada. As
 * demais seções **reaproveitam os mesmos blocos**, recortados por assunto — é o
 * que faz o menu ser navegação de verdade em vez de dezessete telas vazias, sem
 * escrever nenhum componente novo. Onde não há bloco correspondente, a seção
 * declara o que virá ali.
 *
 * Componente de servidor: quem tem interação (gráfico, níveis, botões de
 * copiar) já é cliente por conta própria.
 */
function Titulo({ secao, descricao }: { secao: string; descricao: string }) {
  return (
    <CabecalhoSecao
      contexto="Programa de Parceiros"
      titulo={rotuloDaSecao(secao)}
      descricao={descricao}
    />
  )
}

export function SecaoDoParceiro({
  secao,
  nome,
  link,
  indicacoes,
  comissoes,
  saques,
  resumoComissoes,
  baseDoSite,
  profissionais,
}: {
  secao: string
  nome: string
  /** Link real do parceiro; `null` enquanto a conta não ativou. */
  link: LinkDoParceiro | null
  /** Acessos reais pelo link. Só a seção de Leads consome. */
  indicacoes: IndicacaoDoParceiro[]
  comissoes: ComissaoDoParceiro[]
  saques: SaqueDoParceiro[]
  resumoComissoes: ResumoDeComissoes
  baseDoSite: string
  profissionais: DestinoProfissional[]
}) {
  if (secao === 'dashboard') return <PainelDoParceiro nome={nome} link={link} />

  return (
    <div className="space-y-6">
      {conteudoDaSecao(
        secao,
        link,
        indicacoes,
        comissoes,
        saques,
        resumoComissoes,
        baseDoSite,
        profissionais,
      )}
      <p className="pb-2 text-center text-xs text-muted-foreground">
        Prévia visual do Programa de Parceiros. Os números desta tela são
        demonstrativos.
      </p>
    </div>
  )
}

function conteudoDaSecao(
  secao: string,
  link: LinkDoParceiro | null,
  indicacoes: IndicacaoDoParceiro[],
  comissoes: ComissaoDoParceiro[],
  saques: SaqueDoParceiro[],
  resumoComissoes: ResumoDeComissoes,
  baseDoSite: string,
  profissionais: DestinoProfissional[],
) {
  switch (secao) {
    case 'meu-link':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Escolha para onde o seu link leva e compartilhe. O código é sempre o mesmo."
          />
          <CentralDeCompartilhamento
            link={link}
            base={baseDoSite}
            profissionais={profissionais}
          />
        </>
      )

    case 'cupons':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="O cupom que você compartilha e o desconto que ele dá a quem usar."
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <CupomDoParceiro />
            <div className="lg:col-span-2 lg:h-full">
              <SistemaHibrido />
            </div>
          </div>
        </>
      )

    case 'leads':
      /*
        Seção inteiramente real: banco, e nada além dele.

        A prévia simulada saiu daqui quando a jornada real passou a contar a
        história completa — acesso, cadastro, interesse e contratação, cada
        negócio com nome, valor e prazo próprios. Manter uma maquete embaixo de
        dados verdadeiros só criava a dúvida sobre qual dos dois olhar.
      */
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Quem chegou pela sua indicação, com a jornada completa de cada pessoa."
          />
          <IndicacoesRecebidas indicacoes={indicacoes} />
        </>
      )

    case 'materiais':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Artes, scripts e vídeos prontos para você divulgar."
          />
          <MateriaisDeDivulgacao />
        </>
      )

    case 'clientes-indicados':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Quem você indicou: ativos, consultorias contratadas e a carteira recorrente."
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <CardDeNiveis
              nivel={SITUACAO_PARCEIRO.nivel}
              recorrentesAtivos={SITUACAO_PARCEIRO.recorrentesAtivos}
              emProtecao={SITUACAO_PARCEIRO.emProtecao}
            />
            <div className="lg:col-span-2 lg:h-full">
              <FunilDeConversao />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SecaoEmPreparo
              titulo="Ativos"
              descricao="Aqui ficará a carteira, com serviço contratado e data de entrada."
            />
            <SecaoEmPreparo
              titulo="Consultorias"
              descricao="Aqui ficarão as consultorias contratadas por quem você indicou."
            />
            <SecaoEmPreparo
              titulo="Recorrentes"
              descricao="Aqui ficará cada plano recorrente ativo, com o percentual aplicado."
            />
          </div>
        </>
      )

    case 'comissoes':
      /*
        Uma experiência só, e ela é a financeira.

        Previsão de renda e sistema híbrido saíram daqui: falam de recorrência,
        que não existe, e ficavam ao lado de dinheiro real — duas telas
        disputando a mesma pergunta. O que ainda não tem backend (saldo sacável,
        método de recebimento, histórico de saques) vive dentro da própria
        página, marcado como demonstração e sem entrar em soma nenhuma.
      */
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Acompanhe quanto você gerou, o que aguarda conclusão e a origem exata de cada valor."
          />
          <ComissoesDoParceiro
            comissoes={comissoes}
            resumo={resumoComissoes}
            saques={saques}
          />
        </>
      )

    case 'niveis':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Bronze, Prata e Ouro: o que cada nível paga e o que ele exige."
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <CardDeNiveis
              nivel={SITUACAO_PARCEIRO.nivel}
              recorrentesAtivos={SITUACAO_PARCEIRO.recorrentesAtivos}
              emProtecao={SITUACAO_PARCEIRO.emProtecao}
            />
            <div className="lg:col-span-2 lg:h-full">
              <SistemaHibrido />
            </div>
          </div>
        </>
      )

    case 'campanhas':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Ações por tempo limitado para acelerar a sua carteira."
          />
          <CampanhasAtivas />
        </>
      )

    case 'ranking':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Como você está em relação aos outros parceiros nesta semana."
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <RankingSemanal />
            <div className="lg:col-span-2 lg:h-full">
              <FunilDeConversao />
            </div>
          </div>
        </>
      )

    case 'comunidade':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="O que os outros parceiros estão fazendo agora."
          />
          <div className="grid items-stretch gap-4 lg:grid-cols-3">
            <ComunidadeVincis />
            <div className="lg:col-span-2 lg:h-full">
              <AcademiaVincis />
            </div>
          </div>
        </>
      )

    case 'academia':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Trilhas curtas para você indicar melhor."
          />
          <AcademiaVincis />
        </>
      )

    case 'configuracoes':
      return (
        <>
          <Titulo
            secao={secao}
            descricao="Dados de recebimento, preferências de aviso e adesão ao programa."
          />
          <SecaoEmPreparo
            titulo="Configurações do parceiro"
            descricao="Aqui ficarão a chave de recebimento, as preferências de aviso e os termos do programa."
          />
        </>
      )

    default:
      return <PainelDoParceiro nome="" link={link} />
  }
}
