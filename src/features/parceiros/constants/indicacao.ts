import {
  CATEGORIA_OPORTUNIDADE,
  categoriaValida,
} from '@/features/oportunidades/constants/oportunidade'

/**
 * Vocabulário do ciclo de indicação.
 *
 * Fica separado do mock do painel de propósito: daqui para a frente esta parte
 * do módulo tem dado real, e misturar as duas listas faria alguém reaproveitar
 * um rótulo de demonstração como regra.
 */

/** Nome do cookie do visitante. First-party, opaco. */
export const COOKIE_INDICACAO = 'vincis_indicacao'

/**
 * Validade técnica do identificador do navegador, em dias.
 *
 * **Não é o prazo da indicação.** O prazo comercial — quanto tempo uma
 * indicação continua valendo, por serviço, definido pelo Gestor — ainda não
 * existe e viverá em outro lugar, no registro do ciclo e não no navegador.
 * Este número responde a outra pergunta: por quanto tempo o navegador continua
 * sendo reconhecido como o mesmo.
 *
 * Noventa dias porque o ciclo real de decisão de um serviço contábil ou
 * jurídico é medido em semanas, não em horas, e porque prazo curto demais
 * transformaria "esqueci de me cadastrar no fim de semana" em indicação
 * perdida. É deliberadamente maior que qualquer janela comercial que venha a
 * ser configurada: o cookie precisa sobreviver ao prazo, não o contrário.
 */
export const DIAS_COOKIE_INDICACAO = 90

/** Por onde a indicação entrou. Hoje só existe o link geral. */
export const ORIGENS_INDICACAO = ['link_indicacao'] as const
export type OrigemIndicacao = (typeof ORIGENS_INDICACAO)[number]

/**
 * Os fatos que o histórico sabe registrar.
 *
 * Três, porque três acontecem. Interesse por serviço, substituição comercial,
 * contratação e expiração entram junto com as fatias que os produzem — cada um
 * é uma linha aqui e um `case` em `rotuloDoEvento`, sem migração: `tipo` é
 * texto e `dados` é `jsonb`.
 */
export const TIPOS_EVENTO_INDICACAO = [
  'acessou_link',
  'cadastrou_conta',
  'demonstrou_interesse',
  'contratou_servico',
] as const
export type TipoEventoIndicacao = (typeof TIPOS_EVENTO_INDICACAO)[number]

/** Como cada fato é lido na tela do parceiro. */
export function rotuloDoEvento(tipo: string): string {
  switch (tipo) {
    case 'acessou_link':
      return 'Acessou pelo seu link'
    case 'cadastrou_conta':
      return 'Criou a conta na Vincis'
    case 'demonstrou_interesse':
      return 'Demonstrou interesse em um serviço'
    case 'contratou_servico':
      return 'Contratou um serviço'
    default:
      // Tipo gravado por uma versão mais nova do que a que está lendo. Melhor
      // uma linha honesta e sem graça do que a tela quebrar no histórico.
      return 'Evento registrado'
  }
}

/**
 * A segunda linha do evento, quando ele carrega alguma.
 *
 * Lê a carga própria do tipo (`parceiro_eventos.dados`), sem join: o histórico
 * do parceiro não deve depender de alcançar a tabela de oportunidades, que é de
 * outro domínio e tem regras de acesso próprias.
 */
export function detalheDoEvento(
  tipo: string,
  dados: unknown,
): string | null {
  if (tipo !== 'demonstrou_interesse' && tipo !== 'contratou_servico') {
    return null
  }
  const servico =
    typeof dados === 'object' && dados !== null && 'servico' in dados
      ? (dados as { servico?: unknown }).servico
      : null
  return typeof servico === 'string' && servico ? rotuloDoServico(servico) : null
}

/**
 * Categoria como o cliente a lê.
 *
 * O rótulo vem do vocabulário da própria oportunidade, e não de uma cópia aqui:
 * duas listas para a mesma taxonomia divergiriam na primeira categoria nova.
 * O módulo importado é puro — sem banco, sem React —, então serve aos dois
 * lados sem arrastar nada.
 */
function rotuloDoServico(codigo: string): string {
  return categoriaValida(codigo) ? CATEGORIA_OPORTUNIDADE[codigo].rotulo : codigo
}
