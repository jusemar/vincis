import { separarNomeDeTratamento } from '@/features/usuarios/lib/nome-de-tratamento'
import type { LinkDoParceiro } from '../../lib/link-de-indicacao'
import type { IndicacaoDoParceiro } from '../../queries/listar-indicacoes'
import type {
  ComissaoDoParceiro,
  ResumoDeComissoes,
  SaqueDoParceiro,
} from '../../queries/listar-comissoes'
import type { DestinoProfissional } from '../../queries/listar-destinos-profissionais'
import { secaoValida } from '../../constants/navegacao'
import { SecaoDoParceiro } from './SecoesDoParceiro'

/**
 * O conteúdo da área de Parceiros.
 *
 * **Só o conteúdo**: cabeçalho, menu lateral, largura e navegação mobile vêm do
 * `ShellDoCliente`, que é a mesma moldura das outras áreas do Portal. Antes o
 * módulo trazia moldura própria e entrar nele parecia trocar de sistema.
 *
 * Componente de servidor. A seção chega crua da URL e é validada aqui contra o
 * registro do módulo — uma seção desconhecida cai no Dashboard em vez de
 * deixar a tela vazia.
 */
export function AreaDoParceiro({
  nome,
  secao,
  link,
  indicacoes = [],
  comissoes = [],
  saques = [],
  baseDoSite = '',
  profissionais = [],
  resumoComissoes = {
    totalCentavos: 0,
    geradaCentavos: 0,
    disponivelCentavos: 0,
    pagaCentavos: 0,
    canceladaCentavos: 0,
    negocios: 0,
    reservadoCentavos: 0,
    livreCentavos: 0,
  },
}: {
  nome: string
  /** Valor cru de `?secao=`. */
  secao?: string | null
  /**
   * O link real desta conta, ou `null` quando ela ainda não ativou o programa.
   *
   * Chega pronto da página: quem lê o banco é o servidor da rota, e o conteúdo
   * continua sendo só apresentação.
   */
  link: LinkDoParceiro | null
  /**
   * Acessos reais pelo link, quando a seção aberta precisa deles.
   *
   * Vazio por padrão: só a seção de Leads consome, e carregar o histórico em
   * toda seção faria doze telas pagarem por uma consulta que nenhuma delas usa.
   */
  indicacoes?: IndicacaoDoParceiro[]
  comissoes?: ComissaoDoParceiro[]
  saques?: SaqueDoParceiro[]
  baseDoSite?: string
  profissionais?: DestinoProfissional[]
  resumoComissoes?: ResumoDeComissoes
}) {
  const { primeiroNome, tratamentoComNome } = separarNomeDeTratamento(nome)
  const saudacao = tratamentoComNome ?? primeiroNome ?? 'parceiro'

  return (
    <SecaoDoParceiro
      secao={secaoValida(secao)}
      nome={saudacao}
      link={link}
      indicacoes={indicacoes}
      comissoes={comissoes}
      saques={saques}
      baseDoSite={baseDoSite}
      profissionais={profissionais}
      resumoComissoes={resumoComissoes}
    />
  )
}
