/**
 * Modelo comercial do profissional contábil (`perfis_profissionais.modelo_contratacao`).
 *
 * Arquivo puro (sem banco): usado por card, perfil público, Admin e servidor.
 * Só vale para `tipo_profissional = 'contabilidade'` — advogado segue o modelo
 * Perfil Essencial/Pro, que é outra regra.
 */

export const TIPO_PROFISSIONAL_COM_MODELO = 'contabilidade'

export const MODELOS_CONTRATACAO = ['vincis', 'autonomo'] as const
export type ModeloContratacao = (typeof MODELOS_CONTRATACAO)[number]

/**
 * Textos aprovados. "Contratação pela Vincis" fala de como o cliente contrata
 * e paga — não de vínculo empregatício (nunca "funcionário"/"equipe Vincis").
 */
export const ROTULO_MODELO_CONTRATACAO: Record<ModeloContratacao, { selo: string; descricao: string }> = {
  vincis: {
    selo: 'Contratação pela Vincis',
    descricao: 'Pagamento e contratação intermediados pela Vincis.',
  },
  autonomo: {
    selo: 'Autônomo',
    descricao: 'Você negocia e paga diretamente ao profissional.',
  },
}

/** Rótulos das opções no Admin (o "não definido" só existe lá). */
export const OPCOES_MODELO_ADMIN: Record<ModeloContratacao | 'nao_definido', string> = {
  vincis: 'Contratação pela Vincis',
  autonomo: 'Autônomo',
  nao_definido: 'Não definido',
}

export function ehModeloContratacao(valor: unknown): valor is ModeloContratacao {
  return typeof valor === 'string' && (MODELOS_CONTRATACAO as readonly string[]).includes(valor)
}

/**
 * O modelo que pode ser mostrado ao público: só contabilidade, só valor
 * definido. Qualquer outra combinação vira `null` — nunca um selo inventado.
 */
export function modeloContratacaoPublico(
  tipoProfissional: string | null | undefined,
  modelo: string | null | undefined,
): ModeloContratacao | null {
  return tipoProfissional === TIPO_PROFISSIONAL_COM_MODELO && ehModeloContratacao(modelo) ? modelo : null
}

/**
 * Por que o Autônomo não tem contratação recorrente pela Vincis — e onde isso
 * é garantido:
 *
 * - a tabela "Contabilidade mensal" do profissional (`/perfil-profissional/precos`)
 *   já é **fluxo direto** para qualquer contador: "Tenho interesse" abre uma
 *   conversa (`origem = 'simulacao_preco'`) que não tem proposta, acordo, Pix
 *   nem assinatura (`oportunidades/lib/fluxo-direto.ts`);
 * - os planos mensal/semestral/anual são da **própria Vincis** (`/precos`,
 *   tabela `assinaturas`, `prestador_id` nulo — não existe hoje alocação de
 *   prestador a esses planos). Quando a alocação existir, ela só pode aceitar
 *   prestador com `modelo_contratacao = 'vincis'`.
 */
