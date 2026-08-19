/**
 * Vocabulário da avaliação do Atendimento.
 *
 * Fechado em constantes para que a faixa da nota, o teto do comentário e o
 * número de cards públicos não variem conforme o arquivo que os aplica — o
 * formulário do Cliente, o Zod da action e o CHECK do banco falam da mesma
 * escala porque leem daqui.
 */

export const NOTA_MINIMA = 1
export const NOTA_MAXIMA = 5

/** As cinco estrelas, na ordem em que a tela as desenha. */
export const NOTAS_POSSIVEIS = [1, 2, 3, 4, 5] as const
export type NotaAvaliacao = (typeof NOTAS_POSSIVEIS)[number]

/**
 * Teto do comentário.
 *
 * Menor que o do Protocolo de propósito: avaliação é um recado curto que vai
 * para um card público de duas colunas, não uma manifestação formal. Um texto
 * de oito mil caracteres quebraria o layout aprovado antes de ser lido.
 */
export const TAMANHO_MAXIMO_COMENTARIO = 1000

/**
 * Quantos comentários o perfil público mostra.
 *
 * Quatro porque o bloco aprovado é um `grid md:grid-cols-2`: quatro preenchem
 * duas linhas inteiras e mantêm a seção do tamanho que ela tem hoje. Passar
 * disso exigiria rolagem, carrossel ou paginação — coisas que esta etapa não
 * deve inventar. As mais recentes vêm primeiro.
 */
export const LIMITE_AVALIACOES_PUBLICAS = 4

/** Status do Atendimento que aceita avaliação. Só existe um. */
export const STATUS_QUE_PERMITE_AVALIAR = 'concluido' as const

/**
 * Motivos de recusa, para a action traduzir em mensagem.
 *
 * Nomes de domínio e não frases: a mesma recusa é dita de um jeito no portal do
 * Cliente e poderia ser dita de outro em qualquer superfície futura.
 */
export type MotivoRecusaAvaliacao =
  | 'sem-acesso'
  | 'nao-encontrado'
  | 'nao-concluido'
  | 'nota-invalida'
