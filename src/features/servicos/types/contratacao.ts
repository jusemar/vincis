import type { CobrancaPixDTO } from '@/features/pagamentos/types/cobranca'
import type { ModeloPreco } from '../schemas/servico'

/**
 * O que a cobrança de um serviço carrega para o momento do pagamento.
 *
 * Gravado pelo servidor ao emitir o Pix e lido pelo efeito depois da
 * confirmação — que roda no webhook, sem sessão e sem cookie.
 */
export type ContextoCobrancaServico = {
  nomeServico: string
  modeloPreco: ModeloPreco
  prazoEstimadoDias: number | null
  /** Recado do Cliente: vira a primeira manifestação do Protocolo. */
  mensagem: string
  /** Cookie de indicação lido na emissão. Atribuição, não credencial. */
  visitanteToken: string | null
  /**
   * Comissão da Vincis vigente na emissão do Pix — o retrato que a contratação
   * guarda. Ausente nas cobranças emitidas antes desta regra.
   */
  comissaoVincis?: { milesimos: number; comissaoCentavos: number; profissionalCentavos: number }
}

/** O resumo que a etapa "Detalhes" mostra — todo ele relido do banco. */
export type ResumoContratacaoServicoDTO = {
  servicoId: string
  nome: string
  descricao: string
  prestadorNome: string
  valorCentavos: number
  prazoEstimadoDias: number | null
}

/**
 * As respostas do fluxo pago de serviço.
 *
 * União discriminada pelo mesmo motivo da consultoria: cada caso leva a tela a
 * um lugar diferente — login, orçamento, agenda, Pix ou Atendimento.
 */
export type ResultadoContratacaoServico =
  | { situacao: 'pronto'; resumo: ResumoContratacaoServicoDTO }
  | { situacao: 'cobranca'; resumo: ResumoContratacaoServicoDTO; cobranca: CobrancaPixDTO }
  | { situacao: 'gerando'; mensagem: string }
  | { situacao: 'ja_contratado'; mensagem: string; protocolo: string | null; atendimentoId: string | null }
  | { situacao: 'requer_orcamento'; mensagem: string }
  | { situacao: 'requer_agenda'; mensagem: string }
  | { situacao: 'precisa_entrar'; mensagem: string }
  | { situacao: 'conta_nao_confirmada'; mensagem: string }
  | { situacao: 'nao_permitido'; mensagem: string }
  | { situacao: 'indisponivel'; mensagem: string }
