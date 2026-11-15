/** As abas de `/precos`. É escolha de vitrine, não conceito de precificação. */
/**
 * A vitrine pública mostra só Contabilidade (Padrão e Consultiva). Assistência
 * Jurídica e o Pacote Empresarial (Contabilidade + Jurídico) saíram da página:
 * o jurídico tem caminho próprio (pedido de orçamento ao advogado) e não é
 * vendido como plano da Vincis. Os serviços continuam na tabela de
 * precificação; só não são oferecidos aqui.
 */
export type ServicoTab = 'consultiva'
