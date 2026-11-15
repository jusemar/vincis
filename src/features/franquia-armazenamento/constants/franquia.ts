import {
  ARMAZENAMENTO_EXTRA_BYTES,
  ARMAZENAMENTO_EXTRA_CENTAVOS,
  ROTULO_ARMAZENAMENTO_EXTRA,
} from '@/features/perfil-pro/constants/perfil-pro'

/**
 * Franquia de armazenamento do contador Autônomo.
 *
 * O Autônomo usa a plataforma normalmente — nenhum recurso é bloqueado por ele
 * ser gratuito. O que gera custo de armazenamento consome **uma** franquia
 * única: arquivos dos Atendimentos dele (enviados por ele ou pelos clientes),
 * anexos dos pedidos de orçamento dirigidos a ele e XMLs da Central de
 * Documentos Fiscais dos escritórios de que ele é proprietário.
 *
 * Franquia aprovada: 1 GB, lida de `configuracoes_plataforma` (semeada por
 * migration). Ao esgotar, só **novos** uploads são recusados; nada é apagado.
 *
 * Espaço extra: o mesmo produto do jurídico — "+5 GB — R$ 9,90/mês", mensal,
 * sem renovação automática, recontratável — mas com plano próprio
 * (`autonomo_armazenamento`): as regras de negócio do Perfil Pro jurídico
 * continuam separadas; só o cálculo técnico de vigência é compartilhado.
 *
 * Contadores "Contratação pela Vincis" e "não definido" não têm franquia.
 */
export const CHAVE_FRANQUIA_AUTONOMO = 'autonomo.armazenamento_gratuito_bytes'

export const PLANO_ARMAZENAMENTO_AUTONOMO = 'autonomo_armazenamento'
export const NOME_PLANO_ARMAZENAMENTO_AUTONOMO = 'Armazenamento adicional +5 GB (contador autônomo)'

export const BLOCO_EXTRA_BYTES = ARMAZENAMENTO_EXTRA_BYTES
export const BLOCO_EXTRA_CENTAVOS = ARMAZENAMENTO_EXTRA_CENTAVOS
export const ROTULO_BLOCO_EXTRA = ROTULO_ARMAZENAMENTO_EXTRA

export const MENSAGEM_FRANQUIA_ESGOTADA =
  'O espaço de armazenamento deste profissional acabou. Novos arquivos não podem ser enviados pela Vincis no momento.'
